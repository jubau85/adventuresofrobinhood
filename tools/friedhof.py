# Friedhof (Gräber, Kreuze, Zaun, Tor; Sommer- und Winterbogen) und Gefallene aus gemalten Rasterbögen ausschneiden.
#   python3 -I tools/friedhof.py <bogen-ordner mit 21.jpg (Friedhof), 22.jpg (Friedhof Winter), 23.jpg (Gefallene)> <ziel-ordner>
# Friedhof: Maßstab für den ganzen Bogen (Bogenpixel je Weltpixel, Kachel 64 × 32), Fußpunkt = Mitte des unteren Teils
# des Umrisses (Grabhügel, Sockel). Gefallene: Maßstab in Figureneinheiten (1,8 m = 26), Fußpunkt = Schwerpunkt.
# Schreibt <name>.webp und friedhof.json mit Fußpunkt und Maßstab (wie die Tabelle P5 in render.js).
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
import numpy as np
from bauten import cut, flood, box_mean   # gleiche Flutfüllung wie bei den Gebäuden

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
K_GRAB = 20.0      # Bogenpixel je Weltpixel (ein Grab ist gut eine halbe Kachel lang)
K_TOTER = 21.0     # Bogenpixel je Figureneinheit (ein Liegender ist gut 24 Einheiten lang)
OUT = 3            # gespeicherte Bildpunkte je Welt- bzw. Figureneinheit
# name: Ausschnitt im Bogen (x0, y0, x1, y1), Anteil der Umrisshöhe, über dem der Fußpunkt gemittelt wird.
# BLANK: Flächen im Ausschnitt, in die ein Nachbar hineinragt (mit Hintergrundgrau übermalt)
BLANK = {'grab_offen': [(560, 420, 740, 610)], 'grab_frisch': [(560, 130, 745, 350)], 'friedhof_zaun': [(1140, 1100, 1452, 1182)]}
# Fußpunkt fest (Bogenpixel): Zaunstück am Fuß des linken Pfostens (das Stück läuft von dort nach rechts oben, 0,51 Kacheln),
# Tor in der Mitte zwischen den Torpfosten
FOOT = {'friedhof_zaun': (1078, 1172), 'friedhof_tor': (1770, 1318)}
GRAB = {
    'grab_offen': ((105, 150, 740, 610), 0.45), 'grab_frisch': ((560, 130, 1045, 625), 0.55),
    'grab_steinkreuz': ((1040, 135, 1508, 612), 0.6), 'grab_stein': ((1478, 215, 1992, 655), 0.4),
    'grab_alt': ((112, 915, 602, 1355), 0.55), 'friedhofskreuz': ((612, 775, 995, 1392), 0.25),
    'friedhof_zaun': ((1050, 838, 1452, 1182), 0.5), 'friedhof_tor': ((1562, 785, 1988, 1412), 0.3),
}
TOTE = {'rot': 0, 'gruen': 1, 'braun': 2}
COLS = [112, 735, 1365, 2000]; ROWS = [118, 463, 808, 1150, 1493]

meta = {}
def keep_big(rgba, frac):
    """Nur Stücke behalten, die mindestens frac des größten ausmachen (Nachbarn im Ausschnitt fallen weg)."""
    from collections import deque
    al = rgba[..., 3] > 0
    h, w = al.shape
    lab = np.zeros((h, w), np.int32); sizes = [0]
    for y0, x0 in zip(*np.nonzero(al)):
        if lab[y0, x0]: continue
        n = len(sizes); lab[y0, x0] = n; q = deque([(y0, x0)]); c = 0
        while q:
            y, x = q.popleft(); c += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and al[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
        sizes.append(c)
    big = max(sizes)
    ok = np.array([s >= big * frac for s in sizes]); ok[0] = False
    out = rgba.copy(); out[..., 3] = np.where(ok[lab], rgba[..., 3], 0)
    return out

def save(name, rgba, k, foot_part=None, foot=None):
    img = Image.fromarray(rgba, 'RGBA'); bb = img.getbbox(); img = img.crop(bb)
    al = np.asarray(img)[..., 3] > 128
    ys, xs = np.nonzero(al)
    if foot: fx, fy = foot[0] - bb[0], foot[1] - bb[1]
    elif foot_part is None: fx, fy = xs.mean(), ys.mean()
    else:
        # Fußpunkt: Mitte des unteren Teils (ohne Kreuz und Aufbau), senkrecht in dessen Mitte
        top = img.height * (1 - foot_part)
        sel = ys >= top
        fx, fy = xs[sel].mean(), (top + img.height) / 2
    f = OUT / k
    img = img.resize((max(1, round(img.width * f)), max(1, round(img.height * f))), Image.LANCZOS)
    img.save(os.path.join(DST, f'{name}.webp'), quality=86, alpha_quality=90, method=6)
    meta[name] = [round(fx / k, 2), round(fy / k, 2), round(1 / OUT, 4)]

sheets = {n: np.asarray(Image.open(os.path.join(SRC, f'{n}.jpg')).convert('RGB')) for n in (21, 22, 23)}
for name, ((x0, y0, x1, y1), part) in GRAB.items():
    for n, suf in ((21, ''), (22, '_winter')):
        a = sheets[n][y0:y1, x0:x1].copy()
        for bx0, by0, bx1, by1 in BLANK.get(name, []): a[by0 - y0:by1 - y0, bx0 - x0:bx1 - x0] = (72, 72, 72)
        rgba = keep_big(cut(a), 0.08)
        f = FOOT.get(name)
        save(name + suf, rgba, K_GRAB, part, f and (f[0] - x0, f[1] - y0))
for typ, ci in TOTE.items():
    for ri in range(4):
        a = sheets[23][ROWS[ri] + 6:ROWS[ri + 1] - 6, COLS[ci] + 6:COLS[ci + 1] - 6]
        save(f'toter_{typ}_{ri + 1}', keep_big(cut(a), 0.01), K_TOTER)
json.dump(meta, open(os.path.join(DST, 'friedhof.json'), 'w'), indent=1, ensure_ascii=False)
print(len(meta), 'Bilder', sum(os.path.getsize(os.path.join(DST, f'{k}.webp')) for k in meta) // 1024, 'KB')
