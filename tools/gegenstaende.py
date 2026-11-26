# Waffen, Schilde und Werkzeuge aus den Rasterbögen (JPG, graues Gitter, je Gegenstand vier Ansichten SW, SO, NW, NO)
# ausschneiden und für das Spiel zurechtlegen.
#   python3 -I tools/gegenstaende.py <bogen-ordner mit 13.jpg … 17.jpg> <ziel-ordner>
# Lange Gegenstände (Schwert, Axt, Speer, Bogen …) liegen danach waagerecht: Griffende links, Kopf oder Spitze rechts,
# schwere Seite (Klinge, Bauch des Bogens) unten. Das Spiel dreht sie um den Griffpunkt in die Hand.
# Schilde, Schale und Becher bleiben aufrecht (Schilde: Vorderseite aus der SW-, Rückseite aus der NW-Ansicht).
# Ergebnis: <name>.webp in 128 (kleine Dinge 256) Bildpunkten je Meter und gegenstaende.json mit Griffpunkt (Bildpunkte), Länge in Metern
# und dem Winkel, in dem der Gegenstand im Bogen lag (die Angelschnur hängt dann senkrecht).
import sys, os, json, math
from collections import deque
from PIL import Image
import numpy as np

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
DIRS = ['sw', 'so', 'nw', 'no']
# Bogen -> Spaltengrenzen, Zeilengrenzen, Namen je Spalte (None = leere Spalte)
SHEETS = {
    13: ([134, 507, 880, 1254, 1626, 1998], [85, 437, 790, 1144, 1493], ['knueppel', None, 'langschwert_b', None, 'kriegshammer']),
    14: ([134, 507, 880, 1254, 1626, 1998], [85, 437, 790, 1144, 1493], ['langschwert', 'speer', 'streitaxt', 'kurzbogen', 'armbrust']),
    15: ([134, 595, 1067, 1540, 1998], [85, 437, 790, 1144, 1493], ['holzschild', 'rundschild', 'langschild', 'wappenschild']),
    16: ([134, 507, 880, 1253, 1625, 1998], [85, 437, 790, 1144, 1493], ['axt', 'hammer', 'hacke', 'sichel', 'heugabel']),
    17: ([100, 430, 768, 1086, 1397, 1690, 2000], [66, 329, 592, 856, 1116], ['besen', 'angelrute', 'wanderstab', 'kruecke', 'bettelschale', 'krug']),
}
# Gegenstand: Ansicht, Ecke des Kopfs (tl, tr, bl, br), Griff als Anteil der Länge vom Griffende, Länge in Metern,
# Löcher (umschlossener Hintergrund, z. B. zwischen Bogen und Sehne) entfernen, schwere Seite nach unten drehen
LONG = {
    'knueppel': ('sw', 'bl', 0.12, 0.8, False, True),
    'langschwert': ('sw', 'tr', 0.09, 0.95, False, False),
    'kriegshammer': ('sw', 'bl', 0.12, 0.8, False, True),
    'speer': ('sw', 'tr', 0.38, 2.1, False, False),
    'streitaxt': ('sw', 'tr', 0.12, 0.85, False, True),
    'kurzbogen': ('sw', 'tr', 0.5, 1.2, True, True),
    'armbrust': ('sw', 'tr', 0.3, 0.85, True, False),
    'axt': ('sw', 'tl', 0.12, 0.75, False, True),
    'hammer': ('sw', 'bl', 0.25, 0.4, False, True),
    'hacke': ('sw', 'tl', 0.18, 1.1, False, False),
    'sichel': ('sw', 'tl', 0.1, 0.5, False, True),
    'heugabel': ('sw', 'bl', 0.4, 1.6, True, False),
    'besen': ('sw', 'bl', 0.45, 1.3, False, False),
    'angelrute': ('sw', 'tr', 0.05, 3.0, True, False),
    'wanderstab': ('sw', 'tl', 0.6, 1.7, True, True),
    'kruecke': ('sw', 'tr', 0.9, 1.3, True, False),
}
# aufrecht: Ansicht, Höhe in Metern, Löcher
UPRIGHT = {
    'holzschild': ('sw', 0.6, False), 'holzschild_innen': ('nw', 0.6, False),
    'rundschild': ('sw', 0.8, False), 'rundschild_innen': ('nw', 0.8, False),
    'langschild': ('sw', 1.1, False), 'langschild_innen': ('nw', 1.1, False),
    'wappenschild': ('sw', 0.8, False), 'wappenschild_innen': ('nw', 0.8, False),
    'bettelschale': ('sw', 0.1, False),
}

def flood_bg(a):
    """Hintergrund vom Zellenrand her fluten (grau, wenig Farbe); der dunkle Umriss hält die Flut auf."""
    h, w, _ = a.shape
    mx, mn = a.max(2), a.min(2)
    bg = (mx - mn < 18) & (mx > 50) & (mx < 185)
    seen = np.zeros((h, w), bool); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and bg[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
    return ~seen

def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32); n = 0; out = []
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; q = deque([(y0, x0)]); pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
        out.append(pts)
    return out

