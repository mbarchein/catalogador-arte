/**
 * Ejecuta el detector de bordes REAL del repositorio contra el corpus y dice qué
 * hace con cada fotografía.
 *
 *   python3 scripts/bordes/preparar-corpus.py volcados/20260801-1142
 *   node scripts/bordes/medir.mjs                 # tabla por pantalla
 *   node scripts/bordes/medir.mjs --json          # para diferencias entre ejecuciones
 *
 * Importa `app/src/lib/edgeDetection.ts` tal cual, agrupándolo con el esbuild que
 * ya está instalado: una copia del detector se separaría del original y entonces
 * el banco mediría otra cosa que se parece.
 *
 * Contra qué se compara: el recorte que la catalogadora guardó de verdad, leído
 * del volcado. Con una reserva que conviene no olvidar — **la IoU no es la
 * verdad**: ese recorte es su criterio, y puede llevar margen a propósito o
 * ceñirse al lienzo en vez de al marco. Optimizar constantes contra una docena de
 * filas es sobreajustar a una docena de decisiones de una persona.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '../..')
const CORPUS = path.join(RAIZ, 'corpus-bordes')

// ── El detector real, agrupado ────────────────────────────────
// Node no resuelve los imports sin extensión de TypeScript, así que se agrupa.
// La entrada se escribe en un temporal y no en el repositorio.
function cargarDetector() {
  const temporal = mkdtempSync(path.join(tmpdir(), 'bordes-'))
  const entrada = path.join(temporal, 'entrada.ts')
  writeFileSync(
    entrada,
    `export { analyseArtworkEdges } from '${path.join(RAIZ, 'app/src/lib/edgeDetection.ts')}'\n`,
  )
  const salida = path.join(temporal, 'detector.mjs')
  execFileSync(path.join(RAIZ, 'app/node_modules/.bin/esbuild'), [
    entrada,
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${salida}`,
    '--log-level=warning',
  ])

  // Las constantes se pueden mover desde la línea de órdenes, parcheando el
  // agrupado y no el módulo: así se puede barrer un valor sin dejar el
  // repositorio en un estado intermedio, y el detector que se mide sigue siendo
  // el del repositorio con un número cambiado y no una reimplementación.
  //
  //   node scripts/bordes/medir.mjs --soporte=0 --prominencia=0.22
  //
  // Con --soporte=0 el soporte de línea no rechaza nada, que es la forma de
  // atribuir un silencio a su puerta.
  const constantes = ['MIN_LINE_SUPPORT', 'LINE_STEP_FRACTION', 'PROMINENCE_FRACTION',
                      'MIN_EDGE_STRENGTH', 'MAX_AREA', 'MIN_AREA']
  const banderas = { soporte: 'MIN_LINE_SUPPORT', paso: 'LINE_STEP_FRACTION',
                     prominencia: 'PROMINENCE_FRACTION', fuerza: 'MIN_EDGE_STRENGTH',
                     areaMax: 'MAX_AREA', areaMin: 'MIN_AREA' }
  let fuente = readFileSync(salida, 'utf8')
  const cambios = []
  for (const [bandera, constante] of Object.entries(banderas)) {
    const dado = process.argv.find((a) => a.startsWith(`--${bandera}=`))
    if (!dado) continue
    const valor = Number(dado.slice(bandera.length + 3))
    // Se comprueba que el patrón CASA, no que la cadena cambie: pedir el mismo
    // valor que ya tiene la constante es legítimo y dejaba el texto idéntico.
    const patron = new RegExp(`(var ${constante} = )[0-9.]+`)
    if (!patron.test(fuente)) throw new Error(`no se encontró ${constante} en el agrupado`)
    fuente = fuente.replace(patron, `$1${valor}`)
    cambios.push(`${constante}=${valor}`)
  }
  if (cambios.length > 0) {
    writeFileSync(salida, fuente)
    console.error(`· constantes movidas: ${cambios.join(' ')}`)
  }
  void constantes
  return salida
}

const { analyseArtworkEdges } = await import(cargarDetector())

const manifest = JSON.parse(readFileSync(path.join(CORPUS, 'manifest.json'), 'utf8'))

// ── El recorte que ella guardó ────────────────────────────────
// Se lee del volcado, de la línea COPY de `images`. Sin base de datos y sin
// dependencias: el volcado es un fichero de texto.
function recortesGuardados(volcado) {
  const sql = readFileSync(path.join(volcado, 'publico.sql'), 'utf8')
  const cabecera = sql.indexOf('COPY public.images (')
  if (cabecera < 0) return new Map()
  const columnas = sql
    .slice(sql.indexOf('(', cabecera) + 1, sql.indexOf(')', cabecera))
    .split(',')
    .map((c) => c.trim())
  const cuerpo = sql.slice(sql.indexOf('\n', cabecera) + 1, sql.indexOf('\n\\.', cabecera))

  const indice = (nombre) => columnas.indexOf(nombre)
  const guardados = new Map()
  for (const linea of cuerpo.split('\n')) {
    if (linea === '') continue
    const campos = linea.split('\t')
    const master = campos[indice('master_path')]
    if (!master) continue
    const numero = (nombre) => {
      const valor = campos[indice(nombre)]
      return valor === '\\N' || valor === undefined ? null : Number(valor)
    }
    guardados.set(path.basename(master, path.extname(master)), {
      rotation: numero('rotation') ?? 0,
      crop:
        numero('crop_width') === null
          ? null
          : {
              x: numero('crop_x'),
              y: numero('crop_y'),
              width: numero('crop_width'),
              height: numero('crop_height'),
            },
      shotType: campos[indice('shot_type')],
    })
  }
  return guardados
}

/** Intersección sobre unión de dos rectángulos en fracciones. */
function iou(a, b) {
  if (!a || !b) return null
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const interseccion = x * y
  const union = a.width * a.height + b.width * b.height - interseccion
  return union > 0 ? interseccion / union : null
}

