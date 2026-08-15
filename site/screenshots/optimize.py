"""Leaves the screenshots ready to be published.

WebP and not PNG: a screenshot of an interface is flat colour with type over it
and the difference is roughly ten to one, which on a page with five of them is
the difference between it opening at once and it not. The size is halved —they
are taken at twice the density— and the page asks for them at the width it
paints them.

    python3 optimize.py <screenshot-directory> <destination>
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

QUALITY = 82


def main(source: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for shot in sorted(source.glob('*.png')):
        image = Image.open(shot)
        image = image.resize((image.width // 2, image.height // 2), Image.LANCZOS)
        target = destination / f'{shot.stem}.webp'
        image.save(target, 'WEBP', quality=QUALITY, method=6)
        print(f'  {target.name}  {target.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
