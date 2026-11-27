# Stadtmauer-Baukasten einlesen: gerade Mauer (x, y), vier Ecken mit Pfeiler, runder Mauerturm (mit und ohne Kegeldach),
# Torturm (x, y), je Sommer, Winter, leicht und schwer beschädigt (auch im Winter).
#   python3 -I tools/stadtmauer.py <assets-ordner> <entpackter-teil> [<weiterer-teil> ...]
# Die Bilder kommen in vierfacher Größe (ein Feld = 256 × 128 px); stadtmauer.json nennt je Teil den Fußpunkt = untere
# Ecke des Feldes. Das Spiel setzt jedes Teil auf die Feldmitte, die liegt ein halbes Feld (16 Weltpixel) höher.
# Ausgabe mit 3 Bildpunkten je Weltpixel in vier Bögen unter assets/stadtmauer/ (heil, heil_winter, schaden,
# schaden_winter), dazu sm.json mit Zelle und Anker (Weltpixel) je Bild. Druckt SM_ZELLEN und SM_P5 für den Code.
import sys, os, json, glob
from PIL import Image

SRC_K, OUT_K = 4.0, 3.0


def shelf(items, maxw=2048):
    items = sorted(items, key=lambda t: -t[1].height)
    x = y = rowh = 0; W = 0; pos = {}
    for name, im in items:
        if x + im.width > maxw: x = 0; y += rowh; rowh = 0
        pos[name] = (x, y); x += im.width; rowh = max(rowh, im.height); W = max(W, x)
    return (W, y + rowh), pos


def main(assets, parts):
    out = os.path.join(assets, 'stadtmauer'); os.makedirs(out, exist_ok=True)
    for f in glob.glob(os.path.join(out, '*.webp')): os.remove(f)
    teile = {}
    for part in parts:
        for j in glob.glob(os.path.join(part, '**', 'stadtmauer.json'), recursive=True): teile.update(json.load(open(j))['teile'])
    k = OUT_K / SRC_K
    sheets, meta = {}, {}
    for part in parts:
        for p in sorted(glob.glob(os.path.join(part, '**', '*.png'), recursive=True)):
            name = os.path.basename(p)[:-4]
            base = name
            for suf in ('_schaden_1_winter', '_schaden_2_winter', '_schaden_1', '_schaden_2', '_winter'):
                if base.endswith(suf): base = base[:-len(suf)]; break
            t = teile.get(base)
            if not t: print('ohne Anker:', name); continue
            fx, fy = t['fuss']
            im = Image.open(p).convert('RGBA'); w, h = im.size
            small = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
            sheet = ('schaden' if '_schaden_' in name else 'heil') + ('_winter' if name.endswith('_winter') else '')
            sheets.setdefault(sheet, []).append((name, small))
            meta[name] = {'anker': [round(fx / SRC_K, 2), round(fy / SRC_K - 16, 2), round(1 / OUT_K, 4)], 'bogen': sheet}
    for sheet, items in sheets.items():
        (W, H), pos = shelf(items)
        atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for name, im in items:
            atlas.paste(im, pos[name]); meta[name]['zelle'] = [sheet, pos[name][0], pos[name][1], im.width, im.height]
        atlas.save(os.path.join(out, sheet + '.webp'), 'WEBP', quality=84, method=6)
        print(sheet, (W, H), len(items), 'Bilder')
    json.dump(meta, open(os.path.join(out, 'sm.json'), 'w'), indent=1, ensure_ascii=False, sort_keys=True)
    tot = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out) if x.endswith('.webp'))
    print(f'{len(meta)} Bilder, zusammen {tot // 1024} KB')
    print('const SM_ZELLEN = ' + json.dumps({n: m['zelle'] for n, m in sorted(meta.items())}, separators=(',', ':')) + ';')
    print('const SM_P5 = ' + json.dumps({'sm_' + n: m['anker'] for n, m in sorted(meta.items())}, separators=(',', ':')) + ';')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
