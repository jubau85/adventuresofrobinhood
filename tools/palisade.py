# Einzelne Pfähle und das Palisadentor aus dem gemalten Palisadenbogen (Sommer 19.jpg, Winter 18.jpg) schneiden.
#   python3 -I tools/palisade.py <bogen-ordner> <ziel-ordner>
# Ein runder Pfahl sieht von allen Seiten gleich aus: Aus der Vorderansicht des geraden Stücks lassen sich darum Pfähle
# gewinnen, die das Spiel im Kreis um eine Halle stellt. Das Tor (Pfosten, Querbalken, offene Flügel) legt das Spiel
# schräg in die Richtung der Lücke. Schreibt pfahl_<n>[_winter].webp, palisade_tor[_winter].webp und palisade.json
# (Fußpunkt in Weltpixeln, Maßstab 1/3).
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import numpy as np
from bauten import cut

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
K = 170 / 30      # Bogenpixel je Weltpixel: ein Pfahl (170 Bogenpixel) wird 30 Weltpixel hoch, gut zweieinhalb Meter
OUT = 3
SEG = (395, 872, 892, 1056)            # gerades Stück ohne Streben an den Enden
TOR = (1590, 862, 1822, 1074)          # Torpfosten, Querbalken, Flügel
meta = {}

def save(name, img, foot):
    f = OUT / K
    img = img.resize((max(1, round(img.width * f)), max(1, round(img.height * f))), Image.LANCZOS)
    img.save(os.path.join(DST, f'{name}.webp'), quality=88, alpha_quality=90, method=6)
    meta[name] = [round(foot[0] / K, 2), round(foot[1] / K, 2), round(1 / OUT, 4)]

for n, suf in ((19, ''), (18, '_winter')):
    sheet = np.asarray(Image.open(os.path.join(SRC, f'{n}.jpg')).convert('RGB'))
    x0, y0, x1, y1 = SEG
    seg = sheet[y0:y1, x0:x1].copy()
    h, w, _ = seg.shape
    # Lücken zwischen den Pfählen: Spalten, in denen zwischen den Seilbändern das graue Hintergrundbild durchscheint
    si = seg.astype(int); mx, mn = si.max(2), si.min(2)
    grey = (mx - mn < 16) & (mx > 45) & (mx < 118)
    gap = grey[int(h * 0.47):int(h * 0.75)].mean(0) > 0.45
    runs, start = [], None
    for x in range(w + 1):
        on = x < w and not gap[x]
        if on and start is None: start = x
        if not on and start is not None:
            if x - start >= 8: runs.append((start, x))
            start = None
    count = 0
    for a, b in runs:
        a2, b2 = max(0, a - 2), min(w, b + 2)
        # je Pfahl neu ausschneiden: die Flut kommt jetzt auch von den Lücken links und rechts herein
        col = cut(seg[:, a2:b2].copy(), lines=False, bg_max=118)   # Schnee an den Kanten bleibt
        # nur was zum Pfahl gehört: die Riegel hinter den Pfählen ragen nicht über den Rand hinaus
        img = Image.fromarray(col, 'RGBA'); bb = img.getbbox()
        if not bb: continue
        img = img.crop(bb)
        count += 1
        save(f'pfahl_{count}{suf}', img, (img.width / 2, img.height - 3))
    meta[f'pfahl_anzahl{suf}'] = count
    x0, y0, x1, y1 = TOR
    img = Image.fromarray(cut(sheet[y0:y1, x0:x1].copy(), lines=False, bg_max=118), 'RGBA'); bb = img.getbbox(); img = img.crop(bb)
    # Fußpunkt: Mitte zwischen den Pfosten am Boden
    save(f'palisade_tor{suf}', img, (img.width / 2, img.height - 6))
json.dump(meta, open(os.path.join(DST, 'palisade.json'), 'w'), indent=1)
print({k: v for k, v in meta.items() if 'anzahl' in k}, sum(os.path.getsize(os.path.join(DST, f)) for f in os.listdir(DST) if f.endswith('.webp')) // 1024, 'KB')
