#!/usr/bin/env python3
"""Empties the queue of full-resolution corrected copies that were left pending.

RF-420 and RF-421, ADR-010. When the cataloguer applies a correction, the
browser generates the full-resolution copy with **all** the corrections
—rotation, crop, perspective and colour— and uploads it. When the device cannot
—a canvas's maximum area is limited by the phone, and in a store with bad
coverage 19 MB do not get uploaded—, the row is left marked as pending. This is what
empties it from a computer.

    python3 scripts/copias-corregidas/generate_copies.py volcados/20260801-1142
    python3 scripts/copias-corregidas/generate_copies.py --dry-run --out copias/

It has no Makefile target on purpose, just like `scripts/bordes`: it is
run by hand, with a dump in front, and what does have a target is the
check that ties it to the browser (`make casos-color`).

What it does, in this order and no other:

  1. it asks the base which rows have the copy pending;
  2. it reads each one's master —from the local mirror `make db-pull FOTOS=todo` leaves
     or, if it is not there, by a signed download URL—;
  3. it applies the **geometry** (EXIF orientation, rotation, and perspective or crop), stays
     at **full resolution** and applies the **colour** at the end, which is the
     canonical order the migration declares;
  4. it uploads the copy to Backblaze B2 through the signing function that already exists, at a
     path of its own that is never the master's;
  5. it writes `corrected_path` and `corrected_bytes` and switches off `corrected_pending`.

**The master is never touched** (ADR-002, §0.1). It is downloaded, read and left
the same: it is not rewritten, not recompressed, its EXIF is not fixed and no
upload is signed against its path. There is an explicit check before signing, in
`paths.py`, and its test.

**And it does not reimplement the colour criterion.** It rebuilds the same 256-entry
table per channel from the same parameters (`color_chain.py`), and that it be the
same is checked against the case file the frontend's tests generate
(`test_corrected_copies.py`). Without that, the thumbnail and the full-resolution
copy of the same artwork would come out a different colour.

Configuration, in `.env` like the rest of the local stack:

  VITE_SUPABASE_URL       the project's (`terraform -chdir=infra output -raw
                          supabase_url`) or the local stack's
  VITE_SUPABASE_ANON_KEY  the anonymous key, which is public by design: the project's
                          panel → Project Settings → API
  SUPABASE_EMAIL          a Cataloguer or Superuser account: whoever writes
  SUPABASE_PASSWORD       these columns has to be able to edit (`can_edit()`)

There are no B2 write credentials here and there must not be: the upload is signed
with the Edge function, with that account's session, just like the application.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from color_chain import (  # noqa: E402  — after sys.path, on purpose
    REC709_B,
    REC709_G,
    REC709_R,
    ColorLook,
    build_color_luts,
    look_from_row,
    round_half_up,
    srgb_to_linear_table,
)
from paths import (  # noqa: E402
    CORRECTED_CONTENT_TYPE,
    MasterAtRisk,
    check_not_master,
    corrected_path,
)

REPO = pathlib.Path(__file__).resolve().parents[2]

# Quality of the corrected copy. 92 with no chroma subsampling: its destination is
# a print shop or a curator (RF-411), so what it must not do is add its own
# artefacts to a photograph that already went through the master's JPEG.
JPEG_QUALITY = 92

# Rows of output processed at a time. Not a performance knob: it is what keeps a
# 64-megapixel master from needing its own gigabyte of intermediate float arrays,
# which is the same reason the browser works in horizontal bands.
BAND_ROWS = 64

# Columns the tool reads. Named explicitly and not `select=*` so that adding a
# column to the table cannot change what this script decides.
COLUMNS = ",".join(
    [
        "image_id",
        "catalog_id",
        "master_path",
        "master_bytes",
        "shot_type",
        "provenance",
        "rotation",
        "crop_x",
        "crop_y",
        "crop_width",
        "crop_height",
        "corner_nw_x",
        "corner_nw_y",
        "corner_ne_x",
        "corner_ne_y",
        "corner_se_x",
        "corner_se_y",
        "corner_sw_x",
        "corner_sw_y",
        "color_temperature",
        "color_tint",
        "color_exposure",
        "color_black",
        "color_white",
        "color_gamma",
        "color_shoulder",
        "color_gray",
        "corrected_path",
        "corrected_bytes",
        "corrected_pending",
    ]
)


# ── Configuration ───────────────────────────────────────────


def load_env() -> dict[str, str]:
    """Reads `.env` the way the rest of the local stack does, without overriding.

    Same file `docker/db-pull.sh` sources: it is in `.gitignore` and it is already
    where the local configuration lives. What is already in the environment wins,
    so a one-off run can override a line without editing the file.
    """
    values: dict[str, str] = {}
    env_file = REPO / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            values[key.strip()] = value
    # The real environment last, so it wins: a one-off run can override a line
    # without editing a file that holds production credentials.
    values.update(os.environ)
    return values


HELP_MISSING_CONFIG = """\
Falta configuración para hablar con la base y con la firma de subida.

