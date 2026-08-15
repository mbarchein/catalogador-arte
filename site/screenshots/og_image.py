"""The card that link previews show, one per language.

WhatsApp, Slack or a mail client do not open the page: they read its `og:image`
and paint that. Without one the link travels as a bare line of text, which for a
page whose job is to be sent to a gallery is the whole first impression lost.

It is not one of the screenshots. A preview is cropped to 1.91:1 and looked at
the size of a stamp, and a phone screenshot at that size is a grey smudge: what
reads there is the name, one line and a recognisable shape. So the card is
composed here —the page's palette, its serif for the title— with the record's
screenshot inside.

PNG and not WebP, unlike everything else in `img/`: this one is not fetched by
the page but by half a dozen crawlers, and not all of them read WebP. It weighs
what it weighs; nobody waits for it.

    python3 og_image.py <record-screenshot> <destination>
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# The size every crawler documents. It is drawn at twice that and reduced at the
# end, which is what keeps the type from crumbling —the same trick as the
# screenshots, which are taken at twice the density.
WIDTH = 1200
HEIGHT = 630
SCALE = 2

# The page's palette, from `style.css`, in its light variant: a preview is
# painted on somebody else's background and there is no `prefers-color-scheme`
# to ask.
INK = (28, 25, 23)
INK_SOFT = (68, 64, 60)
PAPER = (250, 250, 249)
LINE = (231, 229, 228)
ACCENT = (176, 106, 74)
BAND = (243, 241, 239)

# Georgia for the title and the system's sans for the rest is what the page
# does. Neither is on a Linux machine, so this uses what the harness already
# uses: DejaVu. If it is not there either, it stops — a card with the fallback
# bitmap font is worse than no card, and it would be published without anyone
# looking at it again.
SERIF = 'DejaVuSerif.ttf'
SANS = 'DejaVuSans.ttf'

TEXTS = {
    'es': {
        'file': 'og-es.png',
        'kicker': 'INVENTARIO Y CATÁLOGO RAZONADO',
        'title': 'Catalogador de arte',
        'lines': ['Catalogar con la obra delante,', 'no con la obra en la memoria.'],
    },
    'en': {
        'file': 'og-en.png',
        'kicker': 'INVENTORY AND CATALOGUE RAISONNÉ',
        'title': 'Art cataloguer',
        'lines': ['Catalogue with the work in front', 'of you, not from memory.'],
    },
}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(name, size * SCALE)
    except OSError as missing:  # pragma: no cover - depends on the machine's fonts
        raise SystemExit(f'falta la tipografía {name}: instala las DejaVu') from missing


def tracked(draw: ImageDraw.ImageDraw, xy, text, *, letter_font, fill, tracking) -> None:
    """Writes with letter-spacing, which Pillow does not do on its own.

    Only the kicker needs it, and it needs it: 0.12em of tracking on a line of
    small capitals is the difference between a heading and a shout.
    """
    x, y = xy
    for letter in text:
        draw.text((x, y), letter, font=letter_font, fill=fill)
        x += draw.textlength(letter, font=letter_font) + tracking * SCALE


def phone(screenshot: Path, height: int) -> Image.Image:
    """The screenshot with rounded corners, the size the card holds it at."""
    image = Image.open(screenshot).convert('RGB')
    width = round(image.width * (height * SCALE) / image.height)
    image = image.resize((width, height * SCALE), Image.LANCZOS)

    radius = 18 * SCALE
    mask = Image.new('L', image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([(0, 0), (image.width - 1, image.height - 1)], radius, 255)
    image.putalpha(mask)
    return image


def card(language: str, screenshot: Path) -> Image.Image:
    text = TEXTS[language]
    canvas = Image.new('RGB', (WIDTH * SCALE, HEIGHT * SCALE), PAPER)
    draw = ImageDraw.Draw(canvas)

    # The band the screenshot sits on, and the hairline that separates it. The
    # page has no such band: here it is what keeps the phone from floating on
    # the white when the preview is cropped.
    draw.rectangle([(760 * SCALE, 0), (WIDTH * SCALE, HEIGHT * SCALE)], fill=BAND)
    draw.line([(760 * SCALE, 0), (760 * SCALE, HEIGHT * SCALE)], fill=LINE, width=SCALE)

    # The accent rule at the top, the one thing that identifies the page at
    # stamp size before a single word is read.
    draw.rectangle([(0, 0), (WIDTH * SCALE, 8 * SCALE)], fill=ACCENT)

    tracked(
        draw,
        (80 * SCALE, 196 * SCALE),
        text['kicker'],
        letter_font=font(SANS, 17),
        fill=ACCENT,
        tracking=2.0,
    )

    draw.text((80 * SCALE, 240 * SCALE), text['title'], font=font(SERIF, 62), fill=INK)

    lead = font(SANS, 27)
    for index, line in enumerate(text['lines']):
        draw.text((80 * SCALE, (350 + index * 44) * SCALE), line, font=lead, fill=INK_SOFT)

    # The shadow the page gives the hero's screenshot, blurred here instead of
    # by the browser.
    shot = phone(screenshot, height=430)
    position = ((980 - shot.width // SCALE // 2) * SCALE, 100 * SCALE)
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [
            (position[0] + 6 * SCALE, position[1] + 22 * SCALE),
            (position[0] + shot.width - 6 * SCALE, position[1] + shot.height + 18 * SCALE),
        ],
        18 * SCALE,
        fill=(28, 25, 23, 90),
    )
    canvas.paste(
        Image.alpha_composite(canvas.convert('RGBA'), shadow.filter(ImageFilter.GaussianBlur(16 * SCALE))).convert('RGB'),
        (0, 0),
    )
    canvas.paste(shot, position, shot)

    return canvas.resize((WIDTH, HEIGHT), Image.LANCZOS)


def main(screenshot: Path, destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    for language, text in TEXTS.items():
        target = destination / text['file']
        card(language, screenshot).save(target, 'PNG', optimize=True)
        print(f'  {target.name}  {target.stat().st_size // 1024} kB')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
