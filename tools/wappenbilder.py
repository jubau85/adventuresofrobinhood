# Die zwölf gemalten Wappenbilder aus dem Wappenbogen (zwei Reihen zu sechs Schilden) ausschneiden.
#   python3 -I tools/wappenbilder.py <wappenbogen.webp> <ziel-ordner>
# Je Schild: Schild vom Pergament trennen, Feldfarbe am Schildrand messen, alles, was sich deutlich von der Feldfarbe
# abhebt (Farbabstand in Lab), ist das Wappenbild. Die Tintenkontur am Rand bleibt, ringsum kommt eine feine Tintenlinie.
# Jedes Bild gibt es in Gold und in Silber: die Fassung, in der es gemalt ist, bleibt, die andere entsteht über eine
# Verlaufskarte aus der Helligkeit. Der Rabe bleibt schwarz. Schreibt <id>_gold.webp und <id>_silber.webp.
import sys, os, json
from collections import deque
from PIL import Image
import numpy as np

IDS = [['loewe', 'adler', 'hirsch', 'eber', 'rabe', 'kreuz'], ['lilie', 'stern', 'turm', 'mond', 'schwerter', 'rose']]
NATIVE = {'adler': 'gold', 'hirsch': 'gold', 'kreuz': 'gold', 'stern': 'gold', 'turm': 'gold', 'rose': 'gold',
          'loewe': 'silber', 'eber': 'silber', 'lilie': 'silber', 'mond': 'silber', 'schwerter': 'silber', 'rabe': 'natur'}
# Umschlossene Flächen in Feldfarbe trotzdem füllen (Griffe der Schwerter auf Gold sind so gelb wie das Feld)
FILL_FIELD_HOLES = {'schwerter': 0.01}
# Feste Schwelle, wo das Bild bis an den Schildrand reicht und den gemessenen Rand verfälscht
THRESHOLD = {'adler': 24.0, 'turm': 24.0}
OUT = 200
RAMP = {
    'gold': [(0, (40, 25, 8)), (0.3, (118, 76, 20)), (0.6, (201, 146, 42)), (0.85, (233, 187, 74)), (1, (247, 219, 124))],
    'silber': [(0, (28, 28, 32)), (0.3, (92, 94, 98)), (0.58, (178, 180, 178)), (0.82, (228, 228, 222)), (1, (251, 250, 246))],
}
INK = np.array([32, 22, 14])


def lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        p = np.pad(out, 1)
        out = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:] | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
    return out


def erode(m, r):
    return ~dilate(~m, r)


def components(m):
    h, w = m.shape
    lab_ = np.zeros((h, w), np.int32); sizes = [0]
    for y0, x0 in zip(*np.nonzero(m)):
        if lab_[y0, x0]: continue
        n = len(sizes); lab_[y0, x0] = n; q = deque([(y0, x0)]); c = 0
        while q:
            y, x = q.popleft(); c += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab_[ny, nx]: lab_[ny, nx] = n; q.append((ny, nx))
        sizes.append(c)
    return lab_, np.array(sizes)


def holes(m):
    """Flächen, die nicht vom Rand her erreichbar sind."""
    outside = ~m
    lab_, sizes = components(outside)
    border = set(np.unique(np.concatenate([lab_[0], lab_[-1], lab_[:, 0], lab_[:, -1]]))) - {0}
    return lab_, sizes, border


