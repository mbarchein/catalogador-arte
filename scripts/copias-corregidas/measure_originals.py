#!/usr/bin/env python3
"""Fills in the size of the originals that nobody ever measured (RF-411).

`original_width`/`original_height` arrived with the colour migration
(20260803120000) and nothing was filled in backwards (ADR-010), so every photograph
uploaded before it carries them null. The record uses them for the caption under the
photograph and for what each download button promises, so on those rows it says
nothing at all.

The application fills them in on its own from now on — every correction saved from the
master writes down the size it just decoded, and the corrected-copy queue does it too —
but that only reaches the photographs somebody happens to touch. This empties the rest
in one pass.

    python3 scripts/copias-corregidas/measure_originals.py --dry-run
    python3 scripts/copias-corregidas/measure_originals.py

It lives next to `generate_copies.py` and shares its session, its `.env` and its way of
reaching a master, because it is the same kind of tool: the one that does from a
computer what the phone in a storeroom could not.

── IT READS THE HEADER, NOT THE PHOTOGRAPH ─────────────────

The size of a JPEG is in its first few kilobytes, so this asks for **the first 128 KB
of each master** with an HTTP `Range` and stops there. Over 44 photographs that is a
few megabytes instead of the best part of a gigabyte of B2 traffic, and the difference
is the whole reason this is worth running rather than waiting.

If the store ignores the `Range` it will send the whole file and the answer will be the
same, only slower. And if the header is not enough to decode —a truncated APP1, an
unusual format— the row is reported and left alone: nothing is invented.

The local mirror comes first when there is one, exactly as in `generate_copies.py`:
after `make db-clone FOTOS=todo` the masters are already on disk and there is nothing
to ask anybody.

── IT DOES NOT TOUCH A PIXEL, AND IT SAYS SO ───────────────

It reads and writes two integers. The master is never re-uploaded, never re-encoded and
never renamed (ADR-002, §0.1): this tool has no upload path at all, which is the
cheapest way of guaranteeing it. And it only writes the rows that have those columns
null, so running it twice does nothing the second time.

Configuration is `generate_copies.py`'s, in `.env`: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `SUPABASE_EMAIL` and `SUPABASE_PASSWORD`. The account has to
be able to edit (`can_edit()`), because that is what the RLS policy asks for — there is
no service key here and there must not be.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
from dataclasses import dataclass
from io import BytesIO

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from generate_copies import (  # noqa: E402  — after sys.path, on purpose
    Api,
    newest_dump,
    read_config,
    load_env,
)

# How much of the master is asked for. A JPEG's SOF marker and its EXIF live at the
# start; 128 KB leaves room for a fat APP1 with a thumbnail inside, which is what a
# phone writes, and is still three orders of magnitude less than the file.
HEADER_BYTES = 131_072

# The four EXIF orientations that swap the sides. It is the same rule
# `ImageOps.exif_transpose` applies to the pixels and `imageOrientation: 'from-image'`
# applies in the browser — here it is applied to the two numbers, because measuring does
# not need the photograph turned, only its sides in the right order.
TRANSPOSING_ORIENTATIONS = frozenset({5, 6, 7, 8})


@dataclass
class Measured:
    """What happened with one row. Three states, and none of them is silent."""

    image_id: str
    state: str  # 'written' | 'skipped' | 'failed'
    detail: str


def upright_size(header: bytes) -> tuple[int, int]:
    """The size of a master from its header alone, with the orientation already applied.

    `Image.open` does not decode: for a JPEG it reads the markers and `size` is
    available straight away, which is what makes 128 KB enough. `load()` is never
    called, on purpose — that is the line between reading a header and downloading a
    photograph.

    The orientation is applied by swapping the sides and not by transposing pixels there
    are none of. It is what `original_width` names: the size any viewer shows.
    """
    from PIL import Image

    with Image.open(BytesIO(header)) as image:
        width, height = image.size
        orientation = image.getexif().get(0x0112)
    if orientation in TRANSPOSING_ORIENTATIONS:
        width, height = height, width
    if width <= 0 or height <= 0:
        raise ValueError(f"El decodificador ha dado un tamaño imposible: {width}×{height}")
    return int(width), int(height)


def read_header(api: Api, master_path: str, dump: pathlib.Path | None) -> bytes:
    """The first bytes of a master: from the local mirror, or by a ranged download."""
    if dump is not None:
        local = dump / "masters" / master_path
        if local.is_file():
            with local.open("rb") as handle:
                return handle.read(HEADER_BYTES)
    url = api.signed_download(master_path)
    # A 206 with the slice, or a 200 with the whole file if the store ignores the range.
    # Both answers carry the header, which is all this needs.
    _, raw = api._request(url, headers={"Range": f"bytes=0-{HEADER_BYTES - 1}"})
    return raw


def images_without_size(api: Api, only: str | None, limit: int | None) -> list[dict]:
    """The rows that have a master and no measurement.

    Active only, like the sibling tool: the caption is read on a photograph the record
    shows, and a withdrawn one is not shown. Restoring it puts it back in the queue of
    whatever runs next, which is the honest place for it.

    `original_width` is enough as the filter because the pair travels together —
    `images_original_size_pair` guarantees it — so a row with one side and not the other
    cannot exist.
    """
    query = (
        f"{api.config.base_url}/rest/v1/images"
        "?select=image_id,master_path"
        "&original_width=is.null&master_path=not.is.null&active=is.true&order=image_id"
    )
    if only:
        query += f"&image_id=eq.{only}"
    if limit:
        query += f"&limit={limit}"
    rows = api._json(query)
    return list(rows) if isinstance(rows, list) else []


def write_size(api: Api, image_id: str, size: tuple[int, int]) -> None:
    """The two columns, checking that they really were written.

    `return=representation` for the same reason as in `mark_generated`: if the account
    cannot edit, the RLS policy gives no error, it returns **zero rows**. Without looking
    at the answer this tool would report a queue emptied that is still full.
    """
    rows = api._json(
        f"{api.config.base_url}/rest/v1/images?image_id=eq.{image_id}",
        method="PATCH",
        payload={"original_width": size[0], "original_height": size[1]},
        headers={"Prefer": "return=representation"},
    )
    if not isinstance(rows, list) or len(rows) != 1:
        raise RuntimeError(
            f"La base no ha actualizado la fila {image_id}. ¿La cuenta puede editar?"
        )


def measure(api: Api, row: dict, dump: pathlib.Path | None, write: bool) -> Measured:
    """One row, and never an exception that stops the pass."""
    image_id = str(row.get("image_id") or "?")
    master_path = row.get("master_path")
    if not master_path:
        return Measured(image_id, "skipped", "sin máster: no hay original que medir")
    try:
        header = read_header(api, str(master_path), dump)
        size = upright_size(header)
    except Exception as error:  # noqa: BLE001 — a bad row is a datum, not a reason to stop
        return Measured(image_id, "failed", f"no se ha podido medir: {error}")
    if not write:
        return Measured(image_id, "skipped", f"mediría {size[0]}×{size[1]} px")
    try:
        write_size(api, image_id, size)
    except Exception as error:  # noqa: BLE001
        return Measured(image_id, "failed", f"medida {size[0]}×{size[1]} px, sin guardar: {error}")
    return Measured(image_id, "written", f"{size[0]}×{size[1]} px")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rellena el tamaño de los originales que nunca se midió (RF-411).",
        epilog="Documentación completa en la cabecera del fichero.",
    )
    parser.add_argument(
        "dump",
        nargs="?",
        help="Volcado con los másters en disco. Por omisión, el más reciente de volcados/.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Medir y no guardar nada.")
    parser.add_argument("--only", help="Una sola fotografía, por su id_imagen.")
    parser.add_argument("--limit", type=int, help="Cuántas medir como máximo.")
    args = parser.parse_args()

    try:
        from PIL import Image  # noqa: F401  — checked here so the message is useful
    except ImportError:
        print(
            "Falta Pillow, que es lo que lee la cabecera de un JPEG:\n"
            "    pip install pillow",
            file=sys.stderr,
        )
        return 1

    config = read_config(load_env())
    api = Api(config)
    dump = pathlib.Path(args.dump) if args.dump else newest_dump()
    rows = images_without_size(api, args.only, args.limit)

    # Never a blank page, not in a terminal either: an empty queue is an answer.
    if not rows:
        print(
            "No hay ninguna fotografía activa sin medir: todas dicen ya cuánto mide su "
            "original."
        )
        return 0

    where = f"del volcado {dump}" if dump else "por descarga firmada, solo la cabecera"
    print(f"{len(rows)} fotografías sin medir. Leyendo {where}.")
    if args.dry_run:
        print("Modo de prueba: no se va a guardar nada.")

    results = [measure(api, row, dump, write=not args.dry_run) for row in rows]
    for result in results:
        mark = {"written": "✓", "skipped": "·", "failed": "✗"}[result.state]
        print(f"  {mark} {result.image_id}: {result.detail}")

    written = [r for r in results if r.state == "written"]
    failed = [r for r in results if r.state == "failed"]
    print(f"\n{len(written)} medidas y guardadas, {len(failed)} sin poder medir.")
    if failed:
        # Said out loud and by name: what is left pending is work for a person, and a
        # tool that announces a queue emptied when it is not is worse than one that fails.
        print(
            "Las que faltan siguen sin tamaño y la ficha no lo dirá. Suele ser un formato "
            "que Pillow no abre (HEIC): se pueden medir abriendo el máster a mano.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
