# Paket „Flandern“ (Häuser, Wahrzeichen und Markt, Kanal) einbauen.
#   python3 -I tools/flandern.py <entpackte-pakete> <assets-ordner> [prüfbilder-ordner]
# Gleiches Format wie Paket York (tools/york.py): freigestellt, 4 Bildpunkte je Weltpixel, Kachel 64 × 32, je Bild
# ein Winterbild. Bei Bauten sind die unterste Ecke B und die linke und rechte Ecke der Grundfläche (Lv, Rv) gemessen
# (der Bodenumriss von B aus nach links und rechts verfolgt, bis er an der Wandkante nach oben springt, danach von Hand
# geprüft); runde Dinge haben Mitte, Unterkante und Breite des Fußes. Kanalstücke stehen auf der Mitte ihrer Kachel.
# Ausgabe: WebP mit 3 Bildpunkten je Weltpixel unter assets/flandern/ und flandern.json (Fußpunkt in Weltpixeln,
# Maßstab, Grundfläche in Kacheln, Türseite).
import sys, os, json, glob
from PIL import Image, ImageDraw
import numpy as np

SRC_K = 4.0
OUT_K = 3.0
# (B, Lv, Rv, Türseite) in Bildpunkten des gelieferten Bildes; L heißt Tür auf der vorderen linken Seite
MASS = {
    'backhaus': ('box', (192, 397), (26, 348), (369, 346), 'L'),
    'fachwerk': ('box', (218, 462), (63, 409), (298, 416), 'R'),
    'giebel_1': ('box', (189, 526), (22, 458), (295, 463), 'L'),
    'giebel_2': ('box', (206, 545), (22, 483), (300, 466), 'L'),
    'giebel_3': ('box', (186, 503), (23, 435), (281, 449), 'L'),
    'gildehaus': ('box', (364, 492), (29, 422), (459, 428), 'L'),
    'godshuis': ('box', (480, 469), (40, 257), (588, 419), 'L'),
    'hof': ('box', (429, 438), (42, 269), (538, 374), 'L'),
    'kate': ('box', (210, 363), (33, 287), (306, 307), 'L'),
    'scheune': ('box', (307, 462), (42, 338), (454, 380), 'L'),
    'speicher': ('box', (220, 583), (24, 521), (301, 510), 'L'),
    'weberhaus': ('box', (252, 336), (38, 276), (349, 278), 'L'),
    'belfried': ('box', (98, 887), (14, 845), (183, 844), 'L'),
    'tuchhalle': ('box', (650, 693), (48, 540), (800, 598), 'L'),
    'kirche': ('box', (206, 937), (45, 891), (800, 835), 'L'),
    'tretkran': ('box', (156, 424), (41, 369), (279, 375), 'L'),
    'gravensteen': ('rund', 446, 932, 797, 'L'),
    'windmuehle': ('rund', 270, 594, 150, 'L'),
}
KLEIN = ['tuchstand', 'tuchrahmen', 'bierfaesser', 'faerbebottiche', 'flachs', 'netzgestell', 'wollballen', 'lastkahn']
KANAL = ['kaimauer_x', 'kaimauer_y', 'kaimauer_ecke', 'kaimauer_x_rand', 'kaimauer_y_rand', 'steinbruecke_x', 'steinbruecke_y',
         'steinbruecke_ecke_nw_no', 'steinbruecke_ecke_nw_sw', 'steinbruecke_ecke_so_no', 'steinbruecke_ecke_so_sw']
# Kanalstücke: Bild 352 × 296, die Kachel (256 × 128) liegt mit ihrer Mitte bei 176 / 148
KACHEL_MITTE = (176, 148)


def find(root, name):
    hits = glob.glob(os.path.join(root, '**', name + '.png'), recursive=True)
    return hits[0] if hits else None


def main(src, assets, check=None):
    outdir = os.path.join(assets, 'flandern')
    os.makedirs(outdir, exist_ok=True)
    if check: os.makedirs(check, exist_ok=True)
    meta = {}
    k = OUT_K / SRC_K
    for name in list(MASS) + KLEIN + KANAL:
        for var in ('', '_winter'):
            p = find(src, name + var)
            if not p: print('fehlt', name + var); continue
            im = Image.open(p).convert('RGBA')
            a = np.array(im.getchannel('A')) > 150
            ys, xs = np.nonzero(a)
            m = MASS.get(name)
            door = m[-1] if m else 'L'
            if m and m[0] == 'box':
                (bx, by), (lx, ly), (rx, ry) = m[1], m[2], m[3]
                fx, fy = (lx + rx) / 2, (ly + ry) / 2
                L, R = bx - lx, rx - bx
            elif m and m[0] == 'rund':
                cx, bot, wd = m[1], m[2], m[3]
                fx, fy = cx, bot - wd / 4
                L = R = wd / 4 / 45.25 * 32 * SRC_K
            elif name in KANAL:
                fx, fy = KACHEL_MITTE
                L = R = 32 * SRC_K
            else:
                x0, x1, y1 = xs.min(), xs.max(), ys.max()
                fx, fy = (x0 + x1) / 2, y1 - (x1 - x0) / 4
                L = R = (x1 - x0) / 2
            wx, wy = L / (32 * SRC_K), R / (32 * SRC_K)
            out = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            out.save(os.path.join(outdir, name + var + '.webp'), 'WEBP', quality=82, method=6)
            meta[name + var] = {'fuss': [round(fx / SRC_K, 2), round(fy / SRC_K, 2)], 'k': round(1 / OUT_K, 4),
                                'flaeche': [round(wx, 2), round(wy, 2)], 'tuer': door}
            if check and not var:
                c = im.copy(); d = ImageDraw.Draw(c)
                def P(u, v): return (fx + (u - v) * 32 * SRC_K, fy + (u + v) * 16 * SRC_K)
                pts = [P(-wx / 2, -wy / 2), P(wx / 2, -wy / 2), P(wx / 2, wy / 2), P(-wx / 2, wy / 2)]
                d.polygon(pts, outline=(255, 0, 0, 255))
                d.ellipse([fx - 4, fy - 4, fx + 4, fy + 4], fill=(255, 0, 0, 255))
                bg = Image.new('RGBA', c.size, (110, 140, 90, 255)); bg.alpha_composite(c)
                bg.convert('RGB').save(os.path.join(check, name + '.png'))
    with open(os.path.join(outdir, 'flandern.json'), 'w') as f: json.dump(meta, f, indent=1, ensure_ascii=False)
    tot = sum(os.path.getsize(os.path.join(outdir, x)) for x in os.listdir(outdir) if x.endswith('.webp'))
    print(f'{len(meta)} Bilder, zusammen {tot // 1024} KB')
    # Tabellen für src/render.js
    p5 = {f'fl_{n}': [v['fuss'][0], v['fuss'][1], v['k']] for n, v in meta.items()}
    fl = {n: [v['flaeche'][0], v['flaeche'][1], v['tuer']] for n, v in meta.items() if not n.endswith('_winter')}
    with open(os.path.join(outdir, 'tabellen.js.txt'), 'w') as f:
        f.write('Object.assign(P5, ' + json.dumps(p5, separators=(',', ':')) + ');\n')
        f.write('const FLAND = ' + json.dumps(fl, separators=(',', ':')) + ';\n')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
