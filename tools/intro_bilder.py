# Bilder der Vorgeschichte (Oakgen, siehe assets/INTRO-BRIEF.md) für das Spiel vorbereiten: auf das Seitenverhältnis des
# Bildfelds (300 : 124) zuschneiden, auf 600 × 248 verkleinern und verlustfrei als WebP nach assets/intro/ schreiben.
# Das Spiel bringt sie dann selbst auf die Amiga-Palette und legt die Farbzyklen darüber (src/intro.js).
#   python3 -I tools/intro_bilder.py <ordner mit geschichte_1.png … geschichte_6.png> [versatz_1 … versatz_6]
# Ein Versatz verschiebt den Zuschnitt senkrecht (−1 oben bündig, 0 Mitte, 1 unten bündig).
import sys, os
from PIL import Image

src = sys.argv[1]
shift = [float(v) for v in sys.argv[2:8]] + [0.0] * 6
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'intro')
os.makedirs(out, exist_ok=True)
for n in range(1, 7):
    p = os.path.join(src, f'geschichte_{n}.png')
    if not os.path.exists(p):
        print('fehlt', p); continue
    im = Image.open(p).convert('RGB')
    w, h = im.size
    ch = round(w * 124 / 300)
    if ch > h:   # zu niedrig: dann links und rechts beschneiden
        cw = round(h * 300 / 124); left = (w - cw) // 2; box = (left, 0, left + cw, h)
    else:
        top = round((h - ch) / 2 * (1 + shift[n - 1])); box = (0, top, w, top + ch)
    small = im.crop(box).resize((600, 248), Image.LANCZOS)
    dst = os.path.join(out, f'geschichte_{n}.webp')
    small.save(dst, 'WEBP', lossless=True, quality=100, method=6)
    print(dst, os.path.getsize(dst) // 1024, 'KB')
