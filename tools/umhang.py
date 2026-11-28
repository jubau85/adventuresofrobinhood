# Gemalte Umhänge der Helden einlesen (Bögen je Körper, Bewegung und Ebene: Zeilen = Richtungen r0 … r7, Spalten = Bilder).
#   python3 -I tools/umhang.py <assets-ordner> <entpacktes-paket>
# Das Paket kommt in doppelter Spielgröße (Zelle 440 × 480, Fußpunkt 220/370; ein Bildpunkt = 26/240 Weltpixel). Hier
# wird auf Spielgröße verkleinert (1 Bildpunkt = 26/120 Weltpixel, wie die Heldenbögen) und jeder Bogen auf den
# gemeinsamen Umriss seiner Zellen beschnitten. Ausgabe: assets/umhang/<körper>_<bewegung>_<ebene>.webp und
# umhang.json (Zelle, Fußpunkt in der Zelle, belegte Zellen); druckt UMHANG für render.js.
import sys, os, json
from PIL import Image


def main(assets, src):
    meta = json.load(open(os.path.join(src, 'umhang.json'), encoding='utf-8'))
    cw, ch = meta['zelle']; fx, fy = meta['fusspunkt_in_zelle']; k = meta.get('massstab', 2)
    out = os.path.join(assets, 'umhang'); os.makedirs(out, exist_ok=True)
    res = {}
    for name, b in sorted(meta['boegen'].items()):
        sheet = Image.open(os.path.join(src, name)).convert('RGBA')
        n = b['bilder']; W, H = cw // k, ch // k
        small = sheet.resize((W * n, H * 8), Image.LANCZOS)
        cells, box = {}, None
        for r in range(8):
            for i in range(n):
                c = small.crop((i * W, r * H, (i + 1) * W, (r + 1) * H))
                bb = c.getbbox()
                if bb is None: continue
                cells[(r, i)] = c
                box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
        if box is None: continue
        x0, y0, x1, y1 = max(0, box[0] - 1), max(0, box[1] - 1), min(W, box[2] + 1), min(H, box[3] + 1)
        w, h = x1 - x0, y1 - y0
        atlas = Image.new('RGBA', (w * n, h * 8), (0, 0, 0, 0))
        filled = ''
        for r in range(8):
            for i in range(n):
                c = cells.get((r, i))
                filled += '1' if c else '0'
                if c: atlas.paste(c.crop((x0, y0, x1, y1)), (i * w, r * h))
        key = f"{b['koerper']}_{b['bewegung']}_{b['ebene']}"
        atlas.save(os.path.join(out, key + '.webp'), 'WEBP', quality=90, method=6)
        res[key] = [n, w, h, round(fx / k - x0, 2), round(fy / k - y0, 2), filled]
        print(key, atlas.size, f'{sum(1 for x in filled if x == "1")} Zellen')
    json.dump(res, open(os.path.join(out, 'umhang.json'), 'w'), indent=1, sort_keys=True)
    tot = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out) if x.endswith('.webp'))
    print(f'zusammen {tot // 1024} KB')
    print('const UMHANG = ' + json.dumps(res, separators=(',', ':')) + ';')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