def cut(a, holes):
    keep = flood_bg(a.astype(int))
    if holes:
        # umschlossene Hintergrundflächen (Grau wie das Gitter) im Inneren ebenfalls herausnehmen
        mx, mn = a.max(2).astype(int), a.min(2).astype(int)
        inner = keep & (mx - mn < 18) & (mx > 55) & (mx < 140)
        for pts in components(inner):
            if len(pts) >= 40:
                ys, xs = zip(*pts); keep[list(ys), list(xs)] = False
    # Splitter (Gitterreste, Rauschen) entfernen
    for pts in components(keep):
        if len(pts) < 60:
            ys, xs = zip(*pts); keep[list(ys), list(xs)] = False
    # Kante leicht weich: ein Pixel Halbtransparenz am Rand
    al = keep.astype(np.float32)
    pad = np.pad(al, 1)
    nb = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]) / 4
    al = np.where(keep, np.maximum(0.55, nb) , 0)
    return np.dstack([a, (al * 255).astype(np.uint8)])

cells = {}
for n, (cols, rows, names) in SHEETS.items():
    im = np.asarray(Image.open(os.path.join(SRC, f'{n}.jpg')).convert('RGB'))
    for ci, name in enumerate(names):
        if not name: continue
        for ri, d in enumerate(DIRS):
            cells[(name, d)] = im[rows[ri] + 4:rows[ri + 1] - 4, cols[ci] + 4:cols[ci + 1] - 4]

meta = {}
def crop(img):
    bb = img.getbbox()
    return img.crop((max(0, bb[0] - 2), max(0, bb[1] - 2), min(img.width, bb[2] + 2), min(img.height, bb[3] + 2)))
# Bildpunkte je Meter im Spielbild: 128, kleine Dinge (Becher, Schale, Hammer) 256, damit sie beim Heranzoomen scharf bleiben
def save(name, img, info, px_len):
    info['ppm'] = 256 if info['meter'] < 0.45 else 128
    k = info['ppm'] * info['meter'] / px_len
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    info['griff'] = [round(info['griff'][0] * k, 1), round(info['griff'][1] * k, 1)]
    img.save(os.path.join(DST, f'{name}.webp'), quality=88, alpha_quality=90, method=6)
    meta[name] = info

for name, (view, head, grip, metres, holes, heavy_down) in LONG.items():
    img = Image.fromarray(cut(cells[(name, view)], holes), 'RGBA')
    img = crop(img)
    al = np.asarray(img)[..., 3] > 128
    ys, xs = np.nonzero(al)
    pts = np.stack([xs, ys], 1).astype(float); c0 = pts.mean(0)
    u, s, vt = np.linalg.svd(pts - c0, full_matrices=False)
    ax = vt[0]
    # Richtung Griffende -> Kopf: zur Ecke des Kopfs hin
    want = np.array([1.0 if 'r' in head else -1.0, 1.0 if 'b' in head else -1.0])
    if ax @ want < 0: ax = -ax
    ang = math.degrees(math.atan2(ax[1], ax[0]))
    img = img.rotate(ang, resample=Image.BICUBIC, expand=True)
    img = crop(img)
    arr = np.asarray(img); al = arr[..., 3] > 128
    ys, xs = np.nonzero(al)
    x0, x1 = xs.min(), xs.max()
    # Achse: mittlere Höhe der schmalen Stellen (Stiel), nicht der Kopfbreite
    cols = [ys[xs == x] for x in range(x0, x1 + 1)]
    widths = np.array([c.max() - c.min() + 1 if len(c) else 1e9 for c in cols])
    thin = [c for c, wd in zip(cols, widths) if len(c) and wd <= np.percentile(widths[widths < 1e9], 35)]
    axis_y = float(np.median([(c.min() + c.max()) / 2 for c in thin]))
    if heavy_down:
        head_part = ys[xs > x0 + (x1 - x0) * 0.7]
        if head_part.mean() < axis_y:
            img = img.transpose(Image.FLIP_TOP_BOTTOM); axis_y = img.height - 1 - axis_y
    L = x1 - x0
    save(name, img, {'art': 'lang', 'griff': [x0 + L * grip, axis_y], 'meter': metres, 'winkel': round(ang, 1)}, L)

for name, (view, metres, holes) in UPRIGHT.items():
    base = name.replace('_innen', '')
    img = crop(Image.fromarray(cut(cells[(base, view)], holes), 'RGBA'))
    save(name, img, {'art': 'aufrecht', 'griff': [img.width / 2, img.height / 2], 'meter': metres}, img.height)

# Krug und Becher stehen als zwei Teile in einer Zelle: aufteilen
img = Image.fromarray(cut(cells[('krug', 'sw')], False), 'RGBA')
al = np.asarray(img)[..., 3] > 128
parts = sorted(components(al), key=len, reverse=True)[:2]
for nm, pts, metres in (('krug', parts[0], 0.28), ('becher', parts[1], 0.12)):
    ys, xs = zip(*pts)
    sub = img.crop((min(xs) - 2, min(ys) - 2, max(xs) + 3, max(ys) + 3))
    m = np.zeros((sub.height, sub.width), bool)
    for y, x in pts: m[y - min(ys) + 2, x - min(xs) + 2] = True
    arr = np.asarray(sub).copy(); arr[..., 3] = np.where(m, arr[..., 3], 0)
    sub = Image.fromarray(arr, 'RGBA')
    save(nm, sub, {'art': 'aufrecht', 'griff': [sub.width / 2, sub.height / 2], 'meter': metres}, sub.height)

json.dump(meta, open(os.path.join(DST, 'gegenstaende.json'), 'w'), indent=1, ensure_ascii=False)
print(len(meta), 'Gegenstände', sum(os.path.getsize(os.path.join(DST, f'{k}.webp')) for k in meta) // 1024, 'KB')
