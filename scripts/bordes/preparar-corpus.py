#!/usr/bin/env python3
"""Prepara el corpus de luminancia con el que se mide el detector de bordes.

El detector solo estaba probado con imágenes sintéticas, porque el entorno de
test no tiene canvas. Esto reproduce fuera del navegador la cadena de
`app/src/lib/imageEdges.ts` sobre las fotografías maestras de un volcado, para
poder ejecutar el detector real contra ellas y medir lo que acierta.

Lo que sale son ficheros `.raw` de un byte por píxel y un `manifest.json`, que es
lo que come `medir.mjs`.

    python3 scripts/bordes/preparar-corpus.py volcados/20260801-1142

**El corpus no entra en el repositorio y el volcado tampoco**: son fotografías de
obra real y el repositorio es público (ADR-005). Lo versionado es este script,
que las regenera.

La cadena que reproduce, paso a paso y en este orden, es la de `imageEdges.ts`:

  1. orientación EXIF aplicada antes de nada — es el `imageOrientation:
     'from-image'` de `createImageBitmap`;
  2. reducción al tamaño que da `computeTarget(w, h, 700)`, con su redondeo;
  3. luminancia Rec. 709 sobre los valores sRGB tal cual, sin linealizar, y
     TRUNCADA a entero, porque el `| 0` de JavaScript trunca y no redondea.

El filtro de remuestreo es BOX y la elección está medida, no supuesta: contra las
respuestas de navegador real disponibles el residuo es de 0,14 px sobre la copia
de 700 px, y entre los filtros probados el veredicto del detector solo cambia en
2 de 44 fotos, nunca hacia o desde el silencio. Cambiarlo aquí invalida cualquier
comparación con las cifras del informe archivado.
"""

import json
import pathlib
import sys

import numpy as np
from PIL import Image, ImageOps

# Mismo valor que ANALYSIS_LONG_EDGE en app/src/lib/imageEdges.ts.
LONG_EDGE = 700


def compute_target(width: int, height: int, long_edge: int) -> tuple[int, int]:
    """Aritmética exacta de `computeTarget` en app/src/lib/images.ts.

    Nunca amplía, y redondea cada lado por separado con `round`. La coincidencia
    con la versión de TypeScript se comprobó en 2020 tamaños sin una sola
    discrepancia; si esta función y aquella se separan, todas las medidas del
    banco dejan de decir nada sobre lo que hace la aplicación.
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
    """Rec. 709 sobre sRGB sin linealizar, truncada como hace `| 0`.

    Truncar y no redondear no es un detalle: con `round` el 42 % de los píxeles
    de una fotografía cualquiera se queda a un nivel de distancia, y el gradiente
    de Sobel amplifica esa diferencia justo en los bordes, que es lo único que
    este corpus existe para medir.
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
                # La orientación EXIF, antes de cualquier otra cosa: medir sobre
                # una fotografía tumbada distinta de la que se ve en pantalla
                # sería medir otra cosa.
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