En .env, junto a lo que ya hay:

  VITE_SUPABASE_URL=https://<ref>.supabase.co     (o la del stack local)
  VITE_SUPABASE_ANON_KEY=<clave anónima>
  SUPABASE_EMAIL=<cuenta de Catalogadora o Superusuaria>
  SUPABASE_PASSWORD=<su contraseña>

La URL del proyecto sale de la infraestructura:

  terraform -chdir=infra output -raw supabase_url

La clave anónima es pública por diseño —identifica al proyecto y no autoriza
nada, lo que protege los datos son las políticas RLS— y está en el panel:
Project Settings → API → Project API keys → anon public.

La cuenta tiene que poder editar: quien solo consulta no escribe estas columnas,
y la base lo negaría sin ruido, devolviendo cero filas actualizadas.
"""


# The signing function only signs paths shaped like a master's, and this is what it says
# when it is asked for a corrected copy's. Checked against the local stack:
# it answers 400 «ruta no válida para un máster», because its `VALID_PATH` requires the
# `_master` suffix. It is not a failure of this tool and it is not fixed from
# here either: the corrected copy is a new file at a new path in the same store
# (RF-420), so the function has to accept that suffix as well as the master's
# —and only that one— or there is no way of uploading it, neither from here nor from the browser.
HELP_SIGN_PATH = """\
La función de firma ha rechazado la ruta de la copia corregida:

  {path}

Solo firma rutas de máster: su comprobación `VALID_PATH` exige el sufijo
«_master». Hasta que acepte también el de la copia corregida, esta herramienta
puede generar los ficheros pero no subirlos:

  python3 scripts/copias-corregidas/generate_copies.py --dry-run --out copias/

