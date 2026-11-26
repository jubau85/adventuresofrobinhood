# Packt gerenderte Sprite-Bögen (tools/sprites.py) für das Spiel:
#   python3 tools/sprite_pack.py <ordner> <ziel-ordner> <name> [--zelle 112] [--namen alt=neu,...]
# Je Bewegung zwei WebP-Bilder in halber Größe:
#   <name>_<bewegung>.webp        Körper; die Hauptkleidung (Cyan) in Grau, damit sie sich einfärben lässt
#   <name>_<bewegung>_maske.webp  wo die Hauptkleidung ist (Deckkraft) und wie hell (Grauwert)
# Am Ende steht die Beschreibung für render.js (Zelle, Fußpunkt, Bilder, Dauer) als JSON.

import json, os, sys
import numpy as np
from PIL import Image

src, dst, name = sys.argv[1:4]
opt = {sys.argv[i].lstrip('-'): sys.argv[i + 1] for i in range(4, len(sys.argv) - 1, 2)}
CELL = int(opt.get('zelle', 112))
RENAME = dict(p.split('=') for p in opt.get('namen', '').split(',') if '=' in p)
os.makedirs(dst, exist_ok=True)
meta = json.load(open(os.path.join(src, 'sprites.json')))
k = CELL / meta['zelle']
out = {'zelle': CELL, 'fusspunkt': [round(meta['fusspunkt'][0] * k, 1), round(meta['fusspunkt'][1] * k, 1)],
       'figur_px': round(meta['figur_px'] * k, 1), 'richtungen': meta['richtungen'], 'bewegungen': {}}

def hue_sat(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a[..., :3].max(-1), a[..., :3].min(-1)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return h, s, mx

for old, info in meta['bewegungen'].items():
    new = RENAME.get(old, old)
    im = Image.open(os.path.join(src, f'{old}.png')).convert('RGBA')
    w, h = im.size
    im = im.resize((round(w * k), round(h * k)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    hue, sat, val = hue_sat(a)
    # Gewicht „Cyan“: Farbton um 180°, kräftig genug gesättigt
    wgt = np.clip(1 - np.abs(hue - 182) / 26, 0, 1) * np.clip((sat - 0.18) / 0.2, 0, 1) * (val > 0.12)
    gray = val * 0.92
    base = a.copy()
    for c in range(3): base[..., c] = a[..., c] * (1 - wgt) + gray * wgt
    mask = np.zeros_like(a)
    for c in range(3): mask[..., c] = np.clip(val / 0.82, 0, 1)
    mask[..., 3] = wgt * a[..., 3]
    Image.fromarray((base * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(dst, f'{name}_{new}.webp'), quality=90, method=6)
    Image.fromarray((mask * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(dst, f'{name}_{new}_maske.webp'), quality=85, method=6)
    out['bewegungen'][new] = {'bilder': info['bilder'], 'schleife': info['schleife'], 'dauer': info['dauer']}
    print('gepackt', new, im.size, os.path.getsize(os.path.join(dst, f'{name}_{new}.webp')) // 1024, 'KB')
print(json.dumps(out, ensure_ascii=False))
