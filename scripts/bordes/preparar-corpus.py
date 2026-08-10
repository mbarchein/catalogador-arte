#!/usr/bin/env python3
"""Prepares the luminance corpus with which the edge detector is measured.

The detector was only tested with synthetic images, because the test
environment has no canvas. This reproduces outside the browser the chain of
`app/src/lib/imageEdges.ts` over the master photographs of a dump, so as to be
able to run the real detector against them and measure what it gets right.

What comes out are `.raw` files of one byte per pixel and a `manifest.json`, which is
what `medir.mjs` eats.

    python3 scripts/bordes/preparar-corpus.py volcados/20260801-1142

**The corpus does not go into the repository and neither does the dump**: they are photographs of
real artworks and the repository is public (ADR-005). What is versioned is this script,
which regenerates them.

The chain it reproduces, step by step and in this order, is that of `imageEdges.ts`:

  1. the EXIF orientation applied before anything else — it is the `imageOrientation:
     'from-image'` of `createImageBitmap`;
  2. reduction to the size `computeTarget(w, h, 700)` gives, with its rounding;
  3. Rec. 709 luminance over the sRGB values as they are, without linearising, and
     TRUNCATED to an integer, because JavaScript's `| 0` truncates and does not round.

The resampling filter is BOX and the choice is measured, not assumed: against the
available real-browser responses the residual is 0.14 px over the 700 px
copy, and among the filters tested the detector's verdict changes in only
2 of 44 photos, never towards or away from silence. Changing it here invalidates any
comparison with the figures of the archived report.
"""

import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageOps

# The same value as ANALYSIS_LONG_EDGE in app/src/lib/imageEdges.ts.
LONG_EDGE = 700


def compute_target(width: int, height: int, long_edge: int) -> tuple[int, int]:
    """The exact arithmetic of `computeTarget` in app/src/lib/images.ts.

    It never enlarges, and it rounds each side separately with `round`. The match
    with the TypeScript version was checked over 2020 sizes without a single
    discrepancy; if this function and that one drift apart, all the bench's
    measurements stop saying anything about what the application does.
    """
    largest = max(width, height)
    if largest <= long_edge:
        return width, height
    factor = long_edge / largest
    return (
        max(1, round(width * factor)),
        max(1, round(height * factor)),
    )


def luminance(image: Image.Image) -> np.ndarray:
    """Rec. 709 over sRGB without linearising, truncated as `| 0` does.

    Truncating and not rounding is not a detail: with `round` 42 % of the pixels
    of any photograph are left one level away, and Sobel's gradient
    amplifies that difference precisely at the edges, which is the only thing
    this corpus exists to measure.
    """
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    y = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    return np.trunc(y).astype(np.uint8)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    volcado = pathlib.Path(sys.argv[1])
    masters = volcado / "masters"
    if not masters.is_dir():
        print(f"No hay masters/ en {volcado}", file=sys.stderr)
        return 1

    salida = pathlib.Path("corpus-bordes")
    (salida / "raw").mkdir(parents=True, exist_ok=True)

    entradas = []
    for fichero in sorted(masters.rglob("*")):
        if not fichero.is_file():
            continue
        try:
            with Image.open(fichero) as im:
                # The EXIF orientation, before anything else: measuring over
                # a photograph lying differently from the one seen on screen
                # would be measuring something else.
                im = ImageOps.exif_transpose(im)
                ancho, alto = compute_target(im.width, im.height, LONG_EDGE)
                reducida = im.resize((ancho, alto), Image.Resampling.BOX)
                y = luminance(reducida)
        except Exception as error:  # noqa: BLE001 — una foto ilegible es un dato
            print(f"  ✗ {fichero.name}: {error}", file=sys.stderr)
            continue

        nombre = fichero.stem
        (salida / "raw" / f"{nombre}.raw").write_bytes(y.tobytes())
        entradas.append(
            {
                "nombre": nombre,
                "obra": fichero.parent.name,
                "fichero": str(fichero),
                "ancho": ancho,
                "alto": alto,
                "anchoOriginal": im.width,
                "altoOriginal": im.height,
            }
        )
        print(f"  · {nombre}  {im.width}x{im.height} → {ancho}x{alto}")

    (salida / "manifest.json").write_text(
        json.dumps({"longEdge": LONG_EDGE, "fotos": entradas}, ensure_ascii=False, indent=2)
    )
    print(f"\n{len(entradas)} fotografías en {salida}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
