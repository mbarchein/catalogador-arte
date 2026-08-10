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
if [ "$fallos" -gt 0 ]; then
  echo "Tests del pipeline: $fallos fallo(s)" >&2
  exit 1
fi
echo "Tests del pipeline OK"
