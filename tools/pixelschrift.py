# Erzeugt src/pixelfont.js: eine Bitmap-Schrift ohne Kantenglättung für die Vorgeschichte im Amiga-Stil.
# Die Zeichen werden aus Liberation Serif (SIL Open Font License 1.1, siehe assets/schriften/OFL-burgschrift.txt)
# mit FreeType-Hinting in 12 Pixeln gerendert. Die abgeleitete Bitmap-Schrift heißt „Burgschrift“, weil der Name
# „Liberation“ der Originalschrift vorbehalten ist.
#   python3 -I tools/pixelschrift.py [Pfad zur TTF]
import json, sys
from PIL import Image, ImageDraw, ImageFont

TTF = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'
SIZE = 12
CHARS = ''.join(chr(c) for c in range(32, 127)) + 'ÄÖÜäöüßéèàç„“”‚‘’–—…«»·°'

font = ImageFont.truetype(TTF, SIZE)
asc, desc = font.getmetrics()
H = asc + desc
glyphs = {}
for ch in CHARS:
    adv = round(font.getlength(ch))
    l, t, r, b = font.getbbox(ch)
    x0, x1 = min(0, l), max(adv, r)
    w = max(1, x1 - x0)
    im = Image.new('1', (w + 2, H + 2), 0)
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    d.text((-x0, 0), ch, font=font, fill=1)
    rows = []
    for y in range(H):
        v = 0
        for x in range(w):
            v = (v << 1) | (1 if im.getpixel((x, y)) else 0)
        rows.append(v)
    # leere Zeilen oben und unten weglassen: [Vorschub, x-Versatz, Breite, erste Zeile, Zeilen …]
    top = next((i for i, v in enumerate(rows) if v), 0)
    bot = max((i for i, v in enumerate(rows) if v), default=-1)
    glyphs[ch] = [adv, x0, w, top] + rows[top:bot + 1]

js = ('// Erzeugt von tools/pixelschrift.py: „Burgschrift“, eine Bitmap-Schrift aus Liberation Serif in 12 Pixeln\n'
      '// (SIL Open Font License 1.1, assets/schriften/OFL-burgschrift.txt). Je Zeichen: Vorschub, x-Versatz, Breite,\n'
      '// erste Zeile, dann die Zeilen als Bitmuster (linkes Pixel = höchstes Bit).\n'
      f'export const PIXFONT = {{ h: {H}, asc: {asc}, g: {json.dumps(glyphs, ensure_ascii=False, separators=(",", ":"))} }};\n')
open('src/pixelfont.js', 'w', encoding='utf-8').write(js)
print('Burgschrift:', len(glyphs), 'Zeichen, Höhe', H, 'Oberlänge', asc, '->', len(js), 'Bytes')
