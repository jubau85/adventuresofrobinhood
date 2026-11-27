# Nach tools/gegenstaende_render.py: Rohbilder verkleinern (premultipliziert), zuschneiden, lange Dinge waagerecht legen
# (Griffende links, Kopf rechts, schwere Seite unten) und den Griffpunkt bestimmen. Schreibt <name>.webp und ergänzt
# gegenstaende.json im Zielordner (Format wie assets/gegenstaende).
# Aufruf: python3 -I tools/gegenstaende_nach.py <render-ordner> <ziel-ordner>
import sys, os, json
import numpy as np
from PIL import Image
SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
info = json.load(open(os.path.join(SRC, '_render.json')))
jp = os.path.join(DST, 'gegenstaende.json')
meta = json.load(open(jp)) if os.path.exists(jp) else {}

def shrink(path, f):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255
    a[..., :3] *= a[..., 3:4]
    H, W = a.shape[0] // f * f, a.shape[1] // f * f
    a = a[:H, :W].reshape(H // f, f, W // f, f, 4).mean(axis=(1, 3))
    rgb = np.where(a[..., 3:4] > 1e-4, a[..., :3] / np.maximum(a[..., 3:4], 1e-4), 0)
    im = Image.fromarray((np.concatenate([rgb, a[..., 3:4]], -1) * 255).clip(0, 255).astype(np.uint8), 'RGBA')
    return im.crop(im.getbbox())

for name, m in info.items():
    for bl in m.get('blicke', [0]):
        key = f'{name}_{bl}'
        im = shrink(os.path.join(SRC, f'_{key}.png'), m['ss'])
        if m['art'] == 'lang':
            im = im.rotate(90 if m.get('kopf') == 'unten' else -90, expand=True)   # Kopf nach rechts
            a = np.asarray(im)[..., 3] > 20
            # schwere Seite nach unten (gleich für alle Blicke, nach dem flachen Blick entschieden)
            if bl == m['blicke'][0]:
                # Stiellinie im hinteren Drittel suchen, dann am Kopfende die Masse darüber und darunter vergleichen
                c0 = int(a.shape[1] * 0.3); rr = np.where(a[:, c0])[0]
                ym = (rr.min() + rr.max()) / 2 if len(rr) else a.shape[0] / 2
                hd = a[:, int(a.shape[1] * 0.75):]
                yy = np.arange(a.shape[0])[:, None]
                flip = (hd & (yy < ym)).sum() > (hd & (yy > ym)).sum()
            if flip: im = im.transpose(Image.FLIP_TOP_BOTTOM); a = a[::-1]
            cols = np.where(a.any(0))[0]
            gx = cols.min() + m['griff'] * (cols.max() - cols.min())
            rows = np.where(a[:, int(gx)])[0]
            gy = (rows.min() + rows.max()) / 2 if len(rows) else a.shape[0] / 2
            meta[key] = {'art': 'lang', 'griff': [round(float(gx), 1), round(float(gy), 1)], 'meter': m['meter'], 'winkel': 0, 'ppm': m['ppm']}
        else:
            meta[key] = {'art': 'aufrecht' if m['art'] == 'schild' else 'ware', 'griff': [round(im.width / 2, 1), round(im.height * 0.5, 1)], 'meter': m['meter'], 'ppm': m['ppm']}
        im.save(os.path.join(DST, f'{key}.webp'), quality=92)
    print('fertig', name)
json.dump(meta, open(jp, 'w'), indent=1, ensure_ascii=False)
