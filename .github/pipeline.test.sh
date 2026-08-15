#!/usr/bin/env bash
#
# Tests of the deployment pipeline (RNF-103: the frontend is published from
# continuous integration on merging into main — and, as desplegar.yml's header
# says, after the schema and never before).
#
# It exists because of a real incident: thirteen migrations —the provenance, the
# bibliography, the exhibitions, the documentary archive— reached main in a
# push whose verification failed, so they were not applied. The following pushes
# fixed the test and carried on with the frontend, but as they no longer touched
# supabase/migrations/ the «migrar» job was skipped on each one, while
# «publicar» did run. Production ended up with the new frontend against the old
# schema, and the user saw in all the record's new blocks:
#
#   Could not find the table 'public.provenance_events' in the schema cache
#
# What is checked here is not that the YAML be written in a particular way,
# but the two properties whose absence caused that: that applying migrations NOT
# depend on which files the push brings, and that publishing the frontend require having
# done it successfully. They are assertions about the job graph, not about the text.
#
# It needs no network, no Docker and no credentials: it only reads the repository's
# files. It is run with `make pipeline-test`.

set -euo pipefail

cd "$(dirname "$0")/.."

fallos=0

fallo() {
  echo "  ✗ $1" >&2
  fallos=$((fallos + 1))
}

ok() {
  echo "  ✓ $1"
}

# It returns the `if` condition of a desplegar.yml job, with the newlines
# of the folded block already resolved by the YAML parser.
condicion_de() {
  python3 - "$1" <<'PY'
import sys, yaml
with open('.github/workflows/desplegar.yml') as f:
    jobs = yaml.safe_load(f)['jobs']
print(' '.join(str(jobs[sys.argv[1]].get('if', '')).split()))
PY
}

# It returns a job's `needs`, one per line.
dependencias_de() {
  python3 - "$1" <<'PY'
import sys, yaml
with open('.github/workflows/desplegar.yml') as f:
    jobs = yaml.safe_load(f)['jobs']
needs = jobs[sys.argv[1]].get('needs', [])
print('\n'.join([needs] if isinstance(needs, str) else needs))
PY
}

echo "→ El esquema se despliega en todo despliegue verificado"

migrar="$(condicion_de migrar)"

# The heart of the incident: if applying migrations depends on the
# classification of the push's files, the migrations of a push that never
# got deployed are never retried.
if [[ "$migrar" == *"cambios.outputs"* ]]; then
  fallo "«migrar» vuelve a depender de qué ficheros trae el push: $migrar"
else
  ok "«migrar» no depende de qué ficheros trae el push"
fi

if [[ "$(dependencias_de migrar)" == *"cambios"* ]]; then
  fallo "«migrar» necesita el job «cambios», que es lo que clasifica el push"
else
  ok "«migrar» no necesita la clasificación del push"
fi

# The other half: the base is not touched if the verification has not gone well.
if [[ "$migrar" == *"needs.verificar.result == 'success'"* ]]; then
  ok "«migrar» exige que la verificación haya ido bien"
else
  fallo "«migrar» ya no exige una verificación en verde: $migrar"
fi

echo
echo "→ El frontend no se publica contra un esquema sin migrar"

publicar="$(condicion_de publicar)"

if [[ "$publicar" == *"needs.migrar.result == 'success'"* ]]; then
  ok "«publicar» exige que «migrar» haya terminado bien"
else
  fallo "«publicar» ya no exige un «migrar» en verde: $publicar"
fi

# Admitting «skipped» was indispensable when «migrar» was skipped on the
# frontend-only pushes, and it is exactly the door through which the new frontend
# came out against the old schema. Now «migrar» is only skipped if the verification
# has not gone well, a case the condition alongside already blocks.
if [[ "$publicar" == *"migrar.result == 'skipped'"* ]]; then
  fallo "«publicar» vuelve a admitir un «migrar» saltado: $publicar"
else
  ok "«publicar» no admite un «migrar» saltado"
fi

# Without this, any `skipped` in the `needs` chain drags the job along and the
# frontend is never published: the symmetric failure, silent and also seen.
if [[ "$publicar" == *'!cancelled()'* ]]; then
  ok "«publicar» conserva el «!cancelled()» que lo salva de la cadena de saltos"
else
  fallo "«publicar» ha perdido el «!cancelled()»: $publicar"
fi

echo
echo "→ Las migraciones que existen se despliegan de verdad"

