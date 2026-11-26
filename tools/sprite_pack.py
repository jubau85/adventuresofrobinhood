# Packt gerenderte Sprite-Bögen (tools/sprites.py) für das Spiel:
#   python3 tools/sprite_pack.py <ordner> <ziel-ordner> <name> [--zelle 112] [--namen alt=neu,...] [--zuschnitt 1]
#     [--qualitaet 90] [--maske-qualitaet 85] [--alpha 100] [--nur bewegung,...]
# --zuschnitt 1 schneidet den leeren Rand ab, der in allen Bildern aller Bewegungen frei bleibt; die Zellen sind dann
# breite × hoehe statt zelle × zelle (spart Speicher, wenn in voller Größe gepackt wird).
# Je Bewegung zwei WebP-Bilder (bei --zelle 112 und 224er-Renderings in halber Größe):
#   <name>_<bewegung>.webp        Körper; die Hauptkleidung (Cyan) in Grau, damit sie sich einfärben lässt
#   <name>_<bewegung>_maske.webp  wo die Hauptkleidung ist (Deckkraft) und wie hell (Grauwert)
# Am Ende steht die Beschreibung für render.js (Zelle, Fußpunkt, Bilder, Dauer) als JSON.

import json, os, sys
import numpy as np
from PIL import Image

src, dst, name = sys.argv[1:4]
opt = {sys.argv[i].lstrip('-'): sys.argv[i + 1] for i in range(4, len(sys.argv) - 1, 2)}
CELL = int(opt.get('zelle', 112))
# Farbe, die das Spiel umfärbt: Farbton (Grad), Spielraum, Helligkeit, ab der die Maske voll ist
HUE, HUE_W, HELL = float(opt.get('farbton', 182)), float(opt.get('breite', 26)), float(opt.get('hell', 0.82))
QUAL = int(opt.get('qualitaet', 90))
# Deckkraft verlustbehaftet speichern (--alpha 50 spart fast die Hälfte; 100 = verlustfrei)
ALPHA = int(opt.get('alpha', 100))
RENAME = dict(p.split('=') for p in opt.get('namen', '').split(',') if '=' in p)
os.makedirs(dst, exist_ok=True)
meta = json.load(open(os.path.join(src, 'sprites.json')))
Z = meta['zelle']
k = CELL / Z
# Gemeinsamer Ausschnitt aller Zellen (Quell-Pixel): x0, y0, x1, y1
X0, Y0, X1, Y1 = 0, 0, Z, Z
if opt.get('zuschnitt'):
    X0, Y0, X1, Y1 = Z, Z, 0, 0
    for old in meta['bewegungen']:
        al = np.asarray(Image.open(os.path.join(src, f'{old}.png')).convert('RGBA'))[..., 3]
        for r in range(al.shape[0] // Z):
            for q in range(al.shape[1] // Z):
                ys, xs = np.nonzero(al[r * Z:(r + 1) * Z, q * Z:(q + 1) * Z] > 3)
                if len(xs): X0, Y0, X1, Y1 = min(X0, xs.min()), min(Y0, ys.min()), max(X1, xs.max() + 1), max(Y1, ys.max() + 1)
    pad = int(opt.get('rand', 3))
    X0, Y0, X1, Y1 = max(0, X0 - pad), max(0, Y0 - pad), min(Z, X1 + pad), min(Z, Y1 + pad)
CW, CH = max(1, round((X1 - X0) * k)), max(1, round((Y1 - Y0) * k))
KX, KY = CW / (X1 - X0), CH / (Y1 - Y0)
out = {'zelle': CELL, 'fusspunkt': [round((meta['fusspunkt'][0] - X0) * KX, 1), round((meta['fusspunkt'][1] - Y0) * KY, 1)],
       'figur_px': round(meta['figur_px'] * KY, 1), 'richtungen': meta['richtungen'], 'bewegungen': {}}
if opt.get('zuschnitt'): out['breite'], out['hoehe'] = CW, CH

def hue_sat(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx

# --nur a,b: nur diese Bewegungen schreiben (der Zuschnitt gilt weiter für alle, damit die Zellen zusammenpassen)
NUR = set(x for x in opt.get('nur', '').split(',') if x)
for old, info in meta['bewegungen'].items():
    if NUR and old not in NUR: continue
    new = RENAME.get(old, old)
    im = Image.open(os.path.join(src, f'{old}.png')).convert('RGBA')
    cols, rows = im.size[0] // Z, im.size[1] // Z
    if (X0, Y0, X1, Y1) != (0, 0, Z, Z):
        cut = Image.new('RGBA', (cols * (X1 - X0), rows * (Y1 - Y0)))
        for r in range(rows):
            for q in range(cols):
                cut.paste(im.crop((q * Z + X0, r * Z + Y0, q * Z + X1, r * Z + Y1)), (q * (X1 - X0), r * (Y1 - Y0)))
        im = cut
    if (CW, CH) != (X1 - X0, Y1 - Y0): im = im.resize((cols * CW, rows * CH), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    hue, sat, val = hue_sat(a)
    # Gewicht „Cyan“: Farbton um 180°, kräftig genug gesättigt
    wgt = np.clip(1 - np.abs(hue - HUE) / HUE_W, 0, 1) * np.clip((sat - 0.18) / 0.2, 0, 1) * (val > 0.12)
    gray = val * 0.92
    base = a.copy()
    for c in range(3): base[..., c] = a[..., c] * (1 - wgt) + gray * wgt
    mask = np.zeros_like(a)
    for c in range(3): mask[..., c] = np.clip(val / HELL, 0, 1)
    mask[..., 3] = wgt * a[..., 3]
    Image.fromarray((base * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(dst, f'{name}_{new}.webp'), quality=QUAL, alpha_quality=ALPHA, method=6)
    # Ohne umzufärbende Fläche keine Maske (spart Platz)
    if mask[..., 3].max() > 0.05 and 'ohne-maske' not in opt:
        Image.fromarray((mask * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(dst, f'{name}_{new}_maske.webp'), quality=int(opt.get('maske-qualitaet', 85)), alpha_quality=ALPHA, method=6)
    out['bewegungen'][new] = {'bilder': info['bilder'], 'schleife': info['schleife'], 'dauer': info['dauer']}
    # Punkte (z. B. Sattel) je Richtung und Bild, in Zellen-Pixeln der kleinen Fassung
    for key, arr in meta.get('punkte', {}).items():
        base, _, pn = key.partition('|')
        if base == old and arr:
            out.setdefault('punkte', {})[new + ('|' + pn if pn else '')] = [[round((x - X0) * KX, 1), round((y - Y0) * KY, 1)] for x, y in arr]
    print('gepackt', new, im.size, os.path.getsize(os.path.join(dst, f'{name}_{new}.webp')) // 1024, 'KB')
print(json.dumps(out, ensure_ascii=False))
