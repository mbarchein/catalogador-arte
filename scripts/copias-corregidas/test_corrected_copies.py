#!/usr/bin/env python3
"""Tests de la herramienta local de copias corregidas (RF-414, RF-420, RF-421).

El corazón de este fichero es el primer bloque: comprueba que **las tablas de 256
entradas que reconstruye Python son idénticas, entrada por entrada, a las que
produce el navegador**, leyendo el fichero de casos que generan los tests del
frontend:

    app/src/lib/__fixtures__/color-luts.json

Sin esa comprobación, la forma en que la divergencia se descubre es la peor de
todas: la miniatura y la copia a resolución completa de la misma obra salen de
distinto color, y eso se nota mirando dos imágenes, que es como no notarlo.

Se ejecuta sin red, sin base de datos, sin numpy y sin PIL:

    python3 scripts/copias-corregidas/test_corrected_copies.py

y `make casos-color` lo ejecuta justo después de regenerar el fichero de casos,
que es el orden que importa. Los tests que sí necesitan numpy y PIL —los que
aplican la tabla y la geometría a un montón de píxeles— se saltan solos si no
están, para que la comprobación que ata las dos implementaciones no dependa de
ninguna dependencia.

Si falla porque el fichero de casos ha cambiado a propósito, el orden es: cambiar
`app/src/lib/imageColor.ts`, regenerar el fichero con `make casos-color`, y
traer aquí el mismo cambio hasta que este test vuelva a pasar. Al revés no: la
definición del color vive en TypeScript.
"""

from __future__ import annotations

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from color_chain import (  # noqa: E402  — after sys.path, on purpose
    ColorLook,
    build_color_luts,
    gray_from_rgb,
    look_from_case,
    look_from_row,
    round_half_up,
    srgb_to_linear,
    srgb_to_linear_table,
)
from paths import (  # noqa: E402
    CORRECTED_SUFFIX,
    MasterAtRisk,
    check_not_master,
    corrected_path,
)

REPO = pathlib.Path(__file__).resolve().parents[2]
FIXTURE = REPO / "app" / "src" / "lib" / "__fixtures__" / "color-luts.json"

# The shape this test knows how to read. Bumped in the generator when the shape
# changes, so a stale expectation says so instead of quietly reading nulls.
FIXTURE_VERSION = 1


