import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Layout } from '../../components/Layout'
import { supabase } from '../../lib/supabase'
import { mostrarFecha } from '../../lib/fechas'
import { avisoExistencia, avisoTituloAtribuido, mostrarMedidas, mostrarTitulo } from '../../lib/titulo'
import {
  ETIQUETA_ARTISTA,
  ETIQUETA_CONSERVACION,
  ETIQUETA_EXISTENCIA,
  ETIQUETA_TITULO_ATRIBUIDO,
  ETIQUETA_TRI_ESTADO,
  type Obra,
} from '../../lib/tipos'
import {
  ANIO_MINIMO,
  ajustarAnio,
  analizarFechaManual,
  anioMaximo,
  componerFecha,
} from '../../lib/fechaEstructurada'
import {
  BarraAcciones,
  Conmutador,
  Fichas,
  Grupo,
  Interruptor,
  PasoAnio,
  TriEstadoIconos,
} from '../../components/ui'
import { normalizarUbicacion, ubicacionParaGuardar } from '../../lib/ubicacion'
import { useCambiosEnVivo } from '../../lib/enVivo'
import { GaleriaObra } from './GaleriaObra'
import { useObra } from './useObras'

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-32 shrink-0 text-sm text-stone-500">{etiqueta}</dt>
      {/* Nunca un hueco vacío (RF-304): si no hay dato, se dice. */}
      <dd className="text-sm">{valor.trim() === '' ? <span className="text-stone-400">Sin dato</span> : valor}</dd>
    </div>
  )
}