El máster no corre ningún riesgo por esto, y es a propósito: la función se niega
a firmar lo que no reconoce en vez de firmar cualquier cosa del almacén.
"""


@dataclass(frozen=True)
class Config:
    base_url: str
    anon_key: str
    email: str
    password: str


def read_config(env: dict[str, str]) -> Config:
    def first(*names: str) -> str:
        for name in names:
            value = env.get(name, "").strip()
            if value:
                return value
        return ""

    base = first("VITE_SUPABASE_URL", "SUPABASE_URL").rstrip("/")
    config = Config(
        base_url=base,
        anon_key=first("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"),
        email=first("SUPABASE_EMAIL"),
        password=first("SUPABASE_PASSWORD"),
    )
    if not (config.base_url and config.anon_key and config.email and config.password):
        raise SystemExit(HELP_MISSING_CONFIG)
    return config


# ── The API: the same paths the application uses ────────────


class Api:
    """The base and the upload signature, with a real account's session.

    There is no service key and there must not be: this tool comes in where
    the application comes in, so the RLS policies hold just the same and a consultation-only
    account cannot write anything through here. It is also what allows signing the
    upload with the Edge function without carrying B2 credentials.
    """

    def __init__(self, config: Config) -> None:
        self.config = config
        self.token = ""
        self.token = self._sign_in()

    def _request(
        self,
        url: str,
        *,
        method: str = "GET",
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, bytes]:
        request = urllib.request.Request(url, data=body, method=method)
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            # The body of an error from PostgREST or from the Edge function carries
            # the reason in Spanish, and it is the only useful part of a 4xx.
            detail = error.read().decode("utf-8", "replace")[:500]
            raise RuntimeError(f"{method} {url} → HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"{method} {url} → sin respuesta: {error.reason}") from error

    def _json(self, url: str, *, method: str = "GET", payload: object = None,
              headers: dict[str, str] | None = None) -> object:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        all_headers = {"apikey": self.config.anon_key, "Content-Type": "application/json"}
        # Empty while signing in, which is the one call that has no session yet.
        if self.token:
            all_headers["Authorization"] = f"Bearer {self.token}"
        all_headers.update(headers or {})
        _, raw = self._request(url, method=method, body=body, headers=all_headers)
        return json.loads(raw) if raw else None

    def _sign_in(self) -> str:
        data = self._json(
            f"{self.config.base_url}/auth/v1/token?grant_type=password",
            method="POST",
            payload={"email": self.config.email, "password": self.config.password},
        )
        token = (data or {}).get("access_token") if isinstance(data, dict) else None
        if not token:
            raise RuntimeError("La sesión no ha devuelto ningún token: revisa la cuenta y la contraseña.")
        return str(token)

    def pending_images(self, only: str | None, limit: int | None) -> list[dict]:
        """The rows with the copy pending. Active only: a withdrawn image is not regenerated."""
        query = (
            f"{self.config.base_url}/rest/v1/images"
            f"?select={COLUMNS}&corrected_pending=is.true&active=is.true&order=image_id"
        )
        if only:
            query += f"&image_id=eq.{only}"
        if limit:
            query += f"&limit={limit}"
        rows = self._json(query)
        return list(rows) if isinstance(rows, list) else []

    def signed_upload(self, path: str) -> str:
        """A signed upload URL, through the Edge function. The only write path to B2."""
        try:
            data = self._json(
                f"{self.config.base_url}/functions/v1/sign-file",
                method="POST",
                payload={"operation": "upload", "path": path, "contentType": CORRECTED_CONTENT_TYPE},
            )
        except RuntimeError as error:
            if "ruta no válida" in str(error):
                raise RuntimeError(HELP_SIGN_PATH.format(path=path)) from error
            raise
        url = (data or {}).get("url") if isinstance(data, dict) else None
        if not url:
            raise RuntimeError(f"La función de firma no ha devuelto URL para {path}")
        return str(url)

    def signed_download(self, path: str) -> str:
        data = self._json(
            f"{self.config.base_url}/functions/v1/sign-file",
            method="POST",
            payload={"operation": "download", "path": path},
        )
        url = (data or {}).get("url") if isinstance(data, dict) else None
        if not url:
            raise RuntimeError(f"La función de firma no ha devuelto URL para {path}")
        return str(url)

    def put_object(self, url: str, content: bytes) -> None:
        """The PUT has to repeat exactly the signed Content-Type or the signature does not validate."""
        self._request(url, method="PUT", body=content, headers={"Content-Type": CORRECTED_CONTENT_TYPE})

    def mark_generated(
        self,
        image_id: str,
        path: str,
        size: int,
        pixels: tuple[int, int],
        original: tuple[int, int] | None = None,
    ) -> None:
        """It writes the copy in the row and switches off the pending flag, and checks that it really was written.

        `return=representation` is not an ornament: if the account cannot edit, the
        RLS policy gives no error, it returns **zero rows**. Without looking at the response,
        the tool would say it has emptied a queue that is still full.

        `pixels` is what the file MEASURED and not what the geometry says it should be:
        the record's download button reads it, and the two only differ when something has
        gone wrong — which is exactly when a caption must not be reassuring.

        `original` is written when it is known, which here is always: this tool decoded
        the master to build the copy. It is the same opportunistic filling in the browser
        does on every save, and it matters because nothing was filled in backwards
        (ADR-010) — every row this queue empties is a row whose original stops being of
        unknown size.
        """
        payload = {
            "corrected_path": path,
            "corrected_bytes": size,
            "corrected_pending": False,
            "corrected_width": pixels[0],
            "corrected_height": pixels[1],
        }
        if original is not None:
            payload["original_width"], payload["original_height"] = original
        rows = self._json(
            f"{self.config.base_url}/rest/v1/images?image_id=eq.{image_id}",
            method="PATCH",
            payload=payload,
            headers={"Prefer": "return=representation"},
        )
        if not isinstance(rows, list) or len(rows) != 1:
            raise RuntimeError(
                f"La base no ha actualizado la fila {image_id}: la copia está subida pero la "
                "ficha sigue diciendo que falta. ¿La cuenta puede editar?"
            )

    def fetch(self, url: str) -> bytes:
        _, raw = self._request(url)
        return raw


# ── Geometry: transcription of imageEdits.ts and perspective.ts ──


@dataclass(frozen=True)
class Geometry:
    rotation: int
    crop: tuple[float, float, float, float] | None
    corners: dict[str, tuple[float, float]] | None

    def is_identity(self) -> bool:
        return self.rotation == 0 and self.crop is None and self.corners is None


CORNER_KEYS = ("nw", "ne", "se", "sw")


def _clamp(value: float, low: float, high: float) -> float:
    if high < low:
        return low
    return min(max(value, low), high)


def signed_area(corners: dict[str, tuple[float, float]]) -> float:
    total = 0.0
    for i, key in enumerate(CORNER_KEYS):
        ax, ay = corners[key]
        bx, by = corners[CORNER_KEYS[(i + 1) % 4]]
        total += ax * by - bx * ay
    return total


def is_convex_quadrilateral(corners: dict[str, tuple[float, float]]) -> bool:
    """Transcripción de `isConvexQuadrilateral`: convexo, en sentido horario y con interior.

    Convex and not merely «does not cross itself»: a self-intersecting quadrilateral
    keeps a positive area whenever its larger lobe wins, and straightening one gives
    an image folded over itself. The projective image of a rectangle is always
    convex, so anything else is not a photograph of a painting seen at an angle.
    """
    if not signed_area(corners) > 0.01:
        return False
    for i, key in enumerate(CORNER_KEYS):
        ax, ay = corners[key]
        bx, by = corners[CORNER_KEYS[(i + 1) % 4]]
        cx, cy = corners[CORNER_KEYS[(i + 2) % 4]]
        if not (bx - ax) * (cy - by) - (by - ay) * (cx - bx) > 0:
            return False
    return True


def geometry_from_row(row: dict) -> Geometry:
    """The framing the row carries. The corners rule over the rectangle, as in the row."""
    # Any multiple of 90, positive or negative, brought into 0/90/180/270, as
    # `normalizeRotation` does.
    quarters = round_half_up(float(row.get("rotation") or 0) / 90)
    rotation = ((quarters % 4) + 4) % 4 * 90

    corner_values: dict[str, tuple[float, float]] = {}
    for key in CORNER_KEYS:
        x = row.get(f"corner_{key}_x")
        y = row.get(f"corner_{key}_y")
        if x is None or y is None:
            corner_values = {}
            break
        corner_values[key] = (float(x), float(y))
    if corner_values and is_convex_quadrilateral(corner_values):
        return Geometry(rotation=rotation, crop=None, corners=corner_values)

    parts = [row.get("crop_x"), row.get("crop_y"), row.get("crop_width"), row.get("crop_height")]
    if any(part is None for part in parts):
        return Geometry(rotation=rotation, crop=None, corners=None)
    x, y, width, height = (float(part) for part in parts)  # type: ignore[arg-type]
    # A rectangle that keeps everything is not a crop at all, same as `isFullCrop`.
    if x <= 1e-6 and y <= 1e-6 and width >= 1 - 1e-6 and height >= 1 - 1e-6:
        return Geometry(rotation=rotation, crop=None, corners=None)
    return Geometry(rotation=rotation, crop=(x, y, width, height), corners=None)


def clamp_crop(crop: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    min_side = 1e-4
    width = _clamp(crop[2], min_side, 1)
    height = _clamp(crop[3], min_side, 1)
    return (
        _clamp(crop[0], 0, 1 - width),
        _clamp(crop[1], 0, 1 - height),
        width,
        height,
    )


def crop_rect_in_pixels(
    crop: tuple[float, float, float, float], size: tuple[int, int]
) -> tuple[int, int, int, int]:
    """A transcription of `cropRectInPixels`. The rounding is JavaScript's (halves up)."""
    safe = clamp_crop(crop)
    width = max(1, round_half_up(size[0]))
    height = max(1, round_half_up(size[1]))
    x = int(_clamp(round_half_up(safe[0] * width), 0, width - 1))
    y = int(_clamp(round_half_up(safe[1] * height), 0, height - 1))
    return (
        x,
        y,
        int(_clamp(round_half_up(safe[2] * width), 1, width - x)),
        int(_clamp(round_half_up(safe[3] * height), 1, height - y)),
    )


