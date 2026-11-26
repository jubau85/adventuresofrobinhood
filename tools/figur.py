# Figur aus einem KI-Bild mit grünem Hintergrund freistellen und auf Spielgröße bringen.
# Aufruf: python3 tools/figur.py <quelle> <ziel.png> [figurhöhe_px]
# - Grünanteil wird zu Transparenz, grüne Säume an den Kanten werden neutralisiert
# - zugeschnitten, auf die Figurhöhe verkleinert, Fußpunkt unten in der Mitte der Füße
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
H = int(sys.argv[3]) if len(sys.argv) > 3 else 184
im = Image.open(src).convert('RGBA')
px = im.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        dom = g - max(r, b)
        if dom > 150:
            px[x, y] = (0, 0, 0, 0)
            continue
        alpha = 255 if dom < 60 else int(255 * (150 - dom) / 90)
        if dom > 0:
            g = max(r, b) + min(dom, 6)  # Grünstich entfernen
        px[x, y] = (r, g, b, alpha)
bbox = im.getbbox()
im = im.crop(bbox)
cw, ch = im.size
# Fußpunkt: Mitte der untersten 6 % deckender Pixel
foot = im.crop((0, int(ch * 0.94), cw, ch))
fp = foot.load()
xs = [x for y in range(foot.size[1]) for x in range(cw) if fp[x, y][3] > 128]
fx = (min(xs) + max(xs)) / 2 if xs else cw / 2
k = H / ch
nw, nh = max(1, round(cw * k)), H
im = im.resize((nw, nh), Image.LANCZOS)
pad = 4
out = Image.new('RGBA', (nw + 2 * pad, nh + 2 * pad), (0, 0, 0, 0))
out.paste(im, (pad, pad), im)
out.save(dst, optimize=True)
print(f'{dst}: {out.size[0]}x{out.size[1]}, Fußpunkt x={round(fx * k) + pad}, y={nh + pad}')
