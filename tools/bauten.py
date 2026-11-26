# Gebäude und Galgen aus gemalten Rasterbögen (JPG, graues Gitter, Sommer- und Winterbogen gleich aufgebaut) ausschneiden.
#   python3 -I tools/bauten.py <bogen-ordner mit 18.jpg (Winter), 19.jpg (Sommer), 20.jpg (Galgen)> <ziel-ordner>
# Je Bild: Ausschnitt im Bogen, Fußpunkt (Mitte der Grundfläche, aus der eingezeichneten Grundrissraute oder den
# Mauerecken) und Bogenpixel je Weltpixel (Kachel 64 × 32). Gespeichert wird mit 3 Bildpunkten je Weltpixel;
# bauten.json nennt Fußpunkt (Weltpixel), Maßstab und die Grundfläche des Gebäudes (Kacheln) beim Maßstab 1.
import sys, os, json
from collections import deque
from PIL import Image
import numpy as np

OUT_K = 3
# name: (Bogen Sommer, Bogen Winter, Ausschnitt x0 y0 x1 y1, Fußpunkt x y, Bogenpixel je Weltpixel, Grundfläche wx wy)
ITEMS = {
    'langhaus_rotherwood': (19, 18, (1140, 0, 1810, 540), (1477.5, 356.5), 3.46, (3.3, 1.6)),
    'langhaus': (19, 18, (340, 0, 1030, 540), (680.5, 411), 3.46, (1.6, 3.3)),   # Beschriftung oben links wird ausgeblendet
    'kate_a': (19, 18, (200, 490, 600, 860), (398.5, 749.5), 4.75, (0.95, 0.95)),
    'kate_b': (19, 18, (595, 480, 995, 860), (793, 750), 4.75, (0.95, 0.95)),
    'taverne': (19, 18, (1020, 470, 1460, 880), (1255, 754), 4.75, (1.3, 0.94)),
}
# Galgen: vier Zellen (Sommer/Winter × leer/besetzt), Fußpunkt aus der Sommerzelle, die anderen gleich versetzt
GALGEN = {'galgen': (138, 88, 1042, 757), 'galgen_besetzt': (1048, 88, 1997, 757),
          'galgen_winter': (138, 763, 1042, 1490), 'galgen_besetzt_winter': (1048, 763, 1997, 1490)}
GALGEN_FUSS, GALGEN_K = (630, 573), 9.9

def flood(passable, seeds):
    h, w = passable.shape
    seen = seeds.copy(); q = deque(zip(*np.nonzero(seeds)))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and passable[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
    return seen

def box_mean(m, r):
    """Anteil gesetzter Pixel im (2r+1)²-Fenster (Summenbild)."""
    h, w = m.shape
    c = np.pad(m.astype(np.int32), ((r + 1, r), (r + 1, r))).cumsum(0).cumsum(1)
    s = c[2 * r + 1:, 2 * r + 1:] - c[:h, 2 * r + 1:] - c[2 * r + 1:, :w] + c[:h, :w]
    return s / (2 * r + 1) ** 2

def cut(a, holes=False, lines=True, bg_max=150):
    """Hintergrund vom Rand her fluten: erst das dunkle Grau samt Gitter, dann dünne helle Linien daneben
    (Grundrissraute), die wieder an Hintergrund grenzen. Schnee und helle Wände bleiben, weil sie breit sind."""
    h, w, _ = a.shape
    ai = a.astype(int); mx, mn = ai.max(2), ai.min(2); sat = mx - mn
    strict = (sat < 16) & (mx > 45) & (mx < bg_max)
    light = (sat < 22) & (mx >= 150) & (mx < 242)
    border = np.zeros((h, w), bool); border[0, :] = border[-1, :] = True; border[:, 0] = border[:, -1] = True
    seen = flood(strict, border & strict)
    for _ in range(4 if lines else 0):
        add = light & ~seen & (box_mean(seen, 4) > 0.42)
        if not add.any(): break
        seen = flood(strict | add, seen | add)
    if holes:
        # umschlossenes Grau (zwischen Pfosten und Balken) ebenfalls weg: nur fast farbloses Hintergrundgrau, große Stücke
        rest = (sat < 10) & (mx > 55) & (mx < 125) & ~seen
        lab = np.zeros((h, w), bool)
        for y0, x0 in zip(*np.nonzero(rest)):
            if lab[y0, x0]: continue
            pts = []; q = deque([(y0, x0)]); lab[y0, x0] = True
            while q:
                y, x = q.popleft(); pts.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and rest[ny, nx] and not lab[ny, nx]: lab[ny, nx] = True; q.append((ny, nx))
            if len(pts) >= 2500:
                ys, xs = zip(*pts); seen[list(ys), list(xs)] = True
    keep = ~seen
    # Zusammenhängende Stücke: das größte (das Gebäude) und alles, was groß genug ist, um dazuzugehören
    lab = np.zeros((h, w), np.int32); sizes = []
    for y0, x0 in zip(*np.nonzero(keep)):
        if lab[y0, x0]: continue
        n = len(sizes) + 1; lab[y0, x0] = n; q = deque([(y0, x0)]); c = 0
        while q:
            y, x = q.popleft(); c += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and keep[ny, nx] and not lab[ny, nx]: lab[ny, nx] = n; q.append((ny, nx))
        sizes.append(c)
    big = max(sizes)
    ok = np.zeros(len(sizes) + 1, bool)
    for i, c in enumerate(sizes): ok[i + 1] = c >= big * 0.1
    keep = ok[lab]
    al = keep.astype(np.float32)
    pad = np.pad(al, 1)
    nb = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:]) / 4
    al = np.where(keep, np.maximum(0.55, nb), 0)
    return np.dstack([a, (al * 255).astype(np.uint8)])

