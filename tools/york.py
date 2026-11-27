# Paket „York“ (Häuser, Wahrzeichen, Brücken, Markt- und Dorfdinge) und Pferdebögen aus Paket 8 Teil 2 einbauen.
#   python3 -I tools/york.py <entpackte-pakete> <assets-ordner> [prüfbilder-ordner]
# Die Bilder kommen freigestellt in vierfacher Größe (4 Bildpunkte je Weltpixel, Kachel 64 × 32). Für jedes Gebäude
# wird die Grundrissraute aus der Unterkante gelesen: Die unterste Ecke und die beiden Kanten, die von dort mit dem
# Gefälle der Schrägansicht nach links und rechts oben laufen, ergeben Fußpunkt (Mitte der Grundfläche) und Grundfläche
# in Kacheln (x nach rechts unten, y nach links unten). Kleinkram bekommt den Fußpunkt unten in der Mitte.
# Ausgabe: WebP mit 3 Bildpunkten je Weltpixel unter assets/york/, dazu york.json mit Fußpunkt (Weltpixel), Maßstab
# und Grundfläche je Bild. Mit Prüfbildern: jede erkannte Raute auf das Bild gezeichnet.
import sys, os, json, glob
from PIL import Image, ImageDraw
import numpy as np

SRC_K = 4.0     # Bildpunkte je Weltpixel in den gelieferten Bildern
OUT_K = 3.0     # so werden sie gespeichert

# Bild → Art der Fußpunktbestimmung: 'raute' (Gebäude mit erkennbarer Grundfläche) oder 'mitte' (Kleinkram)
# Feste Angaben überschreiben die Erkennung, wo Treppen, Stelzen oder Pfosten die Unterkante verdecken:
# (Grundfläche wx, wy in Kacheln, Fußpunkt-Verschiebung dx, dy in Bildpunkten des Originals)
HAUS = ['holz_1', 'holz_2', 'stein_1', 'stein_2', 'stein_3', 'stroh_2', 'stroh_3', 'stroh_4', 'ziegel_1', 'ziegel_2', 'ziegel_3', 'ziegel_4']
GROSS = ['kathedrale', 'kirche_dorf', 'kloster', 'langhalle']
DORF_RAUTE = ['brunnen', 'marktstand_1', 'marktstand_2', 'zelt_markt', 'zelt_lager', 'kohlenmeiler']
KLEIN = ['fass', 'heu', 'karren', 'kisten', 'feuerstelle', 'sitzstamm']
BRUECKE = ['bruecke_x', 'bruecke_y', 'bruecke_ecke_nw_no', 'bruecke_ecke_nw_sw', 'bruecke_ecke_so_no', 'bruecke_ecke_so_sw']
# Von Hand gemessen (Bildpunkte im gelieferten Bild): bei Bauten die unterste Ecke B und die linke und rechte Ecke der
# Grundfläche (Lv, Rv) und die Seite mit der Tür; bei runden Dingen Mitte, Unterkante und Breite des Fußes.
# Die gemalten Bilder halten das Gefälle 2 : 1 nicht genau, darum liegt der Fußpunkt in der Mitte zwischen Lv und Rv.
MASS = {
    'holz_1': ('box', (140, 312), (42, 262), (262, 270), 'L'),
    'holz_2': ('box', (160, 310), (38, 245), (258, 270), 'R'),
    'stein_1': ('box', (198, 362), (30, 285), (290, 300), 'L'),
    'stein_2': ('box', (210, 345), (25, 260), (328, 287), 'R'),
    'stein_3': ('box', (180, 375), (65, 332), (272, 320), 'L'),
    'stroh_2': ('box', (145, 332), (50, 285), (272, 288), 'R'),
    'stroh_3': ('box', (132, 340), (35, 292), (355, 218), 'R'),
    'stroh_4': ('rund', 144, 300, 208, 'L'),
    'ziegel_1': ('box', (150, 392), (52, 350), (278, 332), 'L'),
    'ziegel_2': ('box', (140, 405), (45, 362), (280, 325), 'R'),
    'ziegel_3': ('box', (160, 378), (72, 345), (250, 320), 'L'),
    'ziegel_4': ('box', (165, 408), (80, 380), (258, 360), 'L'),
    'kathedrale': ('box', (205, 795), (45, 700), (752, 650), 'L'),
    'kirche_dorf': ('box', (212, 512), (31, 446), (488, 354), 'L'),
    'kloster': ('box', (254, 415), (35, 315), (454, 327), 'L'),
    'langhalle': ('box', (170, 490), (40, 380), (700, 375), 'R'),
    'marktstand_1': ('box', (154, 226), (26, 186), (200, 182), 'L'),
    'marktstand_2': ('box', (144, 225), (25, 190), (203, 190), 'L'),
    'zelt_lager': ('box', (126, 200), (29, 140), (204, 147), 'L'),
    'zelt_markt': ('rund', 123, 236, 166, 'L'),
    'burghuegel': ('rund', 400, 720, 660, 'R'),
}
OVERRIDE = {}


