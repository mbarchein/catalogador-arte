#!/usr/bin/env python3
"""What the corrected copy is called, and why it can never be called what the master is.

The master is uploaded once with the original bytes and is never rewritten
(ADR-002). The realistic way of breaking that is not a deletion: it is **deriving the
corrected copy's path from the master's** —changing its extension, reusing the
base— and having them coincide one day. The database defends it with the
`images_corrected_not_master` constraint, but by the time the base says no the
file has already been uploaded: here there is a check that is made before signing anything.

A separate module with no dependencies so that its test runs without PIL, alongside that of the
colour tables.
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
    """The computed path would touch a master. It aborts before signing anything."""


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
        # `ValueError` and not `MasterAtRisk`: there is no master at risk, there is a
        # row that does not say which artwork it belongs to. The exception has to say which of
        # the two things has happened.
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