const volcado = process.argv.find((a) => a.startsWith('--volcado='))?.slice(10)
const guardados = recortesGuardados(volcado ?? path.join(RAIZ, 'volcados/20260801-1142'))

const filas = []
for (const foto of manifest.fotos) {
  const luminancia = new Uint8Array(readFileSync(path.join(CORPUS, 'raw', `${foto.nombre}.raw`)))
  const inicio = process.hrtime.bigint()
  const analisis = analyseArtworkEdges(luminancia, foto.ancho, foto.alto)
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6
  const sugerencia = analisis.suggestion

  const guardado = guardados.get(foto.nombre)
  const area = sugerencia ? sugerencia.outer.width * sugerencia.outer.height : null
  filas.push({
    nombre: foto.nombre,
    obra: foto.obra,
    tipoToma: guardado?.shotType ?? null,
    veredicto: !sugerencia ? 'silencio' : sugerencia.inner ? 'marco+lienzo' : 'solo-marco',
    area,
    outer: sugerencia?.outer ?? null,
    inner: sugerencia?.inner ?? null,
    motivo: analisis.reason,
    detalle: analisis.detail,
    recorteGuardado: guardado?.crop ?? null,
    iouOuter: iou(sugerencia?.outer, guardado?.crop),
    iouInner: iou(sugerencia?.inner, guardado?.crop),
    ms,
  })
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(filas, null, 2))
} else {
  const n = (v, d = 3) => (v === null || v === undefined ? '—' : v.toFixed(d))
  console.log('fotografía'.padEnd(26), 'veredicto'.padEnd(13), 'área', ' IoU', '  tipo de toma  ', 'por qué calla')
  for (const f of filas) {
    console.log(
      f.nombre.padEnd(26),
      f.veredicto.padEnd(13),
      n(f.area, 2).padStart(4),
      n(Math.max(f.iouOuter ?? 0, f.iouInner ?? 0)).padStart(5),
      ' ',
      f.tipoToma ?? '—',
      f.motivo ?? '',
    )
  }

  const silencios = filas.filter((f) => f.veredicto === 'silencio')
  const grandes = filas.filter((f) => f.area !== null && f.area > 0.9)
  const conIou = filas.filter((f) => f.iouOuter !== null).map((f) => f.iouOuter).sort((a, b) => a - b)
  const mediana = conIou.length ? conIou[Math.floor(conIou.length / 2)] : null
  console.log(
    `\n${filas.length} fotografías · ${filas.length - silencios.length} con sugerencia · ` +
      `${silencios.length} en silencio · ${grandes.length} cubren más del 90 % del fotograma`,
  )
  console.log(
    `IoU mediana contra el recorte guardado: ${n(mediana)} (${conIou.length} comparables) · ` +
      `${n(filas.reduce((t, f) => t + f.ms, 0) / filas.length, 1)} ms de media`,
  )

  // Los silencios agrupados por su motivo: es lo que dice si un silencio es la
  // respuesta correcta o una regla que se está llevando por delante un borde.
  const porMotivo = new Map()
  for (const f of silencios) porMotivo.set(f.motivo, (porMotivo.get(f.motivo) ?? 0) + 1)
  console.log('\nSilencios por motivo:')
  for (const [motivo, cuantos] of [...porMotivo].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(motivo).padEnd(20)} ${cuantos}`)
  }
}
