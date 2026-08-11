#!/usr/bin/env python3
"""Tests of the tool that fills in the size of the unmeasured originals (RF-411).

Two things are worth verifying here and they are the two the tool leans on:

  · that **the header alone is enough**, which is what turns a gigabyte of B2 traffic
    into a few megabytes. It is checked by handing it a truncated file and nothing else;
  · that the EXIF orientation swaps the sides, because `original_width` names the size a
    viewer shows and not the one the sensor wrote. Getting this the wrong way round
    produces a plausible number that is wrong on exactly the photographs taken
    vertically, which is half of them.

The rest is the shape of a pass that must never stop: a row that cannot be measured is a
datum and not a reason to abandon the other forty-three.

Runs with no network and no database:

    python3 scripts/copias-corregidas/test_measure_originals.py
"""

from __future__ import annotations

import pathlib
import sys
import unittest
from io import BytesIO

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import measure_originals as tool  # noqa: E402  — after sys.path, on purpose

try:
    from PIL import Image

    PIL_AVAILABLE = True
except ImportError:  # pragma: no cover — the same guard as the sibling test
    PIL_AVAILABLE = False


def jpeg_of(width: int, height: int, orientation: int | None = None) -> bytes:
    """A real JPEG of that size, with its orientation tag when it is asked for."""
    buffer = BytesIO()
    image = Image.new("RGB", (width, height), (120, 90, 60))
    if orientation is None:
        image.save(buffer, format="JPEG", quality=80)
    else:
        exif = image.getexif()
        exif[0x0112] = orientation
        image.save(buffer, format="JPEG", quality=80, exif=exif)
    return buffer.getvalue()


@unittest.skipUnless(PIL_AVAILABLE, "necesita Pillow, que es lo que lee la cabecera")
class TheHeaderIsEnough(unittest.TestCase):
    def test_the_size_comes_out_of_the_first_bytes_and_not_the_whole_file(self) -> None:
        # The point of the tool: a truncated file still answers. If this stopped being
        # true, the pass would go back to downloading up to 19 MB per photograph.
        whole = jpeg_of(4032, 3024)
        head = whole[:2048]
        self.assertLess(len(head), len(whole))
        self.assertEqual(tool.upright_size(head), (4032, 3024))

    def test_the_slice_the_tool_asks_for_is_more_than_enough(self) -> None:
        whole = jpeg_of(4032, 3024)
        self.assertEqual(tool.upright_size(whole[: tool.HEADER_BYTES]), (4032, 3024))

    def test_a_header_that_says_nothing_is_reported_and_not_guessed(self) -> None:
        # Two bytes of nothing: it has to raise so the row is counted as unmeasured
        # instead of getting an invented size.
        with self.assertRaises(Exception):
            tool.upright_size(b"\xff\xd8")


@unittest.skipUnless(PIL_AVAILABLE, "necesita Pillow, que es lo que lee la cabecera")
class TheOrientationSwapsTheSides(unittest.TestCase):
    def test_the_four_transposing_orientations_swap_them(self) -> None:
        # A photograph taken vertically: the sensor wrote 4032×3024 and every viewer
        # shows 3024×4032. `original_width` names the second one.
        for orientation in sorted(tool.TRANSPOSING_ORIENTATIONS):
            with self.subTest(orientation=orientation):
                self.assertEqual(
                    tool.upright_size(jpeg_of(4032, 3024, orientation)), (3024, 4032)
                )

    def test_the_others_leave_the_sides_as_they_are(self) -> None:
        for orientation in (None, 1, 2, 3, 4):
            with self.subTest(orientation=orientation):
                self.assertEqual(
                    tool.upright_size(jpeg_of(4032, 3024, orientation)), (4032, 3024)
                )


