#!/usr/bin/env python3
"""La cadena canónica de color, transcrita fuera del navegador (RF-414, RF-421).

Esto NO decide nada sobre el color: lo decide `app/src/lib/imageColor.ts`, que es
la definición normativa. Aquí se transcribe paso por paso para poder aplicarla
desde un portátil a los másteres cuyas copias corregidas quedaron pendientes
(RF-420, ADR-010), y la igualdad con el navegador **no se supone**: se comprueba
contra `app/src/lib/__fixtures__/color-luts.json`, que generan los tests del
frontend, en `test_corrected_copies.py`.

Ese fichero de casos es el motivo de que este módulo exista separado y **sin más
dependencias que la biblioteca estándar**: su test tiene que poder pasar en
cualquier máquina, sin numpy, sin PIL y sin red, porque es el que impide que la
miniatura y la copia a resolución completa de la misma obra salgan de distinto
color. Lo que necesita PIL vive en `generate_copies.py`.

Si esta transcripción y `imageColor.ts` se separan, el test falla y dice cuál es
la entrada que difiere. Regenerar el fichero de casos —`make casos-color`— es
el paso consciente que hay que dar al cambiar la cadena, en los dos lados.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

# ── The transfer functions (step 1 and step 5) ──────────────
#
# The whole sRGB curve, with its linear segment below 0.04045, and not `x ** 2.2`.
# The reason is in imageColor.ts and it is not academic: at code 4 the pure power
# law is off by 40 % of the linear value, which is exactly where the black point
# works, and step 7 amplifies that error with a fractional exponent. The
# near-black of a photograph taken in a storeroom is the subject here, not a
# corner case.


def srgb_to_linear(value: float) -> float:
    """Encoded value (0…1) to linear light."""
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def linear_to_srgb(value: float) -> float:
    """Linear light back to an encoded value (0…1)."""
    return value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


# Rec. 709 luminance weights, applied in LINEAR light. Averaging codes makes a
# green far too dark and a blue far too light, and on a signature that is the
# difference between reading the stroke and not reading it.
REC709_R = 0.2126
REC709_G = 0.7152
REC709_B = 0.0722

# ── The parameters: ranges, steps and identities (§3.1) ─────
#
# The same closed table as COLOR_RANGES in imageColor.ts and the same one the
# `check` constraints of the migration carry. It is here so that a value read
# from a row can be clamped and quantized exactly as the browser would, and NOT
# so that anybody can add an eighth parameter: the set is closed (RF-415).

TEMPERATURE_MIN, TEMPERATURE_MAX = -60, 60
TINT_MIN, TINT_MAX = -40, 40
EXPOSURE_MIN, EXPOSURE_MAX = -2.0, 2.0
BLACK_MIN, BLACK_MAX = 0, 64
WHITE_MIN, WHITE_MAX = 192, 255
GAMMA_MIN, GAMMA_MAX = 0.6, 1.6
SHOULDER_MIN, SHOULDER_MAX = 0, 100

# How many stops each end of the temperature scale moves red and blue, in
# opposite directions, and the same for the green–magenta axis. Measured against
# what a photograph taken under a bulb actually leaves once the phone has applied
# its own white balance; the reasoning is in `gainsFromNeutral`.
TEMPERATURE_STOPS = 0.75
TINT_STOPS = 0.35

# How far down from white the shoulder reaches at `shoulder = 100`.
SHOULDER_DEPTH = 0.4


@dataclass(frozen=True)
class ColorLook:
    """The part of a colour adjustment that decides pixels.

    Every field has an **identity value**, which is what makes a null column mean
    «this one does nothing» and never «unknown» — that is what lets a row written
    before the feature existed be read without migrating its data.

    The provenance of the adjustment (`color_source`, `color_reference`,
    `color_light`, `color_neutral_*`) is deliberately absent: it changes no pixel,
    so it has no business in the code that writes pixels.
    """

    temperature: float = 0.0
    tint: float = 0.0
    exposure: float = 0.0
    black_point: float = 0.0
    white_point: float = 255.0
    gamma: float = 1.0
    shoulder: float = 0.0
    gray: bool = False

    def is_identity(self) -> bool:
        """True when the adjustment changes no pixel. Same criterion as `isNoColor`."""
        return (
            self.temperature == 0
            and self.tint == 0
            and abs(self.exposure) <= 1e-9
            and self.black_point == 0
            and self.white_point == 255
            and abs(self.gamma - 1) <= 1e-9
            and self.shoulder == 0
            and not self.gray
        )


def _clamp(value: float, low: float, high: float) -> float:
    if high < low:
        return low
    return min(max(value, low), high)


def round_half_up(value: float) -> int:
    """`Math.round` of JavaScript, which is NOT Python's `round`.

    Python rounds halves to even (`round(0.5) == 0`, `round(2.5) == 2`) and
    JavaScript rounds them up. The tables are 8-bit codes, so a code sitting
    exactly on a half is not a rarity: with the identity adjustment alone, the
    difference would land on entries of the table and the two implementations
    would disagree by one level on real photographs.

    Only used where the value cannot be negative, which is every rounding of this
    chain: step 7 clamps at zero before the exponent.
    """
    return math.floor(value + 0.5)


def _quantize(value: float, decimals: int) -> float:
    """Rounds to the precision of the column, as `quantize` does before storing."""
    factor = 10**decimals
    return round_half_up(value * factor) / factor


def clamp_temperature(value: float) -> float:
    return _quantize(_clamp(value, TEMPERATURE_MIN, TEMPERATURE_MAX), 0)


def clamp_tint(value: float) -> float:
    return _quantize(_clamp(value, TINT_MIN, TINT_MAX), 0)


def channel_gains(temperature: float, tint: float) -> tuple[float, float, float]:
    """The three linear-light gains of step 2, from the two stored numbers.

    **Normalized so the largest gain is exactly 1**, which is a decision with a
    consequence worth keeping in mind here too: correcting a cast can only ever
    darken, so it can never blow a highlight by itself. Anything blown was blown
    by the exposure or was blown in the master.
    """
    t = clamp_temperature(temperature) / TEMPERATURE_MAX
    m = clamp_tint(tint) / TINT_MAX
    r = 2 ** (TEMPERATURE_STOPS * t)
    g = 2 ** (-TINT_STOPS * m)
    b = 2 ** (-TEMPERATURE_STOPS * t)
    largest = max(r, g, b)
    return r / largest, g / largest, b / largest


def _compress_shoulder(x: float, knee: float) -> float:
    """Monotone compression of everything above the knee (step 4).

    An exponential approach to 1: slope exactly 1 at the knee so nothing kinks,
    strictly increasing, and 1 as an asymptote it never reaches. The consequence
    is intended — white itself comes out slightly below white — because a
    highlight that is compressed and readable is worth more than one that is
    nominally 255.
    """
    span = 1 - knee
    if span <= 0 or x <= knee:
        return x
    return knee + span * (1 - math.exp(-(x - knee) / span))


@dataclass(frozen=True)
class ColorLuts:
    """Three tables of 256 entries, plus whether the luminance step follows them."""

    r: list[int]
    g: list[int]
    b: list[int]
    gray: bool

    def flat(self) -> list[int]:
        """The three tables as the 768 entries `Image.point` wants for an RGB image."""
        return self.r + self.g + self.b


def build_color_luts(look: ColorLook) -> ColorLuts:
    """The canonical chain of §3.2 as three tables. Transcription of `buildColorLuts`.

    The order is the one imageColor.ts fixes and no other, and the two places it
    is easy to «tidy up» are the two that must not move: steps 2, 3 and 4 are in
    **linear light**, because that is where light adds up, and steps 6 and 7 are
    in **encoded** sRGB, because the two points and the midtones are read off the
    histogram the cataloger is looking at, which is the encoded one.

    `gray` is not in the tables. It cannot be: it needs the three channels at
    once, so it comes after them (see `gray_from_rgb`).
    """
    gains = channel_gains(look.temperature, look.tint)
    exposure = 2**look.exposure
    knee = 1 - SHOULDER_DEPTH * (look.shoulder / 100)
    black = look.black_point / 255
    # The span is never zero: the ranges of the two points guarantee at least 128
    # codes between them, and the row carries that as a constraint.
    span = (look.white_point - look.black_point) / 255
    inverse_gamma = 1 / look.gamma

    def table(gain: float) -> list[int]:
        lut: list[int] = []
        for i in range(256):
            # 1. encoded code to linear light, with the linear segment of the EOTF.
            x = srgb_to_linear(i / 255)
            # 2. white balance, in linear light and with gains that never exceed 1.
            x *= gain
            # 3. exposure, which is a multiplication of light and nothing else.
            x *= exposure
            # 4. the shoulder, before encoding, so it compresses light and not codes.
            if look.shoulder > 0:
                x = _compress_shoulder(x, knee)
            # 5. back to encoded sRGB.
            y = linear_to_srgb(x)
            # 6. the two points, mapping [black, white] onto [0, 1].
            y = (y - black) / span
            # 7. midtones. `max(0, …)` is not defensive: below the black point y IS
            #    negative, and a negative to a fractional power is a complex number
            #    in Python and a NaN in JavaScript. Either way the channel would
            #    come out blank, and it would be discovered in the print shop.
            y = max(0.0, y) ** inverse_gamma
            # 8. and back to a code, with the rounding JavaScript does.
            lut.append(int(_clamp(round_half_up(y * 255), 0, 255)))
        return lut

    return ColorLuts(
        r=table(gains[0]),
        g=table(gains[1]),
        b=table(gains[2]),
        gray=look.gray,
    )


def gray_from_rgb(r: int, g: int, b: int) -> int:
    """Rec. 709 luminance of a colour, in linear light, as a code.

    This is the `gray` step and it goes AFTER the tables. In linear light because
    luminance is a sum of light: computed on the codes, the same painting comes
    out with its greens crushed and its blues lifted.

    The order of the three products is the order of `grayFromRgb`, and it is kept
    on purpose — floating point addition is not associative, and this function is
    compared against the browser's answer entry by entry.
    """
    linear = (
        REC709_R * srgb_to_linear(_clamp(r, 0, 255) / 255)
        + REC709_G * srgb_to_linear(_clamp(g, 0, 255) / 255)
        + REC709_B * srgb_to_linear(_clamp(b, 0, 255) / 255)
    )
    return int(_clamp(round_half_up(linear_to_srgb(linear) * 255), 0, 255))


def srgb_to_linear_table() -> list[float]:
    """The EOTF as a 256-entry table, for whoever applies `gray` over many pixels.

    Same values as `srgb_to_linear`, so the fast path over an array and the scalar
    function above cannot disagree: there is one definition and this is a lookup
    of it.
    """
    return [srgb_to_linear(i / 255) for i in range(256)]


# ── Reading the row (§5) ────────────────────────────────────


# Room for the float noise of a `numeric` round trip before a value is out of range.
RANGE_TOLERANCE = 1e-9

# Range, identity and decimals of each parameter: the closed table of §3.1, in the
# form a stored value is read with. The decimals are those of the column —
# `numeric(3,2)` for the exposure and the midtones, `smallint` for the rest.
_PARAMS: dict[str, tuple[float, float, float, int]] = {
    "temperature": (TEMPERATURE_MIN, TEMPERATURE_MAX, 0.0, 0),
    "tint": (TINT_MIN, TINT_MAX, 0.0, 0),
    "exposure": (EXPOSURE_MIN, EXPOSURE_MAX, 0.0, 2),
    "black_point": (BLACK_MIN, BLACK_MAX, 0.0, 0),
    "white_point": (WHITE_MIN, WHITE_MAX, 255.0, 0),
    "gamma": (GAMMA_MIN, GAMMA_MAX, 1.0, 2),
    "shoulder": (SHOULDER_MIN, SHOULDER_MAX, 0.0, 0),
}


def _param(value: object, key: str) -> float:
    """Un valor tal como está guardado: en rango y en la precisión de su columna.

    Transcription of `param` in imageColor.ts, **including what it does with a value
    it should never see**: null, anything that is not a finite number and anything
    outside its range all read as that parameter's **identity**, not as the nearest
    end of the scale.

    That last part is not defensive programming, it is agreement. The browser reads
    a corrupt value as the identity and shows the photograph as it is; if this read
    it as the nearest end instead, the one row where the two disagree would be the
    row nobody can explain — the thumbnail neutral and the print copy corrected, out
    of the same numbers. `numeric` can also arrive as a string here depending on the
    client, and that is why the conversion is explicit.
    """
    low, high, default, decimals = _PARAMS[key]
    if value is None or isinstance(value, bool):
        return default
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    if number < low - RANGE_TOLERANCE or number > high + RANGE_TOLERANCE:
        return default
    return _quantize(_clamp(number, low, high), decimals)


def look_from_row(row: dict) -> ColorLook:
    """El ajuste que lleva una fila de `public.images`.

    Null is the identity and not the unknown, exactly as in `colorFromColumns`: that
    is what lets a row written before this feature existed be read as neutral
    without a migration of its data.
    """
    return ColorLook(
        temperature=_param(row.get("color_temperature"), "temperature"),
        tint=_param(row.get("color_tint"), "tint"),
        exposure=_param(row.get("color_exposure"), "exposure"),
        black_point=_param(row.get("color_black"), "black_point"),
        white_point=_param(row.get("color_white"), "white_point"),
        gamma=_param(row.get("color_gamma"), "gamma"),
        shoulder=_param(row.get("color_shoulder"), "shoulder"),
        gray=row.get("color_gray") is True,
    )


def look_from_case(case: dict) -> ColorLook:
    """Un caso de `color-luts.json` como `ColorLook`. Lo usa el test.

    Read through the same door as a row on purpose: the case file carries the
    parameters already normalized, so this changes none of them, and reading them by
    another path would leave `look_from_row` —which is the one that decides pixels—
    outside what the case file verifies.
    """
    return ColorLook(
        temperature=_param(case.get("temperature"), "temperature"),
        tint=_param(case.get("tint"), "tint"),
        exposure=_param(case.get("exposure"), "exposure"),
        black_point=_param(case.get("blackPoint"), "black_point"),
        white_point=_param(case.get("whitePoint"), "white_point"),
        gamma=_param(case.get("gamma"), "gamma"),
        shoulder=_param(case.get("shoulder"), "shoulder"),
        gray=case.get("gray") is True,
    )
