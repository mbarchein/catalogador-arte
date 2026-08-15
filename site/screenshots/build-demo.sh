#!/usr/bin/env bash
# Builds the application against the demonstration's server.
#
# It builds from a COPY of `app/` and not in place, for one reason: the invented
# artists' names have to replace the real ones, which are hard-coded in
# `ARTIST_LABEL` (the labels are frontend code; only the fund's code is data). A
# `sed` over the repository would leave the working tree dirty if anything went
# wrong halfway, and this runs by hand every few months.
#
# `node_modules` is linked, not copied: it is the only heavy part and nothing
# here writes into it.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="${1:?directorio de trabajo}"

# The copy keeps the repository's shape, and not out of tidiness: the frontend
# imports two files from OUTSIDE `app/` —the invitation function's validation and
# `CHANGELOG.md`, which «Novedades» embeds— and a loose copy of `app/` does not
# build.
rm -rf "$work"
mkdir -p "$work"
cp -r "$root/app" "$work/app"
rm -rf "$work/app/node_modules" "$work/app/dist"
ln -s "$root/app/node_modules" "$work/app/node_modules"
ln -s "$root/supabase" "$work/supabase"
ln -s "$root/CHANGELOG.md" "$work/CHANGELOG.md"
work="$work/app"

# The invented fund. Same codes, other names: what is read on screen changes and
# what the schema stores does not. Every occurrence is replaced, comments and
# form placeholders included — a real name inside the bundle of a public
# demonstration is a real name published, whether or not any screen shows it.
grep -rlZ 'Alberto Rotili\|María Ruiz Campins' "$work/src" |
  xargs -0 --no-run-if-empty sed -i -e 's/Alberto Rotili/Adela Ferrán/g' -e 's/María Ruiz Campins/Vicente Olmedo/g'
grep -q "ROTILI: 'Adela Ferrán'" "$work/src/lib/types.ts" || { echo 'no se ha podido renombrar el fondo'; exit 1; }

cd "$work"
VITE_SUPABASE_URL=http://localhost:5799 \
VITE_SUPABASE_ANON_KEY=demostracion \
npx vite build --mode production >/dev/null

echo "$work/dist"
