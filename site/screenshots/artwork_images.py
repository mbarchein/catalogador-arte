"""Invented artwork for the demonstration screenshots.

The catalogue's real photographs are of a private family fund and carry third
parties' personal data, so they cannot appear on a public page. What is
photographed in the screenshots is generated here: abstract compositions with a
fixed seed, plus a verso with its labels and a signature detail, which are the
three shot types the record shows.

Deterministic on purpose. Regenerating has to produce the same images or every
screenshot changes on each run and the page's diff stops being readable.

    python3 artwork_images.py <output-directory>
"""

from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

# Two working sizes, the same ones the application handles: the thumbnail of
# the listing and the consultation copy of the record. There is no master here
# — nothing on the page shows one.
THUMBNAIL = 400
DERIVATIVE = 1400

# A limited palette so ten works look like one hand's. Warm earths and a couple
# of colds, which is what an abstract painter of the period would have had.
PALETTE = [
    (188, 122, 74),
    (142, 88, 62),
    (206, 168, 108),
    (94, 96, 84),
    (58, 62, 66),
    (176, 180, 168),
    (128, 142, 148),
    (210, 200, 178),
    (96, 66, 58),
    (166, 108, 88),
]

GROUND = (222, 214, 196)


def canvas_texture(size: tuple[int, int], seed: int) -> Image.Image:
    """The weave. Without it a generated image reads as a screen, not a painting."""
    rng = random.Random(seed)
    noise = Image.new('L', (size[0] // 2, size[1] // 2))
    noise.putdata([rng.randint(112, 144) for _ in range(noise.width * noise.height)])
    noise = noise.resize(size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.4))
    return noise


def composition(index: int, size: int) -> Image.Image:
    """One work. The index is the seed: same number, same painting."""
    rng = random.Random(1000 + index)
    ratio = rng.choice([(1, 1), (4, 5), (5, 4), (3, 4), (4, 3)])
    width = size
    height = int(size * ratio[1] / ratio[0])

    image = Image.new('RGB', (width, height), GROUND)
    draw = ImageDraw.Draw(image, 'RGBA')

    colours = rng.sample(PALETTE, 4)

    # Ground: two or three wide bands, soft-edged.
    bands = rng.randint(2, 3)
    for band in range(bands):
        top = int(height * band / bands) - rng.randint(0, height // 12)
        bottom = int(height * (band + 1) / bands) + rng.randint(0, height // 12)
        draw.rectangle([-10, top, width + 10, bottom], fill=colours[band % len(colours)] + (205,))
    image = image.filter(ImageFilter.GaussianBlur(size / 90))
    draw = ImageDraw.Draw(image, 'RGBA')

    # Figures over the ground: rectangles, arcs and a few strokes.
    for _ in range(rng.randint(3, 6)):
        colour = rng.choice(colours) + (rng.randint(170, 245),)
        kind = rng.random()
        x0 = rng.uniform(-0.1, 0.8) * width
        y0 = rng.uniform(-0.1, 0.8) * height
        w = rng.uniform(0.12, 0.5) * width
        h = rng.uniform(0.12, 0.5) * height
        if kind < 0.45:
            draw.rectangle([x0, y0, x0 + w, y0 + h], fill=colour)
        elif kind < 0.75:
            draw.ellipse([x0, y0, x0 + w, y0 + h], fill=colour)
        else:
            draw.line(
                [x0, y0, x0 + w, y0 + h],
                fill=colour,
                width=max(2, int(size * rng.uniform(0.004, 0.02))),
            )

    # A couple of thin lines that cross the whole thing and tie it together.
    for _ in range(rng.randint(1, 2)):
        y = rng.uniform(0.15, 0.85) * height
        draw.line(
            [0, y, width, y + rng.uniform(-0.1, 0.1) * height],
            fill=colours[-1] + (200,),
            width=max(1, int(size * 0.003)),
        )

    image = image.filter(ImageFilter.GaussianBlur(size / 500))

    # Weave and vignette: what makes it read as a photographed object.
    texture = canvas_texture(image.size, 2000 + index)
    image = Image.blend(image, Image.merge('RGB', (texture, texture, texture)), 0.10)

    vignette = Image.new('L', image.size, 0)
    ImageDraw.Draw(vignette).ellipse(
        [-width * 0.25, -height * 0.25, width * 1.25, height * 1.25], fill=255
    )
    vignette = vignette.filter(ImageFilter.GaussianBlur(size / 12))
    dark = Image.new('RGB', image.size, (40, 36, 32))
    image = Image.composite(image, dark, vignette)

    # A last touch of contrast and colour: without it the layered transparencies
    # come out washed out, and a washed-out thumbnail looks like a rendering error.
    image = ImageEnhance.Contrast(image).enhance(1.12)
    return ImageEnhance.Color(image).enhance(1.15)


def verso(size: int, seed: int = 77) -> Image.Image:
    """The back of a canvas: stretcher, labels and a number in pencil.

    It is the shot type the guidelines insist on and half the provenance lives
    on it, so the demonstration shows one.
    """
    rng = random.Random(seed)
    width = size
    height = int(size * 5 / 4)
    image = Image.new('RGB', (width, height), (206, 196, 172))
    draw = ImageDraw.Draw(image, 'RGBA')

    texture = canvas_texture(image.size, seed)
    image = Image.blend(image, Image.merge('RGB', (texture, texture, texture)), 0.35)
    draw = ImageDraw.Draw(image, 'RGBA')

    # The stretcher, seen through the canvas.
    bar = int(width * 0.075)
    for box in (
        [0, 0, width, bar],
        [0, height - bar, width, height],
        [0, 0, bar, height],
        [width - bar, 0, width, height],
        [width // 2 - bar // 2, 0, width // 2 + bar // 2, height],
    ):
        draw.rectangle(box, fill=(150, 132, 104, 120))
        draw.rectangle(box, outline=(120, 104, 80, 90), width=max(1, size // 400))

    font_size = max(9, size // 46)
    try:
        font = ImageFont.truetype('DejaVuSans.ttf', font_size)
        small = ImageFont.truetype('DejaVuSans.ttf', max(7, font_size - 3))
    except OSError:  # pragma: no cover - depends on the machine's fonts
        font = ImageFont.load_default()
        small = font

    # Two labels: one from a gallery and one from an exhibition.
    label = [int(width * 0.14), int(height * 0.20), int(width * 0.56), int(height * 0.36)]
    draw.rectangle(label, fill=(238, 232, 214), outline=(150, 140, 118))
    draw.text((label[0] + 12, label[1] + 10), 'GALERÍA SANTA CLARA', font=font, fill=(60, 56, 50))
    draw.text((label[0] + 12, label[1] + 12 + font_size), 'Valencia', font=small, fill=(90, 84, 76))
    draw.text((label[0] + 12, label[1] + 14 + font_size * 2), 'n.º 214', font=small, fill=(90, 84, 76))

    label2 = [int(width * 0.46), int(height * 0.58), int(width * 0.90), int(height * 0.70)]
    draw.rectangle(label2, fill=(226, 222, 230), outline=(150, 146, 158))
    draw.text((label2[0] + 12, label2[1] + 10), 'ANTOLÓGICA 1987', font=small, fill=(60, 56, 60))
    draw.text((label2[0] + 12, label2[1] + 12 + font_size), 'cat. 41', font=small, fill=(90, 84, 90))

    # A number in pencil, which is what nobody transcribes and everybody needs.
    draw.text(
        (int(width * 0.20), int(height * 0.80)),
        '112 / F',
        font=ImageFont.truetype('DejaVuSans.ttf', font_size * 2)
        if font is not small
        else font,
        fill=(96, 92, 88, 190),
    )
    for _ in range(240):
        x = rng.uniform(0, width)
        y = rng.uniform(0, height)
        draw.point((x, y), fill=(120, 108, 92, rng.randint(20, 70)))

    return image


def signature_detail(size: int, seed: int = 91) -> Image.Image:
    """A corner with the signature, which is the other shot type of the record."""
    rng = random.Random(seed)
    width = size
    height = int(size * 0.62)
    base = composition(3, size).resize((width, int(width * 1.25)), Image.LANCZOS)
    image = base.crop((0, base.height - height, width, base.height))
    draw = ImageDraw.Draw(image, 'RGBA')

    # The stroke, drawn as a stroke and not written as a text: a font reads as
    # a caption and this has to read as paint.
    x = width * 0.12
    y = height * 0.62
    thickness = max(2, int(size * 0.006))
    points = []
    for step in range(120):
        t = step / 119
        points.append(
            (
                x + t * width * 0.34,
                y
                + math.sin(t * math.pi * 3.1) * height * 0.075
                + math.sin(t * math.pi * 11) * height * 0.012,
            )
        )
    draw.line(points, fill=(38, 34, 30, 225), width=thickness, joint='curve')
    draw.line(
        [(x + width * 0.05, y + height * 0.13), (x + width * 0.30, y + height * 0.10)],
        fill=(38, 34, 30, 200),
        width=max(1, thickness - 1),
    )
    for _ in range(30):
        px = rng.uniform(x, x + width * 0.36)
        py = rng.uniform(y - height * 0.1, y + height * 0.16)
        draw.point((px, py), fill=(38, 34, 30, rng.randint(40, 120)))

    return image


def poster(index: int, size: int, lines: list[str]) -> Image.Image:
    """An exhibition poster: a composition with the show's data printed over it.

    The exhibitions listing paints the poster next to each show, and an empty
    frame there says nothing about what the screen does.
    """
    width = int(size * 0.72)
    height = size
    art = composition(index, width * 2).resize((width, height), Image.LANCZOS)
    draw = ImageDraw.Draw(art, 'RGBA')

    # A band at the foot so the type reads over any painting.
    draw.rectangle([0, int(height * 0.62), width, height], fill=(28, 26, 24, 205))

    sizes = [int(size * 0.062), int(size * 0.040), int(size * 0.030)]
    y = int(height * 0.68)
    for text, font_size in zip(lines, sizes):
        try:
            font = ImageFont.truetype('DejaVuSans.ttf', font_size)
        except OSError:  # pragma: no cover - depends on the machine's fonts
            font = ImageFont.load_default()
        draw.text((int(width * 0.08), y), text, font=font, fill=(240, 236, 228))
        y += int(font_size * 1.9)

    return art


def write(image: Image.Image, path: Path, longest: int) -> None:
    scale = longest / max(image.size)
    resized = image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.LANCZOS,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(path, quality=86, optimize=True)


def main(destination: Path) -> None:
    for index in range(12):
        art = composition(index, DERIVATIVE)
        write(art, destination / f'work-{index:02d}.jpg', DERIVATIVE)
        write(art, destination / f'work-{index:02d}-thumb.jpg', THUMBNAIL)

    back = verso(DERIVATIVE)
    write(back, destination / 'work-00-back.jpg', DERIVATIVE)
    write(back, destination / 'work-00-back-thumb.jpg', THUMBNAIL)

    detail = signature_detail(DERIVATIVE)
    write(detail, destination / 'work-00-signature.jpg', DERIVATIVE)
    write(detail, destination / 'work-00-signature-thumb.jpg', THUMBNAIL)

    posters = [
        (7, ['ADELA FERRÁN', 'Antológica', 'Museo Provincial · 1987']),
        (5, ['CUATRO PINTORES', 'del sureste', 'Galería Santa Clara · 1971']),
        (10, ['EL TALLER', 'compartido, 1961-1968', 'Sala Municipal · 2019']),
        (2, ['ABSTRACCIÓN', 'de posguerra', 'Museo Provincial · 2004']),
    ]
    for number, (seed, lines) in enumerate(posters, start=1):
        art = poster(seed, DERIVATIVE, lines)
        write(art, destination / f'poster-{number}.jpg', DERIVATIVE)
        write(art, destination / f'poster-{number}-thumb.jpg', THUMBNAIL)

    print(f'{len(list(destination.glob("*.jpg")))} imágenes en {destination}')


if __name__ == '__main__':
    main(Path(sys.argv[1] if len(sys.argv) > 1 else 'demo-images'))
