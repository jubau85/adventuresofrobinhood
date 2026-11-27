# Paket „Turnierplatz und Hafen“ einlesen: Ritterzelte, Tribüne, Schranke, Fahne und Kleinkram des Turniers; Koggen,
# Boote, Steg und Kai-Kleinkram des Hafens, je mit Winterbild.
#   python3 -I tools/turnier_hafen.py <entpackte-teile> <assets-ordner>
# Die Bilder kommen in vierfacher Größe. Schranke und Steg sind je ein Feld lang und haben den Mauer-Anker (unterer
# Eckpunkt des Feldes unten mittig mit 5 % Rand); der Fußpunkt ist die Feldmitte, ein halbes Feld (64 px) höher. Alles
# andere steht mit der Mitte seiner Grundfläche auf dem Fußpunkt: Mitte der Breite, ein Viertel der Breite über der
# Unterkante (bei Schiffen und Booten die Mitte der Wasserlinie). Ausgabe mit 3 Bildpunkten je Weltpixel in vier Bögen
# unter assets/turnier_hafen/ (turnier, turnier_winter, hafen, hafen_winter), dazu th.json mit Bogen, Zelle und
# Fußpunkt (Weltpixel) je Bild.
import sys, os, json, glob
from PIL import Image
import numpy as np

SRC_K, OUT_K = 4.0, 3.0
FELD = ('schranke_x', 'schranke_y', 'steg_x', 'steg_y')


def shelf(items, maxw=2048):
    """Bilder in Reihen packen (nach Höhe sortiert); gibt Bogengröße und Lage je Bild."""
    items = sorted(items, key=lambda t: -t[1].height)
    x = y = rowh = 0; W = 0; pos = {}
    for name, im in items:
        if x + im.width > maxw: x = 0; y += rowh; rowh = 0
        pos[name] = (x, y); x += im.width; rowh = max(rowh, im.height); W = max(W, x)
    return (W, y + rowh), pos


def main(src, assets):
    out = os.path.join(assets, 'turnier_hafen'); os.makedirs(out, exist_ok=True)
    for f in glob.glob(os.path.join(out, '*.webp')): os.remove(f)
    k = OUT_K / SRC_K
    sheets, meta = {}, {}
    for folder in ('turnier', 'hafen'):
        for p in sorted(glob.glob(os.path.join(src, '**', folder, '*.png'), recursive=True)):
            name = os.path.basename(p)[:-4]
            if name in meta: continue
            im = Image.open(p).convert('RGBA'); w, h = im.size
            base = name.replace('_winter', '')
            if base in FELD:
                fx, fy = w / 2, h * 0.95 - 64
            else:
                a = np.array(im.getchannel('A')) > 150
                ys, xs = np.nonzero(a)
                fx, fy = (xs.min() + xs.max()) / 2, ys.max() - (xs.max() - xs.min()) / 4
            sheet = folder + ('_winter' if name.endswith('_winter') else '')
            small = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
            sheets.setdefault(sheet, []).append((name, small))
            meta[name] = {'fuss': [round(fx / SRC_K, 2), round(fy / SRC_K, 2)], 'k': round(1 / OUT_K, 4), 'bogen': sheet}
    for sheet, items in sheets.items():
        (W, H), pos = shelf(items)
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for name, im in items:
            atlas.paste(im, pos[name]); meta[name]['zelle'] = [sheet, pos[name][0], pos[name][1], im.width, im.height]
        atlas.save(os.path.join(out, sheet + '.webp'), 'WEBP', quality=82, method=6)
        print(sheet, (W, H), len(items), 'Bilder')
    json.dump(meta, open(os.path.join(out, 'th.json'), 'w'), indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out) if x.endswith('.webp'))
    print(f'{len(meta)} Bilder, zusammen {tot // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
