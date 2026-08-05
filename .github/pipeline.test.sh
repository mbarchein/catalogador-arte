#!/usr/bin/env bash
#
# Tests del pipeline de despliegue (RNF-103: el frontend se publica desde
# integración continua al fusionar en main — y, como dice la cabecera de
# desplegar.yml, después del esquema y nunca antes).
#
# Existe por una incidencia real: trece migraciones —la procedencia, la
# bibliografía, las exposiciones, el archivo documental— llegaron a main en un
# push cuya verificación falló, así que no se aplicaron. Los pushes siguientes
# arreglaron el test y siguieron con el frontend, pero como ya no tocaban
# supabase/migrations/ el job «migrar» se saltaba en cada uno, mientras
# «publicar» sí corría. Producción acabó con el frontend nuevo contra el esquema
# viejo, y la usuaria vio en todos los bloques nuevos de la ficha:
#
#   Could not find the table 'public.provenance_events' in the schema cache
#
# Lo que se comprueba aquí no es que el YAML esté escrito de una forma concreta,
# sino las dos propiedades cuya ausencia causó eso: que aplicar migraciones NO
# dependa de qué ficheros trae el push, y que publicar el frontend exija haberlo
# hecho con éxito. Son afirmaciones sobre el grafo de jobs, no sobre el texto.
#
# No necesita red, ni Docker, ni credenciales: solo lee los ficheros del
# repositorio. Se ejecuta con `make pipeline-test`.

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

# Devuelve la condición `if` de un job de desplegar.yml, con los saltos de línea
# del bloque plegado ya resueltos por el analizador de YAML.
condicion_de() {
  python3 - "$1" <<'PY'
import sys, yaml
with open('.github/workflows/desplegar.yml') as f:
    jobs = yaml.safe_load(f)['jobs']
print(' '.join(str(jobs[sys.argv[1]].get('if', '')).split()))
PY
}

# Devuelve los `needs` de un job, uno por línea.
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

# El corazón de la incidencia: si aplicar migraciones depende de la
# clasificación de los ficheros del push, las migraciones de un push que no
# llegó a desplegarse no se reintentan nunca.
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

# La otra mitad: no se toca la base si la verificación no ha ido bien.
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

# Admitir «skipped» era imprescindible cuando «migrar» se saltaba en los pushes
# de solo frontend, y es exactamente la puerta por la que salió el frontend
# nuevo contra el esquema viejo. Ahora «migrar» solo se salta si la verificación
# no ha ido bien, caso que la condición de al lado ya bloquea.
if [[ "$publicar" == *"migrar.result == 'skipped'"* ]]; then
  fallo "«publicar» vuelve a admitir un «migrar» saltado: $publicar"
else
  ok "«publicar» no admite un «migrar» saltado"
fi

# Sin esto, cualquier `skipped` en la cadena de `needs` arrastra al job y el
# frontend no se publica nunca: el fallo simétrico, silencioso y también visto.
if [[ "$publicar" == *'!cancelled()'* ]]; then
  ok "«publicar» conserva el «!cancelled()» que lo salva de la cadena de saltos"
else
  fallo "«publicar» ha perdido el «!cancelled()»: $publicar"
fi

echo
echo "→ Las migraciones que existen se despliegan de verdad"

# Que el paso exista y no lleve condición propia: un `if` aquí reintroduciría el
# agujero un nivel más abajo, donde el grafo de jobs ya no lo delata.
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
if [ "$fallos" -gt 0 ]; then
  echo "Tests del pipeline: $fallos fallo(s)" >&2
  exit 1
fi
echo "Tests del pipeline OK"
