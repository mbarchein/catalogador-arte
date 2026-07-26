#!/usr/bin/env python3
"""Genera los iconos PNG de la PWA sin depender de librerías externas.

El manifiesto exige PNG en 192 y 512, más una variante «maskable» con zona de
seguridad, y un manifiesto que apunte a ficheros inexistentes hace que la
aplicación no sea instalable. Se dibuja un marco, que es el motivo evidente para
un catálogo de obra.

Uso:  python3 scripts/generar-iconos.py
"""
import struct
import zlib
from pathlib import Path

FONDO = (28, 25, 23)      # stone-900, igual que theme_color
TRAZO = (214, 211, 209)   # stone-300
LIENZO = (120, 113, 108)  # stone-500

DESTINO = Path(__file__).resolve().parent.parent / "app" / "public" / "icons"


def escribir_png(ruta: Path, pixeles: list[list[tuple[int, int, int]]]) -> None:
    """Escribe un PNG RGB de 8 bits."""
    alto = len(pixeles)
    ancho = len(pixeles[0])

    crudo = b"".join(
        b"\x00" + b"".join(struct.pack("3B", *px) for px in fila) for fila in pixeles
    )

    def trozo(tipo: bytes, datos: bytes) -> bytes:
        return (
            struct.pack(">I", len(datos))
            + tipo
            + datos
            + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
        )

    ruta.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0))
        + trozo(b"IDAT", zlib.compress(crudo, 9))
        + trozo(b"IEND", b"")
    )


def dibujar(lado: int, margen_rel: float) -> list[list[tuple[int, int, int]]]:
    """Marco centrado. `margen_rel` es la fracción del lado que queda libre."""
    pixeles = [[FONDO] * lado for _ in range(lado)]

    margen = int(lado * margen_rel)
    grosor = max(2, int(lado * 0.055))
    x0, y0 = margen, margen
    x1, y1 = lado - margen - 1, lado - margen - 1

    # Lienzo interior, un tono intermedio para que el marco se lea como marco.
    for y in range(y0 + grosor, y1 - grosor + 1):
        for x in range(x0 + grosor, x1 - grosor + 1):
            pixeles[y][x] = LIENZO

    # Cuatro lados del marco.
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            en_borde = (
                y < y0 + grosor or y > y1 - grosor or x < x0 + grosor or x > x1 - grosor
            )
            if en_borde:
                pixeles[y][x] = TRAZO

    return pixeles


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)

    # Iconos normales: margen justo, para que el dibujo llene el espacio.
    for lado in (192, 512):
        escribir_png(DESTINO / f"icono-{lado}.png", dibujar(lado, 0.16))

    # Maskable: el sistema puede recortar hasta un círculo inscrito, así que el
    # dibujo se encoge para caber en la zona segura del 80 %.
    escribir_png(DESTINO / "icono-512-maskable.png", dibujar(512, 0.26))

    for f in sorted(DESTINO.iterdir()):
        print(f"✓ {f.relative_to(DESTINO.parent.parent.parent)} ({f.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