def straightened_size(
    corners: dict[str, tuple[float, float]], frame: tuple[int, int]
) -> tuple[float, float]:
    """Transcripción de `straightenedSize`: la media de los lados opuestos.

    The frame in pixels is an argument and not optional for the reason the
    TypeScript spells out: a fraction of the width and a fraction of the height are
    only the same length when the frame is square, so each side has to be measured
    in the unit of the side it belongs to.
    """
    w = frame[0] if frame[0] > 0 else 1
    h = frame[1] if frame[1] > 0 else 1
    aspect = w / h

    def along_width(a: tuple[float, float], b: tuple[float, float]) -> float:
        return math.hypot(b[0] - a[0], (b[1] - a[1]) / aspect)

    def along_height(a: tuple[float, float], b: tuple[float, float]) -> float:
        return math.hypot((b[0] - a[0]) * aspect, b[1] - a[1])

    return (
        (along_width(corners["nw"], corners["ne"]) + along_width(corners["sw"], corners["se"])) / 2,
        (along_height(corners["nw"], corners["sw"]) + along_height(corners["ne"], corners["se"])) / 2,
    )


def homography_from_unit_square(
    corners: dict[str, tuple[float, float]]
) -> tuple[float, ...] | None:
    """Transcripción de `homographyFromUnitSquare`: del cuadrado unidad a las cuatro esquinas.

    Destination to source, which is the direction the renderer needs: it walks the
    pixels of the straightened output and asks each one where it comes from, which
    is the only way to fill every output pixel exactly once.
    """
    nw, ne, se, sw = (corners[key] for key in ("nw", "ne", "se", "sw"))
    dx1 = ne[0] - se[0]
    dx2 = sw[0] - se[0]
    dy1 = ne[1] - se[1]
    dy2 = sw[1] - se[1]
    sx = nw[0] - ne[0] + se[0] - sw[0]
    sy = nw[1] - ne[1] + se[1] - sw[1]

    determinant = dx1 * dy2 - dx2 * dy1
    if abs(determinant) < 1e-12:
        return None

    if abs(sx) < 1e-12 and abs(sy) < 1e-12:
        # A parallelogram: the transform is affine and the third row is zero. The
        # common case —a photograph taken square on— and the general formula would
        # divide two near-zero numbers there and hand back noise as a perspective.
        g = 0.0
        h = 0.0
    else:
        g = (sx * dy2 - dx2 * sy) / determinant
        h = (dx1 * sy - sx * dy1) / determinant

    return (
        ne[0] - nw[0] + g * ne[0],
        sw[0] - nw[0] + h * sw[0],
        nw[0],
        ne[1] - nw[1] + g * ne[1],
        sw[1] - nw[1] + h * sw[1],
        nw[1],
        g,
        h,
        1.0,
    )