class ThePassNeverStops(unittest.TestCase):
    """A row that cannot be measured must not take the other forty-three with it."""

    class FakeApi:
        def __init__(self, header: bytes | Exception) -> None:
            self.header = header
            self.written: list[tuple[str, int, int]] = []
            self.signed: list[str] = []

        def signed_download(self, path: str) -> str:
            self.signed.append(path)
            if isinstance(self.header, Exception):
                raise self.header
            return f"https://ejemplo.invalid/{path}"

        def _request(self, url: str, *, headers: dict[str, str] | None = None):
            assert headers and headers.get("Range"), "tiene que pedir solo la cabecera"
            return 206, self.header

    @unittest.skipUnless(PIL_AVAILABLE, "necesita Pillow")
    def test_a_measured_row_is_written_once(self) -> None:
        api = self.FakeApi(jpeg_of(4032, 3024))
        original_write = tool.write_size
        tool.write_size = lambda a, i, s: a.written.append((i, s[0], s[1]))  # type: ignore[assignment]
        try:
            result = tool.measure(
                api,  # type: ignore[arg-type]
                {"image_id": "AR-0001_v1", "master_path": "AR-0001/x_master.jpg"},
                None,
                write=True,
            )
        finally:
            tool.write_size = original_write  # type: ignore[assignment]
        self.assertEqual(result.state, "written")
        self.assertEqual(api.written, [("AR-0001_v1", 4032, 3024)])
        # And it asked with a Range: the assertion is inside the fake, so a tool that
        # went back to downloading the whole file would fail here.
        self.assertEqual(api.signed, ["AR-0001/x_master.jpg"])

    @unittest.skipUnless(PIL_AVAILABLE, "necesita Pillow")
    def test_dry_run_measures_and_writes_nothing(self) -> None:
        api = self.FakeApi(jpeg_of(4032, 3024))
        result = tool.measure(
            api,  # type: ignore[arg-type]
            {"image_id": "AR-0001_v1", "master_path": "AR-0001/x_master.jpg"},
            None,
            write=False,
        )
        self.assertEqual(result.state, "skipped")
        self.assertIn("4032×3024", result.detail)
        self.assertEqual(api.written, [])

    def test_a_row_that_cannot_be_read_is_reported_and_the_pass_goes_on(self) -> None:
        api = self.FakeApi(RuntimeError("el almacén no contesta"))
        result = tool.measure(
            api,  # type: ignore[arg-type]
            {"image_id": "AR-0001_v1", "master_path": "AR-0001/x_master.jpg"},
            None,
            write=True,
        )
        # Reported by name and never raised: the other rows still have to be measured.
        self.assertEqual(result.state, "failed")
        self.assertIn("no se ha podido medir", result.detail)

    def test_a_row_with_no_master_has_no_original_to_measure(self) -> None:
        api = self.FakeApi(b"")
        result = tool.measure(
            api,  # type: ignore[arg-type]
            {"image_id": "AR-0001_v1", "master_path": None},
            None,
            write=True,
        )
        self.assertEqual(result.state, "skipped")
        self.assertIn("sin máster", result.detail)

    @unittest.skipUnless(PIL_AVAILABLE, "necesita Pillow")
    def test_the_local_mirror_is_used_before_asking_anybody(self) -> None:
        # After `make db-clone FOTOS=todo` the master is on disk: asking B2 for it again
        # would be paying for what is already there.
        import tempfile

        api = self.FakeApi(RuntimeError("no debería haberse pedido nada"))
        with tempfile.TemporaryDirectory() as directory:
            dump = pathlib.Path(directory)
            local = dump / "masters" / "AR-0001" / "x_master.jpg"
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(jpeg_of(2000, 1500))
            result = tool.measure(
                api,  # type: ignore[arg-type]
                {"image_id": "AR-0001_v1", "master_path": "AR-0001/x_master.jpg"},
                dump,
                write=False,
            )
        self.assertEqual(result.state, "skipped")
        self.assertIn("2000×1500", result.detail)
        self.assertEqual(api.signed, [])


class TheQueryAsksForWhatIsMissing(unittest.TestCase):
    def test_it_only_asks_for_rows_with_a_master_and_no_measurement(self) -> None:
        # The filter is what makes the tool idempotent: a second run finds nothing.
        seen: list[str] = []

        class FakeApi:
            config = type("C", (), {"base_url": "https://x.invalid"})()

            def _json(self, url: str):
                seen.append(url)
                return []

        tool.images_without_size(FakeApi(), None, None)  # type: ignore[arg-type]
        self.assertIn("original_width=is.null", seen[0])
        self.assertIn("master_path=not.is.null", seen[0])
        # Active only: the caption is read on a photograph the record shows.
        self.assertIn("active=is.true", seen[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