def find(root, name):
    hits = glob.glob(os.path.join(root, '**', name + '.png'), recursive=True)
    return hits[0] if hits else None

def lowest(mask):
    h, w = mask.shape
    low = np.full(w, -1)
    ys = np.arange(h)[:, None]
    has = mask.any(0)
    low[has] = (np.where(mask, ys, -1)).max(0)[has]
    return low

def side_vertex(a, yb, side):
    """Von unten nach oben den äußersten Bildpunkt je Zeile verfolgen: Solange die Grundkante schräg läuft, rückt er
    je Zeile um gut zwei Punkte nach außen; an der Ecke der Grundfläche beginnt die senkrechte Wand. Gibt (x, y) der Ecke."""
    h, w = a.shape
    xs = []
    for y in range(yb, max(0, yb - h // 2), -1):
        row = np.nonzero(a[y])[0]
        xs.append((y, (row.min() if side < 0 else row.max()) if len(row) else None))
    best = None
    run = 0
    prev = None
    for y, x in xs:
        if x is None: continue
        if prev is not None:
            step = (prev - x) if side < 0 else (x - prev)
            if step >= 1: best = (x, y); run = 0
            else:
                run += 1
                if run >= 6 and best is not None: break
        else:
            best = (x, y)
        prev = x
    return best

def raute(im):
    a = np.array(im.getchannel('A')) > 150
    low = lowest(a)
    yb = int(low.max())
    cols = np.nonzero(low >= yb - 1)[0]
    xb = int(round(cols.mean()))
    (xl, yl), (xr, yr) = side_vertex(a, yb, -1), side_vertex(a, yb, 1)
    # Die Grundfläche ist eine Raute: links und rechts der untersten Ecke im Gefälle 1 : 2
    return xb, yb, xb - xl, xr - xb

def foot_of(xb, yb, L, R):
    # Mitte der Raute: von der untersten Ecke um (R − L)/2 nach rechts und (L + R)/4 nach oben
    return xb + (R - L) / 2, yb - (L + R) / 4

def save_webp(im, path, k):
    w, h = round(im.width * k), round(im.height * k)
    out = im.resize((w, h), Image.LANCZOS)
    out.save(path, 'WEBP', quality=82, method=6)
    return out

def main(src, assets, check=None):
    outdir = os.path.join(assets, 'york')
    os.makedirs(outdir, exist_ok=True)
    if check: os.makedirs(check, exist_ok=True)
    meta = {}
    k = OUT_K / SRC_K
    for name in HAUS + GROSS + DORF_RAUTE + KLEIN + BRUECKE + ['burghuegel']:
        for var in ('', '_winter'):
            p = find(src, name + var)
            if not p: print('fehlt', name + var); continue
            im = Image.open(p).convert('RGBA')
            a = np.array(im.getchannel('A')) > 150
            ys, xs = np.nonzero(a)
            m = MASS.get(name)
            if m and m[0] == 'box':
                (bx, by), (lx, ly), (rx, ry), door = m[1], m[2], m[3], m[4]
                fx, fy = (lx + rx) / 2, (ly + ry) / 2
                L, R = bx - lx, rx - bx
            elif m and m[0] == 'rund':
                cx, bot, wd, door = m[1], m[2], m[3], m[4]
                fx, fy = cx, bot - wd / 4
                # Ein Kreis vom Durchmesser D (Kacheln) ist in der Schrägansicht D · 45,25 Weltpixel breit
                L = R = wd / 4 / 45.25 * 32 * SRC_K
            elif name in KLEIN or name in BRUECKE or name in DORF_RAUTE:
                # Kleinkram: Mitte der Breite, ein Viertel der Breite über der Unterkante (flache Raute)
                x0, x1, y1 = xs.min(), xs.max(), ys.max()
                fx, fy = (x0 + x1) / 2, y1 - (x1 - x0) / 4
                L = R = (x1 - x0) / 2
                if name in BRUECKE:
                    # Brücken: ein Feld, Fußpunkt in der Mitte der Fahrbahn
                    fx, fy = 136, 112
            else:
                xb, yb, L, R = raute(im)
                if name + var in OVERRIDE or name in OVERRIDE:
                    o = OVERRIDE.get(name + var, OVERRIDE.get(name))
                    wx, wy, dx, dy = o
                    L, R = wx * 32 * SRC_K, wy * 32 * SRC_K
                    xb, yb = xb + dx, yb + dy
                fx, fy = foot_of(xb, yb, L, R)
            wx, wy = L / (32 * SRC_K), R / (32 * SRC_K)
            save_webp(im, os.path.join(outdir, name + var + '.webp'), k)
            meta[name + var] = {'fuss': [round(fx / SRC_K, 2), round(fy / SRC_K, 2)], 'k': round(1 / OUT_K, 4), 'flaeche': [round(wx, 2), round(wy, 2)], 'tuer': m[-1] if m else 'L'}
            if check and not var:
                c = im.copy(); d = ImageDraw.Draw(c)
                cx, cy = fx, fy
                # Ecken der Grundfläche (±wx/2, ±wy/2) in Schrägansicht
                def P(u, v): return (cx + (u - v) * 32 * SRC_K, cy + (u + v) * 16 * SRC_K)
                pts = [P(-wx / 2, -wy / 2), P(wx / 2, -wy / 2), P(wx / 2, wy / 2), P(-wx / 2, wy / 2)]
                d.polygon(pts, outline=(255, 0, 0, 255))
                d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 0, 0, 255))
                bg = Image.new('RGBA', c.size, (110, 140, 90, 255)); bg.alpha_composite(c)
                bg.convert('RGB').save(os.path.join(check, name + '.png'))
    # Pferdebögen aus Paket 8 Teil 2: 6 Spalten (Stehen, Gehen, Gehen, Grasen, Rennen, Erlegt) × 2 Zeilen (vorn, hinten)
    for name in ('klepper', 'packpferd', 'schlachtross'):
        p = find(src, name)
        if not p: print('fehlt', name); continue
        im = Image.open(p).convert('RGBA')
        # Gleiches Raster wie tiere/pferd (Zelle 224 × 192, Hufe bei 105 / 171), volle Größe
        save_webp(im, os.path.join(outdir, 'tier_' + name + '.webp'), 1.0)
        meta['tier_' + name] = {'cols': 6, 'rows': 2, 'zelle': [224, 192], 'fuss': [105.5, 171]}
    with open(os.path.join(outdir, 'york.json'), 'w') as f: json.dump(meta, f, indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(outdir, x)) for x in os.listdir(outdir) if x.endswith('.webp'))
    print(f'{len(meta)} Bilder, zusammen {tot // 1024} KB')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