def load_fixture() -> dict:
    if not FIXTURE.exists():
        raise unittest.SkipTest(
            f"No está el fichero de casos ({FIXTURE}). Se genera con «make casos-color»."
        )
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class ColorTablesMatchTheBrowser(unittest.TestCase):
    """RF-421: las tablas de Python son las del navegador, entrada por entrada."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = load_fixture()

    def test_fixture_has_the_shape_this_test_reads(self) -> None:
        self.assertEqual(
            self.fixture.get("version"),
            FIXTURE_VERSION,
            "El fichero de casos tiene otra versión de formato que la que este test lee.",
        )
        self.assertGreaterEqual(len(self.fixture["cases"]), 20)
        self.assertGreaterEqual(len(self.fixture["grayCases"]), 8)

    def test_every_case_produces_the_same_three_tables(self) -> None:
        for case in self.fixture["cases"]:
            name = case["name"]
            with self.subTest(caso=name):
                luts = build_color_luts(look_from_case(case["color"]))
                for channel, ours in (("r", luts.r), ("g", luts.g), ("b", luts.b)):
                    theirs = case["luts"][channel]
                    self.assertEqual(len(ours), 256)
                    self.assertEqual(len(theirs), 256)
                    # Compared entry by entry and not list against list, so the
                    # message says WHICH code differs: with 256 numbers on a line,
                    # «the lists are not equal» is not information anybody can use.
                    for code, (mine, expected) in enumerate(zip(ours, theirs)):
                        self.assertEqual(
                            mine,
                            expected,
                            f"Caso «{name}», canal {channel}, código {code}: "
                            f"Python da {mine} y el navegador {expected}. "
                            "La cadena de color ha divergido.",
                        )

    def test_the_case_file_covers_what_the_specification_asks(self) -> None:
        names = [case["name"] for case in self.fixture["cases"]]
        self.assertIn("neutral", names)
        for parameter in (
            "temperature",
            "tint",
            "exposure",
            "black-point",
            "white-point",
            "gamma",
            "shoulder",
        ):
            self.assertIn(f"{parameter}-min", names)
            self.assertIn(f"{parameter}-max", names)

    def test_the_luminance_step_matches_too(self) -> None:
        # `gray` is not in the tables — it needs the three channels at once — so it
        # would sail through the comparison above while producing a different grey.
        for case in self.fixture["grayCases"]:
            r, g, b = case["rgb"]
            with self.subTest(rgb=(r, g, b)):
                self.assertEqual(
                    gray_from_rgb(r, g, b),
                    case["gray"],
                    f"Luminancia de ({r}, {g}, {b}): Python da {gray_from_rgb(r, g, b)} "
                    f"y el navegador {case['gray']}.",
                )

    def test_the_switch_alone_leaves_the_tables_at_the_identity(self) -> None:
        # Stated as a test because it is the one thing about `gray` that is easy to
        # get wrong when transcribing: folding the luminance into the tables would
        # give a grey per channel and a plausible, wrong picture.
        luts = build_color_luts(ColorLook(gray=True))
        self.assertEqual(luts.r, list(range(256)))
        self.assertEqual(luts.g, list(range(256)))
        self.assertEqual(luts.b, list(range(256)))
        self.assertTrue(luts.gray)


class TheArithmeticTraps(unittest.TestCase):
    """Las trampas concretas de transcribir JavaScript a Python (RF-414)."""

    def test_rounding_is_half_up_and_not_half_to_even(self) -> None:
        # `Math.round(0.5)` is 1 and `round(0.5)` is 0. On 8-bit codes this is not
        # a curiosity: it lands on entries of the table.
        self.assertEqual(round_half_up(0.5), 1)
        self.assertEqual(round_half_up(1.5), 2)
        self.assertEqual(round_half_up(2.5), 3)
        self.assertEqual(round_half_up(0.4999999), 0)

    def test_the_eotf_keeps_its_linear_segment(self) -> None:
        # `x ** 2.2` would be off by 40 % of the linear value at code 4, which is
        # exactly where the black point works.
        self.assertAlmostEqual(srgb_to_linear(0.0), 0.0)
        self.assertAlmostEqual(srgb_to_linear(1.0), 1.0)
        self.assertAlmostEqual(srgb_to_linear(0.04), 0.04 / 12.92)
        self.assertNotAlmostEqual(srgb_to_linear(4 / 255), (4 / 255) ** 2.2, places=4)

    def test_the_lookup_table_of_the_eotf_is_the_same_function(self) -> None:
        # The fast path that `gray` uses over an array and the scalar function have
        # to be one definition, or black and white would drift from everything else.
        table = srgb_to_linear_table()
        self.assertEqual(len(table), 256)
        for code in range(256):
            self.assertEqual(table[code], srgb_to_linear(code / 255))

    def test_a_negative_after_the_black_point_does_not_blank_a_channel(self) -> None:
        # Below the black point the value IS negative, and a negative to a
        # fractional power is a complex number in Python. Without the clamp the
        # table would raise or come out complex; with it, the shadows go to zero.
        luts = build_color_luts(ColorLook(black_point=64, gamma=0.6))
        self.assertEqual(luts.r[0], 0)
        self.assertEqual(luts.r[64], 0)
        self.assertEqual(luts.r[255], 255)

    def test_a_corrupt_value_reads_as_the_identity_and_not_as_the_nearest_end(self) -> None:
        # The same reading the browser does (`param` in imageColor.ts). If here
        # it were read as the nearest cap, the only row in which the two
        # implementations disagree would be the one nobody can explain: the neutral
        # thumbnail and the corrected print copy, from the same numbers.
        row = {
            "color_temperature": 900,
            "color_tint": None,
            "color_exposure": "0.17",
            "color_black": -3,
            "color_white": 300,
            "color_gamma": 4,
            "color_shoulder": "no es un número",
            "color_gray": False,
        }
        look = look_from_row(row)
        self.assertEqual(look.temperature, 0)
        self.assertEqual(look.tint, 0)
        # A string with a valid number IS read: `numeric` can arrive like that.
        self.assertAlmostEqual(look.exposure, 0.17)
        self.assertEqual(look.black_point, 0)
        self.assertEqual(look.white_point, 255)
        self.assertEqual(look.gamma, 1)
        self.assertEqual(look.shoulder, 0)

    def test_a_row_with_every_colour_column_null_is_neutral(self) -> None:
        # Null is the identity and not the unknown: it is what allows reading without
        # migrating the rows written before this existed.
        self.assertTrue(look_from_row({}).is_identity())

    def test_the_tables_never_decrease(self) -> None:
        # Every step of the chain is monotone increasing, so the tables are too.
        # A table that decreases is corrupt and not merely different.
        for look in (
            ColorLook(),
            ColorLook(temperature=-60, tint=40, exposure=-2, gamma=1.6),
            ColorLook(black_point=64, white_point=192, shoulder=100, exposure=2),
        ):
            luts = build_color_luts(look)
            for channel, lut in (("r", luts.r), ("g", luts.g), ("b", luts.b)):
                for code in range(1, 256):
                    self.assertGreaterEqual(lut[code], lut[code - 1], f"{channel}[{code}]")


class TheMasterIsNeverTouched(unittest.TestCase):
    """ADR-002 y §0.1: la copia corregida jamás escribe en la ruta de un máster."""

    def test_a_fresh_path_is_not_the_master_and_says_what_it_is(self) -> None:
        path = corrected_path("AR-0001", "AR-0001/AR-0001_ab12cd34_master.jpg")
        self.assertTrue(path.startswith("AR-0001/AR-0001_"))
        self.assertTrue(path.endswith(f"{CORRECTED_SUFFIX}.jpg"))
        self.assertNotIn("_master", path)

    def test_two_calls_do_not_return_the_same_path(self) -> None:
        # Re-editing writes a NEW path: the paths of the store are immutable
        # because the service worker caches by path with `CacheFirst`.
        first = corrected_path("AR-0001", None)
        second = corrected_path("AR-0001", None)
        self.assertNotEqual(first, second)

    def test_a_path_equal_to_the_master_is_refused(self) -> None:
        master = f"AR-0001/AR-0001_ab12cd34{CORRECTED_SUFFIX}.jpg"
        with self.assertRaises(MasterAtRisk):
            corrected_path("AR-0001", master, suffix="ab12cd34")

    def test_a_path_that_merely_looks_like_a_master_is_refused(self) -> None:
        # Protects against a master this row does not know about: signing a PUT for
        # a `…_master.jpg` is the one operation that cannot be undone.
        with self.assertRaises(MasterAtRisk):
            check_not_master("AR-0001/AR-0001_ab12cd34_master.jpg", None)

    def test_a_path_that_is_not_a_corrected_copy_is_refused(self) -> None:
        with self.assertRaises(MasterAtRisk):
            check_not_master("AR-0001/AR-0001_ab12cd34_der.webp", None)


try:  # noqa: SIM105 — the whole point is to survive the absence
    import numpy as np
    from PIL import Image

    import generate_copies as tool

    PIXELS_AVAILABLE = True
except ImportError:  # pragma: no cover — measured by whether the block below runs
    PIXELS_AVAILABLE = False


@unittest.skipUnless(PIXELS_AVAILABLE, "necesita numpy y PIL, que solo hacen falta para los píxeles")
class ThePixelPath(unittest.TestCase):
    """Lo que aplica la tabla y la geometría a un montón de píxeles (RF-420).

    Separado y saltable a propósito: el test de las tablas es el que no puede
    depender de nada, porque es el que ata las dos implementaciones. Este comprueba
    que el camino rápido —numpy sobre franjas— da exactamente lo mismo que la
    aritmética escalar que ya está comparada con el navegador.
    """

    def test_applying_the_tables_over_an_image_is_the_scalar_table(self) -> None:
        look = ColorLook(
            temperature=-34, tint=-5, exposure=0.5, black_point=9, white_point=246, gamma=1.35, shoulder=25
        )
        codes = np.array([[[0, 0, 0], [4, 2, 1], [128, 128, 128], [200, 180, 160], [255, 255, 255]]], np.uint8)
        got = np.asarray(tool.apply_color(Image.fromarray(codes), look))
        luts = build_color_luts(look)
        for column, (r, g, b) in enumerate(codes[0]):
            self.assertEqual(
                tuple(int(value) for value in got[0][column]),
                (luts.r[r], luts.g[g], luts.b[b]),
            )

    def test_the_fast_gray_path_is_the_scalar_one_and_therefore_the_browsers(self) -> None:
        # Closes the loop: the browser's answers are in the case file, the scalar
        # function is compared against them above, and this compares the array path
        # against the scalar one over the very same samples.
        samples = [tuple(case["rgb"]) for case in load_fixture()["grayCases"]]
        codes = np.array([samples], np.uint8)
        got = np.asarray(tool.apply_gray(Image.fromarray(codes)))
        for column, (r, g, b) in enumerate(samples):
            expected = gray_from_rgb(r, g, b)
            self.assertEqual(
                tuple(int(value) for value in got[0][column]),
                (expected, expected, expected),
                f"({r}, {g}, {b}) por franjas da otra cosa que gray_from_rgb",
            )

    def test_the_homography_maps_the_unit_square_onto_the_four_corners(self) -> None:
        corners = {"nw": (0.10, 0.12), "ne": (0.92, 0.05), "se": (0.88, 0.95), "sw": (0.06, 0.90)}
        h = tool.homography_from_unit_square(corners)
        assert h is not None
        for (u, v), key in (((0, 0), "nw"), ((1, 0), "ne"), ((1, 1), "se"), ((0, 1), "sw")):
            z = h[6] * u + h[7] * v + h[8]
            x = (h[0] * u + h[1] * v + h[2]) / z
            y = (h[3] * u + h[4] * v + h[5]) / z
            self.assertAlmostEqual(x, corners[key][0], places=12)
            self.assertAlmostEqual(y, corners[key][1], places=12)

    def test_a_degenerate_quadrilateral_has_no_transform(self) -> None:
        flat = {"nw": (0.2, 0.5), "ne": (0.8, 0.5), "se": (0.8, 0.5), "sw": (0.2, 0.5)}
        self.assertIsNone(tool.homography_from_unit_square(flat))

    def test_straightening_a_rectangle_gives_the_crop_pixel_for_pixel(self) -> None:
        # The identity case of the warp, and the strongest check available without a
        # browser: with the corners on an axis-aligned rectangle, straightening must
        # not resample anything and must land exactly on the equivalent crop.
        width, height = 800, 600
        pixels = np.zeros((height, width, 3), np.uint8)
        pixels[:, :, 0] = np.linspace(0, 255, width).astype(np.uint8)[None, :]
        pixels[:, :, 1] = np.linspace(0, 255, height).astype(np.uint8)[:, None]
        image = Image.fromarray(pixels)
        corners = {"nw": (0.2, 0.2), "ne": (0.8, 0.2), "se": (0.8, 0.8), "sw": (0.2, 0.8)}
        straightened = tool.straighten(image, corners)
        self.assertEqual(straightened.size, (480, 360))
        crop = image.crop((160, 120, 640, 480))
        self.assertTrue(np.array_equal(np.asarray(straightened), np.asarray(crop)))

    def test_what_falls_outside_the_photograph_is_white_and_not_black(self) -> None:
        # In five photographs of the catalog the sides of the artwork are out of
        # frame, and dragging a handle past the edge is the only way to straighten
        # them. What is not in the shot has to read as blank paper.
        image = Image.new("RGB", (400, 300), (10, 20, 30))
        corners = {"nw": (-0.2, -0.2), "ne": (1.2, -0.2), "se": (1.2, 1.2), "sw": (-0.2, 1.2)}
        straightened = tool.straighten(image, corners)
        self.assertEqual(tuple(np.asarray(straightened)[0, 0]), (255, 255, 255))

    def test_a_crossed_quadrilateral_in_a_row_is_not_straightened(self) -> None:
        # A row that somehow held one would produce an image folded over itself, and
        # showing the photograph unstraightened is always better than that.
        row = {
            "rotation": 0,
            "corner_nw_x": 0.95,
            "corner_nw_y": 0.16,
            "corner_ne_x": 0.1,
            "corner_ne_y": 0.1,
            "corner_se_x": 0.9,
            "corner_se_y": 0.9,
            "corner_sw_x": 0.1,
            "corner_sw_y": 0.9,
        }
        self.assertIsNone(tool.geometry_from_row(row).corners)

    def test_the_rotation_of_a_row_swaps_the_sides(self) -> None:
        image = Image.new("RGB", (400, 300), (1, 2, 3))
        geometry = tool.geometry_from_row({"rotation": 90})
        self.assertEqual(tool.apply_geometry(image, geometry).size, (300, 400))

    def test_a_row_with_no_corrections_does_not_become_a_duplicate_of_the_master(self) -> None:
        # RF-420: if there is no correction, there is no copy. Null, and not a duplicate
        # of the master, which is what RF-411 already delivers. It does not get to look at the image, so
        # it needs neither the API nor the file.
        row = {
            "image_id": "AR-0001_v1",
            "catalog_id": "AR-0001",
            "master_path": "AR-0001/AR-0001_ab12cd34_master.jpg",
            "rotation": 0,
        }
        outcome = tool.process(None, row, None, upload=True, out_dir=None)  # type: ignore[arg-type]
        self.assertEqual(outcome.state, "pending")
        self.assertIn("no hace falta", outcome.detail)

    def test_the_whole_flow_writes_the_row_and_never_the_master(self) -> None:
        # The whole route with no network: the master in the local mirror, geometry, colour,
        # a signed upload and the writing of the row. What is checked is what is not
        # visible on reading the code: which path is signed and what is written in the row.
        import tempfile

        class FakeApi:
            def __init__(self) -> None:
                self.signed: list[str] = []
                self.uploaded: list[tuple[str, int]] = []
                self.written: list[tuple[str, str, int]] = []

            def signed_upload(self, path: str) -> str:
                self.signed.append(path)
                return f"https://ejemplo.invalid/{path}"

            def put_object(self, url: str, content: bytes) -> None:
                self.uploaded.append((url, len(content)))

            def mark_generated(self, image_id: str, path: str, size: int) -> None:
                self.written.append((image_id, path, size))

        master_path = "AR-0001/AR-0001_ab12cd34_master.jpg"
        with tempfile.TemporaryDirectory() as directory:
            dump = pathlib.Path(directory)
            local = dump / "masters" / master_path
            local.parent.mkdir(parents=True, exist_ok=True)
            pixels = np.zeros((40, 60, 3), np.uint8)
            pixels[:, :, 0] = np.linspace(0, 255, 60).astype(np.uint8)[None, :]
            Image.fromarray(pixels).save(local, format="JPEG", quality=95)
            before = local.read_bytes()

            api = FakeApi()
            row = {
                "image_id": "AR-0001_v1",
                "catalog_id": "AR-0001",
                "master_path": master_path,
                "rotation": 90,
                "color_exposure": 0.5,
                "color_gray": True,
            }
            outcome = tool.process(api, row, dump, upload=True, out_dir=None)  # type: ignore[arg-type]

            self.assertEqual(outcome.state, "done")
            self.assertEqual(len(api.signed), 1)
            self.assertNotIn("_master", api.signed[0])
            self.assertNotEqual(api.signed[0], master_path)
            self.assertEqual(len(api.uploaded), 1)
            self.assertEqual(len(api.written), 1)
            self.assertEqual(api.written[0][0], "AR-0001_v1")
            self.assertEqual(api.written[0][1], api.signed[0])
            self.assertEqual(api.written[0][2], api.uploaded[0][1])
            # §0.1: the master has been read and has been left exactly the same.
            self.assertEqual(local.read_bytes(), before)

    def test_a_blank_copy_is_refused_before_being_uploaded(self) -> None:
        # The failure mode is the browser's —a canvas past the device's maximum area
        # comes out white with no error at all— and what must never happen is that
        # a print shop receives a blank sheet of an artwork.
        self.assertTrue(tool.looks_blank(Image.new("RGB", (8, 8), (255, 255, 255))))
        self.assertFalse(tool.looks_blank(Image.new("RGB", (8, 8), (255, 255, 254))))


if __name__ == "__main__":
    unittest.main(verbosity=2)