def ramp(t, stops):
    out = np.zeros(t.shape + (3,))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        sel = (t >= a) & (t <= b)
        f = ((t - a) / (b - a))[..., None]
        out[sel] = (np.array(ca) * (1 - f) + np.array(cb) * f)[sel]
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    img = np.asarray(Image.open(src).convert('RGB')).astype(float)
    H, W, _ = img.shape
    L = lab(img)
    meta = {}
    for row in range(2):
        for col in range(6):
            cid = IDS[row][col]
            x0, x1 = round(col * W / 6), round((col + 1) * W / 6)
            y0, y1 = round(row * H / 2), round((row + 1) * H / 2)
            a, la = img[y0:y1, x0:x1], L[y0:y1, x0:x1]
            h, w = la.shape[:2]
            # Pergament: Mittel aus dem Rand der Zelle; Schild = größtes Stück, das sich deutlich abhebt, Löcher gefüllt
            edge = np.concatenate([la[:6].reshape(-1, 3), la[-6:].reshape(-1, 3), la[:, :6].reshape(-1, 3), la[:, -6:].reshape(-1, 3)])
            parch = np.median(edge, 0)
            diff = np.linalg.norm(la - parch, axis=-1) > 28
            lab_, sizes = components(diff)
            shield = lab_ == int(np.argmax(sizes[1:]) + 1)
            # Der Schild ist in jeder Zeile zusammenhängend: von links bis rechts füllen (ein Turm, der auf dem
            # Schildrand steht, ist sonst kein Loch, sondern hängt am Pergament)
            for y in range(h):
                xs = np.nonzero(shield[y])[0]
                if len(xs): shield[y, xs[0]:xs[-1] + 1] = True
            inner = erode(shield, 9)
            # Feldfarbe: Ring innen am Schildrand
            band = inner & ~erode(shield, 26)
            field = np.median(la[band], 0)
            d = np.linalg.norm(la - field, axis=-1)
            dark_field = field[0] < 30
            thr = THRESHOLD.get(cid) or max(22.0, np.percentile(d[band], 85) * 1.3)
            charge = inner & (d > thr)
            # Rauschen weg: nur Stücke, die groß genug sind
            lab_, sizes = components(charge)
            big = sizes[1:].max()
            keep = np.zeros(len(sizes), bool); keep[1:] = sizes[1:] >= big * 0.015
            # Stücke, die nur im Randstreifen des Schildes liegen, sind Farbflecken am Rand, kein Teil des Bildes
            core = erode(shield, 24)
            for n in range(1, len(sizes)):
                if keep[n] and not (core & (lab_ == n)).any(): keep[n] = False
            charge = keep[lab_]
            # Auf dunklem Feld trennen nur dünne Tintenlinien die Mitte der Rose vom Rand: erst schließen
            if dark_field: charge = charge | (erode(dilate(charge, 4), 4) & inner)
            # Umschlossene Flächen: auf dunklem Feld sind es Tintenzeichnungen (Samen der Rose), sonst Feld
            hl, hs, border = holes(charge)
            area = charge.sum()
            limit = 0.16 if dark_field else FILL_FIELD_HOLES.get(cid, 0)
            for n in range(1, len(hs)):
                if n in border or hs[n] > area * limit: continue
                charge |= hl == n
            # Tintenkontur: dunkle Pixel gleich neben dem Bild gehören dazu (auf dunklem Feld nicht: das wäre das Feld)
            lum = la[..., 0]
            if not dark_field: charge |= dilate(charge, 2) & ~charge & (lum < 38) & inner
            outline = dilate(charge, 1) & ~charge
            rgb = a.copy()
            # Dunkle Randpixel tragen noch einen Hauch der Feldfarbe: zu neutraler Tinte machen
            fringe = charge & ~erode(charge, 2) & (lum < 42)
            rgb[fringe] = INK * 0.6 + rgb[fringe].mean(-1, keepdims=True) * 0.4
            rgb[outline] = INK
            alpha = np.where(charge, 255, np.where(outline, 215, 0)).astype(np.uint8)
            ys, xs = np.nonzero(alpha)
            by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            rgb, alpha, chg = rgb[by0:by1, bx0:bx1], alpha[by0:by1, bx0:bx1], charge[by0:by1, bx0:bx1]
            lum_c = lum[by0:by1, bx0:bx1]
            k = OUT / max(rgb.shape[0], rgb.shape[1])
            size = (max(1, round(rgb.shape[1] * k)), max(1, round(rgb.shape[0] * k)))
            for metal in ('gold', 'silber'):
                nat = NATIVE[cid]
                if nat in (metal, 'natur'): out = rgb
                else:
                    v = lum_c[chg]
                    lo, hi = np.percentile(v, 3), np.percentile(v, 97 if nat == 'silber' else 92)
                    t = np.clip((lum_c - lo) / max(1e-3, hi - lo), 0, 1)
                    out = np.where(chg[..., None], ramp(t, RAMP[metal]), rgb)
                im = Image.fromarray(np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha]), 'RGBA').resize(size, Image.LANCZOS)
                im.save(os.path.join(dst, f'{cid}_{metal}.webp'), quality=88, alpha_quality=92, method=6)
            meta[cid] = {'feld': [round(float(v), 1) for v in field], 'schwelle': round(float(thr), 1), 'groesse': list(size)}
    print(json.dumps(meta, ensure_ascii=False))
    print(sum(os.path.getsize(os.path.join(dst, f)) for f in os.listdir(dst) if f.endswith('.webp')) // 1024, 'KB')


if __name__ == '__main__':
    main()
