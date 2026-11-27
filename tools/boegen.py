# Fasst die WebP-Bilder eines Ordners zu zwei Bildbögen zusammen (Sommer und Winter), damit das veröffentlichte Spiel
# wenige Dateien hat. Die Einzelbilder werden ersetzt; boegen.json nennt je Bild Bogen und Zelle [Bogen, x, y, Breite,
# Höhe]. Das Spiel lädt einen Bogen und zerschneidet ihn wieder in die einzelnen Bilder (src/assets.js).
#   python3 -I tools/boegen.py <ordner> <bogenname>
import sys, os, json, glob
from PIL import Image


def shelf(items, maxw=2048):
    items = sorted(items, key=lambda t: -t[1].height)
    x = y = rowh = 0; W = 0; pos = {}
    for name, im in items:
        if x + im.width > maxw: x = 0; y += rowh; rowh = 0
        pos[name] = (x, y); x += im.width; rowh = max(rowh, im.height); W = max(W, x)
    return (W, y + rowh), pos


def main(folder, bogen):
    files = sorted(f for f in glob.glob(os.path.join(folder, '*.webp')) if not os.path.basename(f).startswith(bogen))
    groups = {}
    for f in files:
        name = os.path.basename(f)[:-5]
        groups.setdefault(bogen + ('_winter' if name.endswith('_winter') else ''), []).append((name, Image.open(f).convert('RGBA')))
    cells = {}
    for sheet, items in groups.items():
        (W, H), pos = shelf(items)
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for name, im in items:
            atlas.paste(im, pos[name]); cells[name] = [sheet, pos[name][0], pos[name][1], im.width, im.height]
        atlas.save(os.path.join(folder, sheet + '.webp'), 'WEBP', quality=84, method=6)
        print(sheet, (W, H), len(items), 'Bilder')
    for f in files: os.remove(f)
    json.dump(cells, open(os.path.join(folder, 'boegen.json'), 'w'), separators=(',', ':'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