# That the step exist and carry no condition of its own: an `if` here would reintroduce the
# hole one level further down, where the job graph no longer gives it away.
python3 - <<'PY' || exit 1
import sys, yaml
with open('.github/workflows/desplegar.yml') as f:
    pasos = yaml.safe_load(f)['jobs']['migrar']['steps']

fallos = 0
for nombre, orden in (('Aplicar migraciones', 'db push'),
                      ('Desplegar funciones Edge', 'functions deploy')):
    paso = next((p for p in pasos if p.get('name') == nombre), None)
    if paso is None:
        print(f"  ✗ falta el paso «{nombre}» del job «migrar»", file=sys.stderr)
        fallos += 1
    elif orden not in paso.get('run', ''):
        print(f"  ✗ el paso «{nombre}» ya no ejecuta «supabase {orden}»", file=sys.stderr)
        fallos += 1
    elif 'if' in paso:
        print(f"  ✗ el paso «{nombre}» lleva condición propia: {paso['if']}", file=sys.stderr)
        fallos += 1
    else:
        print(f"  ✓ «{nombre}» se ejecuta sin condiciones")

sys.exit(1 if fallos else 0)
PY

echo
echo "→ Lo que la aplicación importa de fuera de app/ se publica"

# Otro incidente real, y del mismo tipo: `CHANGELOG.md` se empotra en el build
# —«Acerca de · Novedades» lo lee con `?raw`— pero el clasificador lo mandaba a
# documentación por el patrón `*.md`, así que un cambio solo en el registro no
# llegaba nunca a producción. Se vio como «en Novedades no sale lo último».
#
# Este test no repite la lista de rutas del clasificador: la SACA DEL CÓDIGO
# —los ficheros de fuera de app/ que la aplicación importa— y evalúa el `case`
# de verdad, extraído del action. Así, el día que alguien importe otro fichero de
# la raíz, esto se pone rojo hasta que lo clasifique.
python3 - <<'PY' || exit 1
import re, subprocess, sys, os

# 1. Qué importa la aplicación de fuera de app/, leído de las fuentes.
importados = set()
for raiz, _, ficheros in os.walk('app/src'):
    for nombre in ficheros:
        if not nombre.endswith(('.ts', '.tsx')):
            continue
        ruta = os.path.join(raiz, nombre)
        with open(ruta, encoding='utf-8') as f:
            codigo = f.read()
        for especificador in re.findall(r"""["'](\.\./[^"']+)["']""", codigo):
            limpio = especificador.split('?')[0]
            resuelto = os.path.normpath(os.path.join(raiz, limpio))
            if not resuelto.startswith('app/') and os.path.exists(resuelto):
                importados.add(resuelto)

if not importados:
    print("  ✗ no se ha encontrado ningún fichero de fuera de app/ importado por la aplicación:"
          " ¿ha cambiado la forma de importarlos?", file=sys.stderr)
    sys.exit(1)

# 2. El `case` del clasificador, tal cual está escrito, sin copiarlo aquí.
with open('.github/actions/clasificar-cambios/action.yml', encoding='utf-8') as f:
    action = f.read()
inicio = action.index('case "$f" in')
fin = action.index('esac', inicio) + len('esac')
caso = action[inicio:fin]
# El YAML es un bloque indentado: se le quita la sangría común.
caso = '\n'.join(linea[14:] if linea.startswith(' ' * 14) else linea.lstrip()
                 for linea in caso.split('\n'))

fallos = 0
for ruta in sorted(importados):
    guion = f'''
      infra=false; datos=false; app=false
      todo() {{ infra=true; datos=true; app=true; }}
      f={ruta!r}
{caso}
      echo "$app"
    '''
    salida = subprocess.run(['bash', '-c', guion], capture_output=True, text=True)
    if salida.stdout.strip() == 'true':
        print(f"  ✓ «{ruta}» se verifica y se publica con la aplicación")
    else:
        print(f"  ✗ «{ruta}» lo importa la aplicación y el clasificador NO lo publica"
              f" (app={salida.stdout.strip() or salida.stderr.strip()})", file=sys.stderr)
        fallos += 1

# 3. Y el filtro del disparador, que es la puerta ANCHA: lo que ignora ahí no llega
#    a evaluar ningún `if`, así que no deja ni un job saltado que mirar. Es donde el
#    fallo del CHANGELOG era invisible.
import yaml