def main():
    SRC, DST = sys.argv[1], sys.argv[2]
    os.makedirs(DST, exist_ok=True)
    meta = {}
    def save(name, rgba, foot, k, area, crop_xy):
        img = Image.fromarray(rgba, 'RGBA')
        bb = img.getbbox(); img = img.crop(bb)
        fx, fy = foot[0] - crop_xy[0] - bb[0], foot[1] - crop_xy[1] - bb[1]
        f = OUT_K / k
        img = img.resize((max(1, round(img.width * f)), max(1, round(img.height * f))), Image.LANCZOS)
        img.save(os.path.join(DST, f'{name}.webp'), quality=86, alpha_quality=90, method=6)
        meta[name] = {'fuss': [round(fx / k, 2), round(fy / k, 2)], 'massstab': round(1 / OUT_K, 4), 'flaeche': list(area)}

    sheets = {n: np.asarray(Image.open(os.path.join(SRC, f'{n}.jpg')).convert('RGB')) for n in (18, 19, 20)}
    for name, (ns, nw, box, foot, k, area) in ITEMS.items():
        for sheet, suf in ((ns, ''), (nw, '_winter')):
            x0, y0, x1, y1 = box
            a = sheets[sheet][y0:y1, x0:x1].copy()
            # Überschrift des Bogens (oben links bis x 860, y 48) mit Hintergrundgrau übermalen
            if y0 < 48 and x0 < 860: a[:48 - y0, :max(0, 860 - x0)] = (72, 72, 72)
            save(name + suf, cut(a), foot, k, area, (x0, y0))
    # Galgen: Fußpunkt relativ zur unteren Mitte des Umrisses der Sommerzelle, für alle vier gleich
    base = None
    for name, (x0, y0, x1, y1) in GALGEN.items():
        rgba = cut(sheets[20][y0:y1, x0:x1], holes=True)
        bb = Image.fromarray(rgba, 'RGBA').getbbox()
        if base is None: base = (GALGEN_FUSS[0] - x0 - (bb[0] + bb[2]) / 2, GALGEN_FUSS[1] - y0 - bb[3])
        foot = (x0 + (bb[0] + bb[2]) / 2 + base[0], y0 + bb[3] + base[1])
        save(name, rgba, foot, GALGEN_K, (1.2, 0.9), (x0, y0))
    json.dump(meta, open(os.path.join(DST, 'bauten.json'), 'w'), indent=1, ensure_ascii=False)
    print(len(meta), 'Bilder', sum(os.path.getsize(os.path.join(DST, f'{k}.webp')) for k in meta) // 1024, 'KB')


if __name__ == '__main__':
    main()