def rotate_clockwise(image: Image.Image, rotation: int) -> Image.Image:
    """The rotation in quarters, without resampling: `transpose` moves pixels, it does not interpolate them."""
    if rotation == 90:
        return image.transpose(Image.Transpose.ROTATE_270)
    if rotation == 180:
        return image.transpose(Image.Transpose.ROTATE_180)
    if rotation == 270:
        return image.transpose(Image.Transpose.ROTATE_90)
    return image


def straighten(image: Image.Image, corners: dict[str, tuple[float, float]]) -> Image.Image:
    """La obra enderezada: el cuadrilátero de sus cuatro esquinas llevado a un rectángulo.

    The same definition as `straightenedCanvas` — same homography, same bilinear
    sample, same white where the source falls outside the photograph, same output
    size as `editedSize` — with **one deliberate difference**: the browser first
    draws the photograph down to 2400 px because `getImageData` of a 64-megapixel
    master is 256 MB and a phone does not have it, while here the warp runs at full
    resolution, which is the entire point of this file (RF-420). So the corrected
    copy is not a scaled-up version of the derivative: it is sharper, and it is
    sampled once instead of twice.

    White and not transparent where a corner sits outside the photograph: in five
    photographs of the catalog the sides of the artwork are out of frame, and
    dragging a handle past the edge is the only way to straighten those. What is not
    in the shot has to read as blank paper, not as a hole that samples black.
    """
    homography = homography_from_unit_square(corners)
    if homography is None:
        raise ValueError("Las cuatro esquinas no forman un cuadrilátero")

    width, height = image.size
    fraction = straightened_size(corners, (width, height))
    out_width = max(1, round_half_up(fraction[0] * width))
    out_height = max(1, round_half_up(fraction[1] * height))

    source = np.asarray(image.convert("RGB"))
    destination = np.empty((out_height, out_width, 3), dtype=np.uint8)

    u = (np.arange(out_width, dtype=np.float64) + 0.5) / out_width
    h = homography

    for start in range(0, out_height, BAND_ROWS):
        stop = min(start + BAND_ROWS, out_height)
        v = (np.arange(start, stop, dtype=np.float64) + 0.5) / out_height
        grid_u = u[None, :]
        grid_v = v[:, None]

        z = h[6] * grid_u + h[7] * grid_v + h[8]
        # The same guard as `applyHomography`: where the third coordinate vanishes
        # the point is left as it came instead of dividing by nothing.
        degenerate = np.abs(z) < 1e-12
        safe_z = np.where(degenerate, 1.0, z)
        px = np.where(degenerate, grid_u + 0.0 * grid_v, (h[0] * grid_u + h[1] * grid_v + h[2]) / safe_z)
        py = np.where(degenerate, grid_v + 0.0 * grid_u, (h[3] * grid_u + h[4] * grid_v + h[5]) / safe_z)

        # The centre of the pixel and not its corner: sampling at the corner shifts
        # the whole image half a pixel, which on a border is visible.
        sx = px * width - 0.5
        sy = py * height - 0.5
        inside = (sx >= 0) & (sy >= 0) & (sx <= width - 1) & (sy <= height - 1)

        sx_safe = np.clip(sx, 0, width - 1)
        sy_safe = np.clip(sy, 0, height - 1)
        x0 = np.floor(sx_safe).astype(np.int64)
        y0 = np.floor(sy_safe).astype(np.int64)
        x1 = np.minimum(width - 1, x0 + 1)
        y1 = np.minimum(height - 1, y0 + 1)
        fx = (sx_safe - x0)[:, :, None]
        fy = (sy_safe - y0)[:, :, None]

        p00 = source[y0, x0].astype(np.float64)
        p10 = source[y0, x1].astype(np.float64)
        p01 = source[y1, x0].astype(np.float64)
        p11 = source[y1, x1].astype(np.float64)
        value = (
            p00 * (1 - fx) * (1 - fy)
            + p10 * fx * (1 - fy)
            + p01 * (1 - fx) * fy
            + p11 * fx * fy
        )
        # `rint` and not `floor(x + 0.5)`: what the browser writes here goes into a
        # `Uint8ClampedArray`, whose conversion rounds halves to EVEN. The tables
        # round halves up because there it is `Math.round`. Two different roundings
        # in the same pipeline is not an oversight, it is what the two sides do.
        value = np.rint(value)
        np.copyto(value, 255.0, where=~inside[:, :, None])
        destination[start:stop] = np.clip(value, 0, 255).astype(np.uint8)

    return Image.fromarray(destination, mode="RGB")