with open('.github/workflows/desplegar.yml', encoding='utf-8') as f:
    disparador = yaml.safe_load(f)[True]['push']
ignorados = disparador.get('paths-ignore', [])

def expresion_de(patron: str) -> str:
    """El patrón de GitHub como expresión regular.

    A mano y no con `fnmatch`, y esto ya se ha equivocado una vez: en la sintaxis de
    `fnmatch` la clase negada se escribe `[!…]`, así que un `[^/]` traducido para él se
    lee como «uno de los caracteres ^ o /» y el patrón deja de coincidir con nada. El
    test pasaba por el motivo equivocado.
    """
    salida = ''
    i = 0
    while i < len(patron):
        if patron.startswith('**', i):
            salida += '.*'
            i += 2
        elif patron[i] == '*':
            # `*` no cruza la barra en los filtros de GitHub; `**` sí.
            salida += '[^/]*'
            i += 1
        elif patron[i] == '?':
            salida += '[^/]'
            i += 1
        else:
            salida += re.escape(patron[i])
            i += 1
    return f'^{salida}$'

def ignorado(ruta: str) -> str | None:
    for patron in ignorados:
        if re.match(expresion_de(patron), ruta):
            return patron
    return None

# El traductor se comprueba a sí mismo: sin esto, un fallo suyo se lee como un verde.
for patron, ruta, esperado in (
    ('*.md', 'CHANGELOG.md', True),
    ('*.md', 'app/public/nota.md', False),
    ('docs/**', 'docs/decisiones/ADR-011.md', True),
    ('docker/**.md', 'docker/README.md', True),
    ('README.md', 'CHANGELOG.md', False),
):
    if bool(re.match(expresion_de(patron), ruta)) is not esperado:
        print(f"  ✗ el traductor de patrones se equivoca con «{patron}» y «{ruta}»", file=sys.stderr)
        fallos += 1

for ruta in sorted(importados):
    patron = ignorado(ruta)
    if patron is None:
        print(f"  ✓ «{ruta}» dispara el despliegue")
    else:
        print(f"  ✗ «{ruta}» lo importa la aplicación y «{patron}» impide que el push"
              " dispare el despliegue", file=sys.stderr)
        fallos += 1

sys.exit(1 if fallos else 0)
PY

echo
echo "→ La CLI de Supabase está clavada en una versión concreta"

# It was on `latest`, and on 7 August 2026 a verified deployment fell over
# at the first step —«failed to get api keys: SchemaError(…inserted_at)»— because
# 2.112.0 had been published five minutes earlier. Nothing in the repository had
# changed. With `link` broken, «migrar» did not start and «publicar» did not publish.
#
# What is checked is not which version it is —that decision belongs to the file, and its
# reason is in the header—, but that it be ONE and the same in every job:
# `latest` turns every deployment into the première of whatever has been published
# outside while it was running, and two different versions in the same deployment are two
# different behaviours against the same API.
python3 - <<'PY' || exit 1
import sys, yaml

with open('.github/workflows/desplegar.yml') as f:
    wf = yaml.safe_load(f)

# `latest`, `beta` or a branch are moving; anything else is considered a version.
MOVILES = {'latest', 'beta', 'canary', 'main', 'master', ''}

usos = []
for nombre, job in wf['jobs'].items():
    for paso in job.get('steps', []):
        if str(paso.get('uses', '')).startswith('supabase/setup-cli@'):
            usos.append((nombre, str(paso.get('with', {}).get('version', ''))))

fallos = 0
if not usos:
    print("  ✗ ningún job instala la CLI de Supabase", file=sys.stderr)
    fallos += 1

for job, version in usos:
    if version.lower() in MOVILES:
        print(f"  ✗ «{job}» instala una versión móvil de la CLI: «{version}»", file=sys.stderr)
        fallos += 1
    else:
        print(f"  ✓ «{job}» instala la {version}")

# The version is written in each job, so raising it is touching two places. This
# is what prevents raising one and leaving the other: two different versions against the
# same API is exactly the state nobody is going to look at until it fails.
distintas = {v for _, v in usos}
if len(distintas) > 1:
    print(f"  ✗ los jobs no coinciden en la versión de la CLI: {sorted(distintas)}", file=sys.stderr)
    fallos += 1
elif len(usos) > 1:
    print("  ✓ todos los jobs instalan la misma versión")

sys.exit(1 if fallos else 0)
PY

