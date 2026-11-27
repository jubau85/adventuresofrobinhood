# Paket „Orte auf der Karte“ einlesen (Einsiedlerhöhle, Steinkreis, Bleigrube, Holzfäller-, Jäger- und Köhlerlager,
# heilige Quelle, Hügelgrab, Kapellenruine, Wegschrein), je Objekt ein Bild, alles auch als _winter.
#   python3 -I tools/orte.py <assets-ordner> <entpackter-teil> [<weiterer-teil> ...]
# Die Bilder kommen in vierfacher Größe; orte.json nennt den Fußpunkt (vordere, untere Ecke der Grundfläche) und die
# Grundfläche in Feldern [nach links oben, nach rechts oben]. Das Spiel setzt Objekte mit der Mitte ihrer Grundfläche
# auf den Fußpunkt; die Mitte liegt (b − a) / 2 Feldbreiten seitlich und (a + b) / 2 Feldhöhen über der Ecke.
# Ausgabe: assets/orte/<name>.webp mit 3 Bildpunkten je Weltpixel und assets/orte/orte.json (Anker in Weltpixeln).
# Bereits eingelesene Bilder bleiben erhalten, so lassen sich die Teile einzeln nachreichen.
import sys, os, json, glob
from PIL import Image

SRC_K, OUT_K = 4.0, 3.0
HW, HH = 32, 16


def main(assets, parts):
    out = os.path.join(assets, 'orte'); os.makedirs(out, exist_ok=True)
    mp = os.path.join(out, 'orte.json')
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    k = OUT_K / SRC_K
    for part in parts:
        info = json.load(open(glob.glob(os.path.join(part, '**', 'orte.json'), recursive=True)[0]))
        objs = info['objekte']
        for p in sorted(glob.glob(os.path.join(part, '**', 'orte', '*.png'), recursive=True)):
            name = os.path.basename(p)[:-4]
            base = name[:-7] if name.endswith('_winter') else name
            o = objs.get(base)
            if not o: print('ohne Anker:', name); continue
            a, b = o['felder']; fx, fy = o['fuss']
            cx = (fx / SRC_K + (b - a) * HW / 2)
            cy = (fy / SRC_K - (a + b) * HH / 2)
            im = Image.open(p).convert('RGBA'); w, h = im.size
            small = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
            small.save(os.path.join(out, name + '.webp'), 'WEBP', quality=84, method=6)
            meta[name] = {'anker': [round(cx, 2), round(cy, 2), round(1 / OUT_K, 4)], 'felder': [a, b]}
    json.dump(meta, open(mp, 'w'), indent=1, ensure_ascii=False, sort_keys=True)
    tot = sum(os.path.getsize(os.path.join(out, x)) for x in os.listdir(out) if x.endswith('.webp'))
    print(f'{len(meta)} Bilder, zusammen {tot // 1024} KB')
    # Anker für render.js und Dateien für assets.js
    print('const ORTE_P5 = ' + json.dumps({f'ort_{n}': m['anker'] for n, m in sorted(meta.items())}, separators=(',', ':')) + ';')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2:])
