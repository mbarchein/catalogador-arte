#!/usr/bin/env bash
# Regenerates the page's screenshots, end to end.
#
#     ./run.sh            # everything, into ../public/img
#     ./run.sh /tmp/algo  # with another working directory
#
# Five steps: invent the artwork, build the application against the
# demonstration's server, photograph it with Chromium, leave the results
# optimised where the page reads them and compose the link preview's card.
# Everything is deterministic, so running it again with no changes rewrites
# identical images.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="${1:-/tmp/catalogo-demostracion}"
mkdir -p "$work"

echo '1/5  obra inventada'
python3 "$here/artwork_images.py" "$work/images" >/dev/null

echo '2/5  compilación de la demostración'
"$here/build-demo.sh" "$work/app" >/dev/null

echo '3/5  capturas'
(cd "$here" && node capture.mjs "$work/app/app/dist" "$work/images" "$work/shots")

echo '4/5  optimización'
python3 "$here/optimize.py" "$work/shots" "$here/../public/img"

# From the full-size shot and not from the WebP already published: the card
# reduces the screenshot again, and reducing something already reduced twice
# shows.
echo '5/5  cartel de la vista previa'
python3 "$here/og_image.py" "$work/shots/record-mobile.png" "$here/../public/img"
