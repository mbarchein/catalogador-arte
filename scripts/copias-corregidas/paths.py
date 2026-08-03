#!/usr/bin/env python3
"""Cómo se llama la copia corregida, y por qué nunca puede llamarse como el máster.

El máster se sube una vez con los bytes originales y no se reescribe jamás
(ADR-002). La forma realista de romper eso no es un borrado: es **derivar la ruta
de la copia corregida de la del máster** —cambiarle la extensión, reutilizar la
base— y que un día coincidan. La base de datos lo defiende con la restricción
`images_corrected_not_master`, pero para cuando la base dice no ya se ha subido el
fichero: aquí hay una comprobación que se hace antes de firmar nada.

Módulo aparte y sin dependencias para que su test corra sin PIL, junto al de las
tablas de color.
"""

from __future__ import annotations

import secrets

# The alphabet and the length of `randomSuffix` in app/src/lib/images.ts. Only
# name collisions have to be avoided, and `secrets` is what Python has at hand.
_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
_SUFFIX_LENGTH = 8

# What the derivative levels of a shot are called today: `_min`, `_der` and
# `_master`. Those pieces match files already uploaded — they are data, and they
# stay. The corrected copy gets its own, next to them.
CORRECTED_SUFFIX = "_corrected"

# The piece that names an archive master. Reading it is how this module knows what
# it must never write.
MASTER_SUFFIX = "_master"

# JPEG, because the destination of this file is a print shop or a curator
# (RF-411): it is opened by whatever they use, and at quality 92 with no chroma
# subsampling what it loses is not visible on a reproduction. It is NOT the format
# of the master, which keeps its own bytes and its own extension.
CORRECTED_EXTENSION = "jpg"
CORRECTED_CONTENT_TYPE = "image/jpeg"


class MasterAtRisk(Exception):
    """La ruta calculada tocaría un máster. Se aborta antes de firmar nada."""


def random_suffix(length: int = _SUFFIX_LENGTH) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def corrected_path(
    catalog_id: str,
    master_path: str | None,
    *,
    suffix: str | None = None,
) -> str:
    """La ruta de una copia corregida nueva, comprobada contra la del máster.

    A **fresh random base**, like `basePath` in images.ts, and not the base of the
    master: re-editing writes a new path and never overwrites the old one, because
    the service worker caches images by path with `CacheFirst` and overwriting a
    path would serve the old bytes from the phone forever. The superseded copy
    stays in the store — never a real deletion.

    `suffix` exists for the test, so the collision can be forced without waiting
    for a random one that will never come.
    """
    if not catalog_id:
        # `ValueError` y no `MasterAtRisk`: no hay ningún máster en peligro, hay una
        # fila que no dice de qué obra es. La excepción tiene que decir cuál de las
        # dos cosas ha pasado.
        raise ValueError("No se puede nombrar la copia corregida sin id de catalogación")
    base = f"{catalog_id}/{catalog_id}_{suffix or random_suffix()}"
    path = f"{base}{CORRECTED_SUFFIX}.{CORRECTED_EXTENSION}"
    check_not_master(path, master_path)
    return path


def check_not_master(path: str, master_path: str | None) -> None:
    """Aborta si la ruta es la de un máster o si parece serlo.

    Two checks and neither is redundant: the first is the rule of the schema —the
    two paths are not the same file— and the second refuses anything that merely
    *looks* like a master, which is what protects against a master this row does
    not know about. Signing a PUT for a `…_master.jpg` is the one operation that
    cannot be undone.
    """
    if master_path and path == master_path:
        raise MasterAtRisk(
            f"La ruta calculada para la copia corregida es la del máster ({path}). "
            "El máster no se reescribe nunca."
        )
    name = path.rsplit("/", 1)[-1]
    if MASTER_SUFFIX in name:
        raise MasterAtRisk(
            f"La ruta calculada para la copia corregida tiene forma de máster ({path})."
        )
    if not name.endswith(f"{CORRECTED_SUFFIX}.{CORRECTED_EXTENSION}"):
        raise MasterAtRisk(
            f"La ruta calculada no es la de una copia corregida ({path})."
        )