export function ObraPage() {
  const { id } = useParams<{ id: string }>()
  const { obra, cargando, error, recargar } = useObra(id)
  const { puedeEditar } = useAuth()
  const [editando, setEditando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [errorPdf, setErrorPdf] = useState('')

  // pdf-lib se carga solo al pedir la ficha: no debe engordar el paquete inicial.
  async function imprimirFicha(laObra: Obra) {
    setGenerandoPdf(true)
    setErrorPdf('')
    try {
      const { generarFichaPdf } = await import('../../lib/fichaPdf')
      const blob = await generarFichaPdf(laObra)
      const url = URL.createObjectURL(blob)
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = `${laObra.id_catalogacion}-ficha.pdf`
      enlace.click()
      // Margen holgado: algunos navegadores descargan en diferido.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setErrorPdf('No se ha podido generar el PDF. Vuelve a intentarlo.')
    } finally {
      setGenerandoPdf(false)
    }
  }

  // La ficha en consulta se refresca si otro la cambia. En edición NO: pisar el
  // formulario a medio rellenar con datos ajenos destruiría trabajo — el
  // conflicto de edición concurrente es asunto del bloqueo (RF-700), pendiente.
  useCambiosEnVivo('obras', () => {
    if (!editando) void recargar()
  }, id ? `id_catalogacion=eq.${id}` : undefined)

  if (cargando) {
    return (
      <Layout titulo={id} atras="/">
        <p className="text-sm text-stone-600">Cargando…</p>
      </Layout>
    )
  }

  if (error || !obra) {
    return (
      <Layout titulo={id} atras="/">
        <div className="tarjeta text-sm">
          <p className="font-medium">No se ha encontrado la ficha {id}.</p>
          <p className="mt-1 text-stone-600">
            Puede que esté dada de baja, o que no tengas permiso para verla.
          </p>
        </div>
      </Layout>
    )
  }

  if (editando) {
    return (
      <Layout titulo={`Editando ${obra.id_catalogacion}`} atras="/">
        <FormularioEdicion
          obra={obra}
          alTerminar={async () => {
            await recargar()
            setEditando(false)
          }}
          alCancelar={() => setEditando(false)}
        />
      </Layout>
    )
  }

  const avisoTitulo = avisoTituloAtribuido(obra.titulo_atribuido)
  const avisoEstado = avisoExistencia(obra)

  return (
    <Layout
      titulo={obra.id_catalogacion}
      atras="/"
      // En la cabecera fija, no dentro de la página: así editar está al alcance
      // sin volver arriba, por larga que sea la ficha.
      accion={
        puedeEditar ? (
          <button
            onClick={() => setEditando(true)}
            className="boton-primario min-h-[2.5rem] px-4 text-sm"
          >
            Editar
          </button>
        ) : undefined
      }
    >
      <header className="mb-4">
        <p className="font-mono text-sm text-stone-500">{obra.id_catalogacion}</p>
        <h1 className="text-xl font-semibold">{mostrarTitulo(obra.titulo)}</h1>
        <p className="text-sm text-stone-600">
          {ETIQUETA_ARTISTA[obra.artista]} · {mostrarFecha(obra.fecha_ejecucion)}
        </p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <Insignia
            activa={obra.fase_inventario_completada}
            texto={obra.fase_inventario_completada ? 'Fase 1 completa' : 'Fase 1 en curso'}
          />
          <Insignia
            activa={obra.fase_documentacion_completada}
            texto={obra.fase_documentacion_completada ? 'Fase 2 completa' : 'Fase 2 en curso'}
          />
          {/* RF-306 y RF-307: los avisos que cambian cómo se lee la ficha van
              arriba, no enterrados entre los datos. */}
          {avisoEstado && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
              {avisoEstado}
            </span>
          )}
          {avisoTitulo && (
            <span className="rounded bg-stone-200 px-2 py-0.5 text-xs text-stone-700">
              {avisoTitulo}
            </span>
          )}
        </div>

      </header>

      <GaleriaObra idCatalogacion={obra.id_catalogacion} />

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Identificación</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Tipo" valor={obra.tipo_obra} />
          <Dato etiqueta="Técnica" valor={obra.tecnica} />
          <Dato etiqueta="Soporte" valor={obra.soporte} />
          <Dato etiqueta="Medidas" valor={mostrarMedidas(obra)} />
          <Dato
            etiqueta="Firmada"
            valor={
              obra.firmada === 'SI' && obra.firma_descripcion
                ? `Sí, ${obra.firma_descripcion}`
                : ETIQUETA_TRI_ESTADO[obra.firmada]
            }
          />
          <Dato etiqueta="Fecha en la obra" valor={ETIQUETA_TRI_ESTADO[obra.fechada_en_obra]} />
          <Dato etiqueta="Título" valor={ETIQUETA_TITULO_ATRIBUIDO[obra.titulo_atribuido]} />
        </dl>
      </section>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Conservación y localización</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Conservación" valor={ETIQUETA_CONSERVACION[obra.estado_conservacion]} />
          <Dato etiqueta="Existencia" valor={ETIQUETA_EXISTENCIA[obra.estado_existencia]} />
          <Dato etiqueta="Ubicación" valor={obra.ubicacion_fisica} />
        </dl>
      </section>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Estado del proceso</h2>
        <dl className="divide-y divide-stone-100">
          <Dato etiqueta="Fotografiada" valor={obra.fotografiada ? 'Sí' : 'No'} />
          <Dato etiqueta="Medidas verificadas" valor={obra.medidas_verificadas ? 'Sí' : 'No'} />
          <Dato
            etiqueta="Ficha publicable"
            valor={obra.ficha_catalografica_completa ? 'Sí' : 'No'}
          />
          <Dato etiqueta="Notas" valor={obra.notas_proceso_inventario} />
          <Dato
            etiqueta="Actualizada"
            valor={new Date(obra.fecha_actualizacion).toLocaleString('es-ES')}
          />
          <Dato
            etiqueta="Toma de datos"
            valor={
              obra.fecha_actualizacion_basica
                ? new Date(obra.fecha_actualizacion_basica).toLocaleString('es-ES')
                : ''
            }
          />
        </dl>
      </section>

      <section className="tarjeta mb-3">
        <h2 className="mb-2 font-medium">Etiqueta e impresión</h2>
        <p className="mb-3 text-sm text-stone-600">
          Ficha en A5 con los datos principales y un código QR que abre esta misma página — para
          acompañar a la etiqueta física {obra.id_catalogacion}.
        </p>
        {errorPdf && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {errorPdf}
          </p>
        )}
        <button
          type="button"
          onClick={() => void imprimirFicha(obra)}
          disabled={generandoPdf}
          className="boton-secundario w-full"
        >
          {generandoPdf ? 'Generando…' : 'Descargar ficha en PDF (A5)'}
        </button>
      </section>

      {/* Los bloques que el esquema define pero esta entrega no cubre se declaran
          en vez de omitirse: así se ve qué falta y no parece que la ficha esté
          completa. */}
      <section className="tarjeta text-sm text-stone-500">
        <p className="font-medium text-stone-700">Pendiente en esta entrega</p>
        <p className="mt-1">
          Procedencia, historial expositivo, bibliografía, documentación relacionada, series y obras
          relacionadas. También la descarga del máster de archivo. Ver el orden de construcción en la
          documentación.
        </p>
      </section>
    </Layout>
  )
}

