# Programmsymbol der Desktop-App: blauer Dreiecksschild mit goldenem Löwen (aus assets/wappen), Goldrand,
# 1024 × 1024 mit Transparenz. electron-builder macht daraus .ico (Windows) und .icns (Mac).
#   python3 -I tools/symbol.py desktop/build/icon.png
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 1024
def shield(d, inset, fill):
    w, top, mid, bot = S - 2 * inset, 70 + inset, 560, S - 40 - inset
    l, r = inset + 90, S - inset - 90
    pts = [(l, top), (r, top), (r, mid)]
    # untere Spitze als Bogen (Dreiecksschild)
    for k in range(1, 41):
        t = k / 40
        pts.append((r + (S / 2 - r) * t, mid + (bot - mid) * (t ** 0.85) - 0 * t))
    for k in range(1, 41):
        t = k / 40
        pts.append((S / 2 + (l - S / 2) * t, bot - (bot - mid) * (t ** 1.18)))
    d.polygon(pts, fill=fill)

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
shield(ImageDraw.Draw(sh), 0, (20, 14, 8, 170))
img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)), (10, 18))
d = ImageDraw.Draw(img)
shield(d, 0, (201, 160, 72, 255))     # Goldrand
shield(d, 34, (40, 70, 140, 255))      # Feld blau
lion = Image.open('assets/wappen/loewe_gold.webp').convert('RGBA')
# heller Saum um die Figur (Reste des Malgrunds) ausblenden
px = lion.load()
for y in range(lion.height):
    for x in range(lion.width):
        r, g, b, a = px[x, y]
        if a and min(r, g, b) > 185 and max(r, g, b) - min(r, g, b) < 40: px[x, y] = (r, g, b, 0)
k = 560 / max(lion.size)
lion = lion.resize((round(lion.width * k), round(lion.height * k)), Image.LANCZOS)
img.alpha_composite(lion, ((S - lion.width) // 2, 150 + (600 - lion.height) // 2))
img.save(sys.argv[1])
print('Symbol', sys.argv[1])