def apply_geometry(image: Image.Image, geometry: Geometry) -> tuple[Image.Image, tuple[int, int]]:
    """Orientación EXIF, giro, y después perspectiva o recorte. En ese orden.

    `exif_transpose` first and before anything else: it is what
    `imageOrientation: 'from-image'` does in `createImageBitmap`, and the quarter
    turn the cataloger applied started from the picture the phone had already
    turned. Straightening or cropping a photograph lying on its side would frame
    another part of the artwork.

    It also returns the UPRIGHT size, which is the one `original_width` names and the one
    any viewer shows. It comes out of here and is not measured again outside because the
    only place that knows it is this one: the caller has the raw decode, and transposing a
    second time just to measure it would copy a 4000×3000 image for two integers.
    """
    upright = ImageOps.exif_transpose(image) or image
    original = (upright.width, upright.height)
    rotated = rotate_clockwise(upright, geometry.rotation)
    if geometry.corners:
        return straighten(rotated, geometry.corners), original
    if geometry.crop:
        x, y, width, height = crop_rect_in_pixels(geometry.crop, rotated.size)
        return rotated.crop((x, y, x + width, y + height)), original
    return rotated, original


# ── Colour: the tables, and the luminance step after them ───


def apply_color(image: Image.Image, look: ColorLook) -> Image.Image:
    """La tabla de 256 entradas por canal, y después el paso de blanco y negro.

    `Image.point` applies the three tables in one pass — one lookup per channel per
    pixel, which is why there is a table at all: the chain has two powers in it and
    a 24-megapixel master would evaluate them 72 million times.
    """
    rgb = image if image.mode == "RGB" else image.convert("RGB")
    luts = build_color_luts(look)
    corrected = rgb.point(luts.flat())
    return apply_gray(corrected) if luts.gray else corrected


def apply_gray(image: Image.Image) -> Image.Image:
    """Luminancia Rec. 709 **en luz lineal**, sobre los códigos ya pasados por la tabla.

    Not `convert("L")`, which weights the codes with the ITU-R 601 coefficients:
    that would crush the greens and lift the blues, and the point of a black and
    white photograph of a signature is the legibility of the stroke.

    In bands, and the same arithmetic in the same order as `gray_from_rgb`, which
    is what the case file pins: the three products are summed as they are summed
    there, because floating point addition is not associative.
    """
    table = np.array(srgb_to_linear_table(), dtype=np.float64)
    source = np.asarray(image.convert("RGB"))
    height = source.shape[0]
    destination = np.empty(source.shape[:2], dtype=np.uint8)
    for start in range(0, height, BAND_ROWS * 4):
        stop = min(start + BAND_ROWS * 4, height)
        band = source[start:stop]
        linear = (
            REC709_R * table[band[:, :, 0]]
            + REC709_G * table[band[:, :, 1]]
            + REC709_B * table[band[:, :, 2]]
        )
        encoded = np.where(
            linear <= 0.0031308,
            linear * 12.92,
            1.055 * np.power(linear, 1 / 2.4) - 0.055,
        )
        # `Math.round`, which is halves up: this one goes through `grayFromRgb` in
        # the browser and not through a clamped array.
        destination[start:stop] = np.clip(np.floor(encoded * 255 + 0.5), 0, 255).astype(np.uint8)
    # Back to three equal channels, which is what the browser leaves in the pixels.
    return Image.fromarray(destination, mode="L").convert("RGB")