echo
echo "→ La página comercial se publica sola y no toca producción"

# Son dos workflows con dos destinos y ningún riesgo comparable: uno migra la base
# de producción y el otro sube HTML estático. Lo que se fija aquí es que sigan
# separados, porque la forma de romperlo es callada — basta con quitar una línea
# del `paths-ignore` para que retocar una frase del escaparate migre la base, y no
# hay nada en pantalla que lo delate hasta que pasa.
python3 - <<'PY' || exit 1
import sys, yaml

fallos = 0

with open('.github/workflows/desplegar.yml', encoding='utf-8') as f:
    despliegue = yaml.safe_load(f)[True]['push']
with open('.github/workflows/publicar-sitio.yml', encoding='utf-8') as f:
    sitio = yaml.safe_load(f)

if 'site/**' in despliegue.get('paths-ignore', []):
    print('  ✓ un cambio del sitio no dispara el despliegue a producción')
else:
    print('  ✗ «site/**» no está en el paths-ignore de desplegar.yml: retocar la página'
          ' migraría la base', file=sys.stderr)
    fallos += 1

publicados = sitio[True]['push'].get('paths', [])
if any(patron.startswith('site/') for patron in publicados):
    print('  ✓ un cambio del sitio sí dispara su publicación')
else:
    print('  ✗ publicar-sitio.yml no se dispara con los cambios de site/', file=sys.stderr)
    fallos += 1

# Dos grupos de concurrencia distintos: compartirlo pondría a la página a esperar
# a una migración, o —peor— cancelaría un despliegue a medias, que es justo lo que
# el grupo de producción evita con `cancel-in-progress: false`.
grupos = {
    'desplegar': yaml.safe_load(open('.github/workflows/desplegar.yml', encoding='utf-8'))[
        'concurrency'
    ]['group'],
    'publicar-sitio': sitio['concurrency']['group'],
}
if len(set(grupos.values())) == 2:
    print('  ✓ cada workflow tiene su propio grupo de concurrencia')
else:
    print(f'  ✗ los dos workflows comparten grupo de concurrencia: {grupos}', file=sys.stderr)
    fallos += 1

sys.exit(1 if fallos else 0)
PY

echo
echo "→ La vista previa del enlace apunta a un cartel que existe"

# Las etiquetas `og:` las lee un robot que no tiene la página abierta, así que una
# ruta relativa no le sirve y un fichero renombrado le deja la vista previa en
# blanco. Ninguna de las dos cosas se ve mirando el sitio: se ven cuando alguien
# manda el enlace a una galería y llega pelado.
python3 - <<'PY' || exit 1
import re, struct, sys
from pathlib import Path

fallos = 0
BASE = 'https://mbarchein.github.io/catalogador-arte/'


def etiquetas(pagina):
    fuente = Path(pagina).read_text(encoding='utf-8')
    return dict(
        re.findall(
            r'<meta\s+property="(og:[\w:]+)"\s+content="([^"]*)"', fuente.replace('\n', ' ')
        )
    )


def medidas_png(fichero):
    cabecera = Path(fichero).read_bytes()[:24]
    return struct.unpack('>II', cabecera[16:24])


for pagina in ('site/public/index.html', 'site/public/en/index.html'):
    meta = etiquetas(pagina)
    for clave in ('og:url', 'og:image'):
        if not meta.get(clave, '').startswith(BASE):
            print(f'  ✗ {pagina}: «{clave}» no es absoluta: {meta.get(clave)!r}', file=sys.stderr)
            fallos += 1

    cartel = Path('site/public') / meta.get('og:image', '').removeprefix(BASE)
    if not cartel.is_file():
        print(f'  ✗ {pagina}: el cartel «{cartel}» no está publicado', file=sys.stderr)
        fallos += 1
        continue

    declaradas = (int(meta.get('og:image:width', 0)), int(meta.get('og:image:height', 0)))
    if medidas_png(cartel) != declaradas:
        print(
            f'  ✗ {pagina}: el cartel mide {medidas_png(cartel)} y declara {declaradas}',
            file=sys.stderr,
        )
        fallos += 1
    else:
        print(f'  ✓ {pagina} declara un cartel de 1200×630 que existe')

sys.exit(1 if fallos else 0)
PY

echo
if [ "$fallos" -gt 0 ]; then
  echo "Tests del pipeline: $fallos fallo(s)" >&2
  exit 1
fi
echo "Tests del pipeline OK"
