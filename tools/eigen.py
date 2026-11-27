# Paket 6 „Deine eigene Burg im Ausbau“ einlesen: Gebäude der Bauplätze (im Hof 2 × 2, vor der Mauer 3 × 3 Felder)
# in drei Stufen mit Schäden, Winter und den Jahreszeiten der Felder, dazu Absteckung, Baustelle und loses Baumaterial.
#   python3 -I tools/eigen.py <entpackte-teile> <assets-ordner>
# Die Bilder kommen in vierfacher Größe. Bauplatz-Bilder: Der untere Eckpunkt des Platzes liegt waagrecht in der Mitte,
# 32 px über der Unterkante; daraus der Fußpunkt in der Platzmitte (eine Platzbreite in Feldern mal 16 Weltpixel höher).
# Lose Teile: unten in der Mitte der sichtbaren Fläche. Ausgabe: WebP mit 3 Bildpunkten je Weltpixel unter assets/eigen/,
# eigen.json (Fußpunkt in Weltpixeln, Maßstab) und die Feuerstellen aus feuerpunkte.json (in Weltpixeln vom Fußpunkt).
import sys, os, json, glob
from PIL import Image
import numpy as np

SRC_K, OUT_K = 4.0, 3.0
LOSE = ('bauholz', 'steinquader', 'materialhaufen', 'bauplatz_schild')


def main(src, assets):
    out = os.path.join(assets, 'eigen'); os.makedirs(out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, '**', 'eigen', '*.png'), recursive=True))
    fire = {}
    for f in glob.glob(os.path.join(src, '**', 'eigen', 'feuerpunkte.json'), recursive=True): fire.update(json.load(open(f))['punkte'])
    meta, seen = {}, set()
    k = OUT_K / SRC_K
    for p in files:
        name = os.path.basename(p)[:-4]
        if name in seen: continue
        seen.add(name)
        im = Image.open(p).convert('RGBA')
        w, h = im.size
        if name.startswith(LOSE):
            a = np.array(im.getchannel('A')) > 150
            ys, xs = np.nonzero(a)
            fx, fy = (xs.min() + xs.max()) / 2, ys.max() - (xs.max() - xs.min()) * 0.12
        else:
            size = 2 if w == 640 else 3
            fx, fy = w / 2, h - 32 - size * 16 * SRC_K
        im.resize((round(w * k), round(h * k)), Image.LANCZOS).save(os.path.join(out, name + '.webp'), 'WEBP', quality=80, method=6)
        e = {'fuss': [round(fx / SRC_K, 2), round(fy / SRC_K, 2)], 'k': round(1 / OUT_K, 4)}
        if name + '.png' in fire: e['feuer'] = [[round((x - fx) / SRC_K, 1), round((y - fy) / SRC_K, 1)] for x, y in fire[name + '.png']]
        meta[name] = e
    json.dump(meta, open(os.path.join(out, 'eigen.json'), 'w'), indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out) if x.endswith('.webp'))
    print(f'{len(meta)} Bilder, zusammen {tot // 1024} KB')
    # Tabellen für src/render.js: Fußpunkte und Feuerstellen
    p5 = {f'eigen_{n}': [v['fuss'][0], v['fuss'][1], v['k']] for n, v in meta.items()}
    fe = {n: v['feuer'] for n, v in meta.items() if 'feuer' in v and '_winter' not in n}
    with open(os.path.join(out, 'tabellen.js.txt'), 'w') as f:
        f.write('Object.assign(P5, ' + json.dumps(p5, separators=(',', ':')) + ');\n')
        f.write('const EIGEN_FEUER = ' + json.dumps(fe, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
