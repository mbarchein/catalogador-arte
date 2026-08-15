#!/usr/bin/env bash
# Regenerates the page's screenshots, end to end.
#
#     ./run.sh            # everything, into ../public/img
#     ./run.sh /tmp/algo  # with another working directory
#
# Four steps: invent the artwork, build the application against the
# demonstration's server, photograph it with Chromium and leave the results
# optimised where the page reads them. Everything is deterministic, so running it
# again with no changes rewrites identical images.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="${1:-/tmp/catalogo-demostracion}"
mkdir -p "$work"

echo '1/4  obra inventada'
python3 "$here/artwork_images.py" "$work/images" >/dev/null

echo '2/4  compilación de la demostración'
"$here/build-demo.sh" "$work/app" >/dev/null

echo '3/4  capturas'
(cd "$here" && node capture.mjs "$work/app/app/dist" "$work/images" "$work/shots")

echo '4/4  optimización'
python3 "$here/optimize.py" "$work/shots" "$here/../public/img"