def looks_blank(image: Image.Image) -> bool:
    """Un fichero en blanco no se sube. Nunca (RF-420).

    The failure this guards against is the browser's —a canvas past the device's
    maximum area comes out white with no error at all— and it cannot happen here,
    because there is no canvas. It is checked anyway: the cost is one pass over the
    extremes, and the thing being prevented is a print shop receiving a blank sheet
    of an artwork. A photograph of an artwork that is uniformly white does not exist.
    """
    extrema = image.convert("RGB").getextrema()
    return all(low == high == 255 for low, high in extrema)


# ── The master, which is only ever read ─────────────────────


def read_master(api: Api, row: dict, dump: pathlib.Path | None) -> bytes:
    """Los bytes del máster, del espejo local o por URL firmada. Sin tocarlo.

    The local mirror first because that is what ADR-010 leans on —`make db-pull
    FOTOS=todo` leaves the whole bucket under `masters/`— and because a 19 MB
    download per photograph from a laptop is a waste when the file is already on
    disk. Neither path writes anything: this function returns bytes and the master
    stays exactly as it was.
    """
    master_path = row.get("master_path")
    if not master_path:
        raise RuntimeError(
            "La fila no tiene máster, así que no hay original del que partir: la copia "
            "corregida no puede salir de la derivada, que ya lleva las correcciones cocidas."
        )
    if dump is not None:
        local = dump / "masters" / master_path
        if local.is_file():
            return local.read_bytes()
    return api.fetch(api.signed_download(master_path))


def newest_dump() -> pathlib.Path | None:
    """The most recent dump that brings masters, if there is one."""
    root = REPO / "volcados"
    if not root.is_dir():
        return None
    candidates = sorted(
        (path for path in root.iterdir() if (path / "masters").is_dir()),
        key=lambda path: path.name,
    )
    return candidates[-1] if candidates else None


# ── One row ─────────────────────────────────────────────────


@dataclass
class Outcome:
    """Qué ha pasado con una fila. Tres estados, como los de la propia fila.

    `pending` is not the same as `generated`, and neither is the same as `done`: a
    dry run that produced the file is not a failure and must not be counted as one,
    and a row that stayed pending has to make the whole command come back with a
    non-zero exit code. Collapsing the three into a boolean is how a queue gets
    reported as emptied while it is still full.
    """

    image_id: str
    state: str  # "done" | "generated" | "pending"
    detail: str


def process(
    api: Api,
    row: dict,
    dump: pathlib.Path | None,
    *,
    upload: bool,
    out_dir: pathlib.Path | None,
) -> Outcome:
    image_id = str(row.get("image_id"))
    catalog_id = str(row.get("catalog_id"))
    geometry = geometry_from_row(row)
    look = look_from_row(row)

    if geometry.is_identity() and look.is_identity():
        # «Not needed» and «could not be done» are different rows, and this is the
        # first one: with no corrections the corrected copy would be a duplicate of the
        # master, and what RF-411 has to deliver is the master.
        return Outcome(
            image_id,
            "pending",
            "no tiene ninguna corrección: no hace falta copia. La fila sigue marcada como "
            "pendiente y conviene revisarla, porque pendiente significa que un dispositivo "
            "lo intentó y no pudo.",
        )

    if row.get("provenance") not in (None, "OWN") and not look.is_identity():
        # What the row says is applied, which is the source of truth, but it is said:
        # the colour adjustment is not offered over somebody else's reproduction (RF-417), so
        # a row like that should not exist.
        print(
            f"    · aviso: procedencia {row.get('provenance')} con ajuste de color guardado",
            file=sys.stderr,
        )

    master = read_master(api, row, dump)
    with Image.open(BytesIO(master)) as opened:
        opened.load()
        # Geometry → full resolution → colour, the canonical order of the migration.
        # The colour goes last and is NOT folded into the bilinear loop of the warp,
        # even though it would cost nothing there: that would put the colour before
        # the resampling on one path and after it on the other, and the corrected
        # copy would stop matching the thumbnail.
        edited, original = apply_geometry(opened, geometry)
    corrected = apply_color(edited, look)

    if looks_blank(corrected):
        return Outcome(
            image_id,
            "pending",
            "la copia ha salido en blanco: no se sube. La fila se queda pendiente.",
        )

    buffer = BytesIO()
    corrected.save(
        buffer,
        format="JPEG",
        quality=JPEG_QUALITY,
        # 4:4:4: the destination is a reproduction, and chroma subsampling on a
        # painting shows exactly on the coloured edges a print shop looks at.
        subsampling=0,
        optimize=True,
        # No EXIF is copied on purpose. The orientation is already cooked into these
        # pixels, so carrying the master's `Orientation` over would turn the
        # photograph again in whatever opens it. The camera data of the shot is in
        # the master, which is where it belongs.
    )
    content = buffer.getvalue()

    if out_dir is not None:
        local = out_dir / f"{image_id.replace('/', '_')}.jpg"
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(content)

    size = f"{corrected.width}×{corrected.height}, {len(content) / 1_048_576:.1f} MB"
    if not upload:
        return Outcome(image_id, "generated", f"generada y NO subida ({size})")

    # The path is checked against the master's before anything is signed: signing a
    # PUT over a master is the one operation that cannot be undone (§0.1).
    path = corrected_path(catalog_id, row.get("master_path"))
    check_not_master(path, row.get("master_path"))
    api.put_object(api.signed_upload(path), content)
    api.mark_generated(
        image_id,
        path,
        len(content),
        (corrected.width, corrected.height),
        # The master with its orientation applied, which is what `original_width` names:
        # `apply_geometry` measured it before turning or cropping anything.
        original,
    )
    return Outcome(image_id, "done", f"{path} ({size})")