function Insignia({ activa, texto }: { activa: boolean; texto: string }) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs ${
        activa ? 'bg-green-100 text-green-900' : 'bg-stone-200 text-stone-700'
      }`}
    >
      {texto}
    </span>
  )
}

function FormularioEdicion({
  obra,
  alTerminar,
  alCancelar,
}: {
  obra: Obra
  alTerminar: () => Promise<void>
  alCancelar: () => void
}) {
  const [datos, setDatos] = useState(obra)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof Obra>(campo: K, valor: Obra[K]) {
    setDatos((d) => ({ ...d, [campo]: valor }))
  }

  const aNumero = (v: string) => {
    const limpio = v.replace(',', '.').trim()
    if (limpio === '') return null
    const n = Number(limpio)
    return Number.isFinite(n) ? n : null
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    setError(null)

    // id_catalogacion y artista no se envían: son inmutables (RF-204) y un
    // trigger de la base rechaza el cambio. No mandarlos evita provocar el error.
    const { error } = await supabase
      .from('obras')
      .update({
        titulo: datos.titulo.trim(),
        titulo_atribuido: datos.titulo_atribuido,
        tipo_obra: datos.tipo_obra.trim(),
        // fecha_ejecucion no se envía: la compone la base (columna generada).
        anio_inicio: datos.anio_inicio,
        anio_fin: datos.anio_fin,
        fecha_aproximada: datos.anio_inicio != null && datos.fecha_aproximada,
        fecha_sin_confirmar: datos.anio_inicio != null && datos.fecha_sin_confirmar,
        fecha_nota: datos.fecha_nota.trim(),
        tecnica: datos.tecnica.trim(),
        soporte: datos.soporte.trim(),
        alto_cm: datos.alto_cm,
        ancho_cm: datos.ancho_cm,
        profundidad_cm: datos.profundidad_cm,
        firmada: datos.firmada,
        firma_descripcion: datos.firma_descripcion.trim(),
        fechada_en_obra: datos.fechada_en_obra,
        estado_conservacion: datos.estado_conservacion,
        estado_existencia: datos.estado_existencia,
        ubicacion_fisica: ubicacionParaGuardar(datos.ubicacion_fisica),
        medidas_verificadas: datos.medidas_verificadas,
        fase_inventario_completada: datos.fase_inventario_completada,
        fase_documentacion_completada: datos.fase_documentacion_completada,
        ficha_catalografica_completa: datos.ficha_catalografica_completa,
        notas_proceso_inventario: datos.notas_proceso_inventario,
      })
      .eq('id_catalogacion', obra.id_catalogacion)

    if (error) {
      setError(error.message)
      setGuardando(false)
      return
    }
    await alTerminar()
  }

  return (
    <form onSubmit={guardar} className="space-y-3">
      {/* RF-308: toda la ficha entra en edición a la vez, cabecera incluida.
          La clave primaria se muestra de solo lectura (RF-204). */}
      <Grupo titulo="Identificación">
        <div>
          <label className="etiqueta">Código de catalogación</label>
          <input className="campo bg-stone-100 text-stone-500" value={obra.id_catalogacion} readOnly />
          <p className="mt-1 text-xs text-stone-500">
            No es editable: es la etiqueta pegada en la obra y el eje de las tablas relacionadas.
          </p>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-titulo">
            Título
          </label>
          <input
            id="e-titulo"
            className="campo"
            value={datos.titulo}
            onChange={(e) => set('titulo', e.target.value)}
          />
        </div>

        <Fichas
          id="e-atribuido"
          etiqueta="¿El título es del artista?"
          opciones={Object.entries(ETIQUETA_TITULO_ATRIBUIDO).map(([v, t]) => ({
            valor: v as Obra['titulo_atribuido'],
            texto: t,
          }))}
          valor={datos.titulo_atribuido}
          alCambiar={(v) => set('titulo_atribuido', v)}
        />

        <div>
          <label className="etiqueta" htmlFor="e-tipo">
            Tipo de obra
          </label>
          <input
            id="e-tipo"
            className="campo"
            value={datos.tipo_obra}
            onChange={(e) => set('tipo_obra', e.target.value)}
          />
        </div>

      </Grupo>

      <Grupo titulo="Fecha de ejecución">
        <CampoFecha datos={datos} set={set} />
      </Grupo>

      <Grupo titulo="Con la obra delante" pista="medidas, materia y firma">

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="etiqueta" htmlFor="e-alto">
              Alto
            </label>
            <input
              id="e-alto"
              className="campo"
              inputMode="decimal"
              value={datos.alto_cm ?? ''}
              onChange={(e) => set('alto_cm', aNumero(e.target.value))}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="e-ancho">
              Ancho
            </label>
            <input
              id="e-ancho"
              className="campo"
              inputMode="decimal"
              value={datos.ancho_cm ?? ''}
              onChange={(e) => set('ancho_cm', aNumero(e.target.value))}
            />
          </div>
          <div>
            <label className="etiqueta" htmlFor="e-prof">
              Prof.
            </label>
            <input
              id="e-prof"
              className="campo"
              inputMode="decimal"
              value={datos.profundidad_cm ?? ''}
              onChange={(e) => set('profundidad_cm', aNumero(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-tecnica">
            Técnica
          </label>
          <input
            id="e-tecnica"
            className="campo"
            value={datos.tecnica}
            onChange={(e) => set('tecnica', e.target.value)}
          />
        </div>

        <div>
          <label className="etiqueta" htmlFor="e-soporte">
            Soporte
          </label>
          <input
            id="e-soporte"
            className="campo"
            value={datos.soporte}
            onChange={(e) => set('soporte', e.target.value)}
          />
        </div>

        <TriEstadoIconos
          id="e-firmada"
          etiqueta="Firmada"
          valor={datos.firmada}
          alCambiar={(v) => set('firmada', v)}
        />

        {/* Solo tiene sentido describir la firma si hay firma. */}
        {datos.firmada === 'SI' && (
          <div>
            <label className="etiqueta" htmlFor="e-firma-desc">
              Descripción de la firma
            </label>
            <input
              id="e-firma-desc"
              className="campo"
              value={datos.firma_descripcion}
              onChange={(e) => set('firma_descripcion', e.target.value)}
              placeholder="ángulo inferior derecho, a lápiz"
            />
          </div>
        )}

        <TriEstadoIconos
          id="e-fechada"
          etiqueta="Lleva fecha inscrita"
          valor={datos.fechada_en_obra}
          alCambiar={(v) => set('fechada_en_obra', v)}
        />
      </Grupo>

      <Grupo titulo="Conservación y localización">
        <Fichas
          id="e-conservacion"
          etiqueta="Estado de conservación"
          opciones={Object.entries(ETIQUETA_CONSERVACION).map(([v, t]) => ({
            valor: v as Obra['estado_conservacion'],
            texto: t,
          }))}
          valor={datos.estado_conservacion}
          alCambiar={(v) => set('estado_conservacion', v)}
        />

        <Fichas
          id="e-existencia"
          etiqueta="Estado de existencia"
          opciones={Object.entries(ETIQUETA_EXISTENCIA).map(([v, t]) => ({
            valor: v as Obra['estado_existencia'],
            texto: t,
          }))}
          valor={datos.estado_existencia}
          alCambiar={(v) => set('estado_existencia', v)}
        />

        <div>
          <label className="etiqueta" htmlFor="e-ubicacion">
            Ubicación física
          </label>
          <input
            id="e-ubicacion"
            className="campo"
            autoCapitalize="none"
            value={datos.ubicacion_fisica}
            onChange={(e) => set('ubicacion_fisica', normalizarUbicacion(e.target.value))}
          />
        </div>
      </Grupo>

      <Grupo titulo="Estado del proceso" pista="uso interno, no se publica">
        <Interruptor
          etiqueta="Medidas verificadas físicamente"
          ayuda="Solo si alguien del equipo las ha medido, no si vienen de un catálogo antiguo."
          activo={datos.medidas_verificadas}
          alCambiar={(v) => set('medidas_verificadas', v)}
        />
        <Interruptor
          etiqueta="Fase 1 completada"
          ayuda="Toma de datos con la obra delante."
          activo={datos.fase_inventario_completada}
          alCambiar={(v) => set('fase_inventario_completada', v)}
        />
        <Interruptor
          etiqueta="Fase 2 completada"
          ayuda="Documentación e investigación."
          activo={datos.fase_documentacion_completada}
          alCambiar={(v) => set('fase_documentacion_completada', v)}
        />
        <Interruptor
          etiqueta="Ficha lista para publicar"
          ayuda="Revisión editorial final. No se deduce de las dos fases anteriores."
          activo={datos.ficha_catalografica_completa}
          alCambiar={(v) => set('ficha_catalografica_completa', v)}
        />

        <div className="pt-2">
          <label className="etiqueta" htmlFor="e-notas">
            Notas del proceso
          </label>
          <textarea
            id="e-notas"
            className="campo"
            rows={3}
            value={datos.notas_proceso_inventario}
            onChange={(e) => set('notas_proceso_inventario', e.target.value)}
            placeholder="pendiente contactar con la familia para confirmar medidas"
          />
          <p className="mt-1 text-xs text-stone-500">
            Uso interno del equipo. No se publica en el catálogo.
          </p>
        </div>
      </Grupo>

      {/* Guardar y cancelar siempre bajo el pulgar: el formulario es largo y el
          error de guardado aparece junto al botón que se acaba de pulsar. */}
      <BarraAcciones
        aviso={
          error ? (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">
              No se ha podido guardar: {error}
            </p>
          ) : null
        }
      >
        <button className="boton-primario min-h-[3.25rem] flex-1 text-base" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="boton-secundario" onClick={alCancelar} disabled={guardando}>
          Cancelar
        </button>
      </BarraAcciones>
    </form>
  )
}

/**
 * Fecha de ejecución sobre los campos estructurados (ADR-004), con los mismos
 * controles que la captura, y una vía de escape que TAMBIÉN estructura:
 *
 * «Escribir a mano» analiza lo tecleado. Si es uno de los formatos canónicos
 * («c.1975 - 1978», con las variantes de catálogo), rellena los campos
 * estructurados y no queda nota: teclearlo y componerlo con botones dan la
 * misma ficha. Solo lo imparseable («finales de los setenta») se conserva como
 * nota — es lo que se publica — y aun entonces se rescata el primer año
 * plausible para que la obra no desaparezca de las búsquedas por época.
 */
function CampoFecha({
  datos,
  set,
}: {
  datos: Obra
  set: <K extends keyof Obra>(campo: K, valor: Obra[K]) => void
}) {
  const [rango, setRango] = useState(() => datos.anio_fin != null)
  const [aMano, setAMano] = useState(() => datos.fecha_nota !== '')
  const [borrador, setBorrador] = useState(() => datos.fecha_nota || datos.fecha_ejecucion)

  const estructura = {
    anio: datos.anio_inicio,
    anioFin: rango ? datos.anio_fin : null,
    aproximada: datos.fecha_aproximada,
    sinConfirmar: datos.fecha_sin_confirmar,
  }

  function aplicarManual() {
    const { fecha, nota } = analizarFechaManual(borrador)
    set('anio_inicio', fecha.anio)
    set('anio_fin', fecha.anioFin)
    set('fecha_aproximada', fecha.aproximada)
    set('fecha_sin_confirmar', fecha.sinConfirmar)
    set('fecha_nota', nota)
    setRango(fecha.anioFin != null)
    // Si el texto era canónico, ya está estructurado: se vuelve a los botones.
    if (nota === '') setAMano(false)
  }

  if (aMano) {
    const { fecha, nota } = analizarFechaManual(borrador)
    return (
      <div>
        <label className="etiqueta" htmlFor="e-fecha">
          Fecha, escrita a mano
        </label>
        <div className="flex gap-2">
          <input
            id="e-fecha"
            className="campo flex-1"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={aplicarManual}
            placeholder="1978 · c. 1975-1978 · finales de los setenta"
          />
          <button type="button" className="boton-secundario shrink-0" onClick={aplicarManual}>
            Aplicar
          </button>
        </div>
        {/* Se anticipa el resultado del análisis ANTES de aplicar: saber si lo
            tecleado se estructurará o quedará como nota evita sorpresas. */}
        <p aria-live="polite" className="mt-1 text-xs text-stone-500">
          {borrador.trim() === '' ? (
            'Vacío: obra sin fechar.'
          ) : nota === '' ? (
            <>Se reconoce como «{componerFecha(fecha)}» y se guardará estructurada.</>
          ) : fecha.anio != null ? (
            <>Se guardará tal cual, y se encontrará al buscar por {fecha.anio}.</>
          ) : (
            'Se guardará tal cual. Sin ningún año, no aparecerá en las búsquedas por época.'
          )}
        </p>
        <button
          type="button"
          className="mt-1 text-xs text-stone-600 underline"
          onClick={() => {
            aplicarManual()
            setAMano(false)
          }}
        >
          Volver a los botones
        </button>
      </div>
    )
  }

  function poner(cambios: {
    anio?: number | null
    anioFin?: number | null
    aproximada?: boolean
    sinConfirmar?: boolean
  }) {
    if ('anio' in cambios) set('anio_inicio', cambios.anio ?? null)
    if ('anioFin' in cambios) set('anio_fin', cambios.anioFin ?? null)
    if ('aproximada' in cambios) set('fecha_aproximada', cambios.aproximada ?? false)
    if ('sinConfirmar' in cambios) set('fecha_sin_confirmar', cambios.sinConfirmar ?? false)
  }

  return (
    <div className="space-y-3">
      {rango ? (
        /* Las dos fechas del rango en la misma línea: son un solo dato. */
        <div className="grid grid-cols-2 gap-2">
          <PasoAnio
            id="e-anio"
            etiqueta="Año inicial"
            compacto
            valor={estructura.anio}
            minimo={ANIO_MINIMO}
            maximo={anioMaximo()}
            alCambiar={(anio) => poner({ anio })}
          />
          <PasoAnio
            id="e-anio-fin"
            etiqueta="Año final"
            compacto
            valor={estructura.anioFin}
            minimo={ANIO_MINIMO}
            maximo={anioMaximo()}
            alCambiar={(anioFin) => poner({ anioFin })}
          />
        </div>
      ) : (
        <PasoAnio
          id="e-anio"
          etiqueta="Año"
          valor={estructura.anio}
          minimo={ANIO_MINIMO}
          maximo={anioMaximo()}
          alCambiar={(anio) => poner({ anio })}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        <Conmutador
          etiqueta="Aproximada"
          activo={estructura.aproximada}
          alCambiar={(v) => poner({ aproximada: v })}
        />
        <Conmutador
          etiqueta="Rango"
          activo={rango}
          alCambiar={(v) => {
            setRango(v)
            if (v && estructura.anio != null && datos.anio_fin == null) {
              poner({ anioFin: ajustarAnio(estructura.anio, 1) })
            }
            if (!v) poner({ anioFin: null })
          }}
        />
        <Conmutador
          etiqueta="Sin confirmar"
          activo={estructura.sinConfirmar}
          alCambiar={(v) => poner({ sinConfirmar: v })}
        />
      </div>

      <p className="text-xs text-stone-500">
        «Aproximada»: de alrededor de ese año (c.). «Sin confirmar»: se desconoce; el año es una
        estimación ([?]).
      </p>

      <div className="flex items-center justify-between gap-2 rounded-lg bg-stone-100 px-3 py-2">
        <span id="vista-fecha" aria-live="polite" className="text-sm">
          {estructura.anio == null ? (
            <span className="text-stone-500">Sin fechar</span>
          ) : (
            <>
              Se guardará como <span className="font-medium">{componerFecha(estructura)}</span>
            </>
          )}
        </span>
        <button
          type="button"
          className="shrink-0 text-xs text-stone-600 underline"
          onClick={() => {
            setBorrador(componerFecha(estructura))
            setAMano(true)
          }}
        >
          Escribir a mano
        </button>
      </div>
    </div>
  )
}