# ── The command ─────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Genera las copias corregidas a resolución completa pendientes (RF-421).",
        epilog="Documentación completa en la cabecera del fichero.",
    )
    parser.add_argument(
        "dump",
        nargs="?",
        help="Volcado con el espejo de los másters (volcados/AAAAMMDD-HHMM). "
        "Por omisión, el más reciente que tenga masters/; si no hay ninguno, se "
        "descarga cada máster por URL firmada.",
    )
    parser.add_argument("--only", metavar="IMAGE_ID", help="Una sola imagen, por su identificador.")
    parser.add_argument("--limit", type=int, help="Como máximo tantas filas.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Genera las copias y no sube ni escribe nada en la base.",
    )
    parser.add_argument(
        "--out",
        metavar="CARPETA",
        help="Guarda además cada copia en esta carpeta local, para mirarla. Son "
        "fotografías de obra real y este repositorio es público (ADR-005): la "
        "carpeta no se versiona.",
    )
    args = parser.parse_args()

    dump = pathlib.Path(args.dump) if args.dump else newest_dump()
    if dump is not None and not (dump / "masters").is_dir():
        print(f"No hay masters/ en {dump}: los másters se descargarán firmados.", file=sys.stderr)
        dump = None
    out_dir = pathlib.Path(args.out) if args.out else None

    config = read_config(load_env())
    api = Api(config)
    rows = api.pending_images(args.only, args.limit)

    if not rows:
        # Never a blank page, not in a terminal either: an empty queue is an
        # answer and it is stated as such.
        print("No hay ninguna copia corregida pendiente.")
        return 0

    print(f"{len(rows)} copia(s) pendiente(s).")
    if dump is not None:
        print(f"Másters del espejo local: {dump}/masters")
    if args.dry_run:
        print("Modo --dry-run: no se sube nada ni se escribe en la base.")
    if out_dir is not None:
        # It is said out loud and not only in the help: what is going to be left on the
        # disk are photographs of real artworks, and this repository is public
        # (ADR-005). `volcados/` and `corpus-bordes/` are in .gitignore for the same reason.
        print(f"Copias también en {out_dir}/ — no la versiones: son fotografías de obra real.")
    print()

    done = 0
    generated = 0
    pending: list[Outcome] = []
    for row in rows:
        image_id = str(row.get("image_id"))
        print(f"  · {image_id}", flush=True)
        try:
            outcome = process(api, row, dump, upload=not args.dry_run, out_dir=out_dir)
        except (MasterAtRisk, RuntimeError, ValueError, OSError) as error:
            # A photo that cannot be processed is a datum, not a reason to stop:
            # it is stated, it is counted and the rest are carried on with.
            pending.append(Outcome(image_id, "pending", str(error)))
            print(f"    ✗ {error}", file=sys.stderr)
            continue
        if outcome.state == "done":
            done += 1
            print(f"    ✓ {outcome.detail}")
        elif outcome.state == "generated":
            generated += 1
            print(f"    ✓ {outcome.detail}")
        else:
            pending.append(outcome)
            print(f"    · {outcome.detail}")

    print()
    if generated:
        print(f"{generated} copia(s) generada(s) sin subir, por --dry-run.")
    print(f"{done} copia(s) subida(s) y registrada(s).")
    if pending:
        # What is still pending is stated in full and by name: a queue that announces
        # itself empty and is not is worse than a full queue.
        print(f"{len(pending)} sigue(n) pendiente(s):", file=sys.stderr)
        for outcome in pending:
            print(f"  · {outcome.image_id}: {outcome.detail}", file=sys.stderr)
        # A non-zero exit status, for whoever has called this from elsewhere.
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
