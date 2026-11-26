# Pergament für das Startmenü: fleckiger, gealterter Bogen mit gerissenem, dunkler gebranntem Rand (WebP mit Transparenz).
#   python3 -I tools/pergament.py <ziel.webp> [breite höhe]
import sys, math
import numpy as np
from PIL import Image, ImageFilter

out = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 900
H = int(sys.argv[3]) if len(sys.argv) > 3 else 1300
rng = np.random.default_rng(1194)

def noise(scale, w=W, h=H):
    """Weiches Rauschen: grobes Zufallsfeld, hochskaliert und geglättet (0…1)."""
    gw, gh = max(2, w // scale), max(2, h // scale)
    a = rng.random((gh, gw)).astype(np.float32)
    im = Image.fromarray((a * 255).astype(np.uint8), 'L').resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale / 3))
    return np.asarray(im).astype(np.float32) / 255

base = np.array([233, 216, 176], np.float32)
mott = noise(140) * 0.5 + noise(60) * 0.3 + noise(18) * 0.2          # Flecken in mehreren Größen
fine = noise(3) * 0.6 + noise(6) * 0.4                                 # Körnung
img = np.ones((H, W, 3), np.float32) * base
img *= (0.9 + (mott[..., None] - 0.5) * 0.22)
img *= (0.97 + (fine[..., None] - 0.5) * 0.09)
# Wasserflecken: einige dunklere Ringe und Wolken
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
wob = noise(50) - 0.5
for _ in range(4):
    cx, cy, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(80, 260)
    d = np.hypot((xx - cx) / r, (yy - cy) / (r * rng.uniform(0.6, 1.3))) + wob * 0.35
    ring = np.exp(-((d - 1) ** 2) / 0.01) * 0.035 + np.clip(1 - d, 0, 1) * 0.045
    img *= (1 - ring[..., None] * np.array([0.6, 0.85, 1.3]))
# Fasern und Knicke
for _ in range(2):
    y0 = rng.uniform(0.25, 0.75) * H
    band = np.exp(-((yy - y0 - (xx - W / 2) * rng.uniform(-0.05, 0.05)) ** 2) / 18)
    img *= (1 - band[..., None] * 0.06)
# Gerissener Rand: Abstand zum Rand plus Rauschen, nahe am Riss dunkler gebrannt
edge = np.minimum(np.minimum(xx, W - 1 - xx), np.minimum(yy, H - 1 - yy))
rough = (noise(40) - 0.5) * 34 + (noise(9) - 0.5) * 14 + (noise(3) - 0.5) * 5
e = edge + rough
alpha = np.clip((e - 14) / 2.5, 0, 1)
burn = np.clip(1 - (e - 14) / 70, 0, 1) ** 1.6
img *= (1 - burn[..., None] * np.array([0.42, 0.5, 0.62]))
dark = np.clip(1 - (e - 14) / 6, 0, 1)
img *= (1 - dark[..., None] * 0.35)
# leichte Vignette zur Mitte hin heller
cxn, cyn = (xx / W - 0.5), (yy / H - 0.45)
img *= (1.03 - (cxn ** 2 + cyn ** 2)[..., None] * 0.18)
rgba = np.dstack([np.clip(img, 0, 255), alpha * 255]).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(out, quality=82, alpha_quality=80, method=6)
print(out, W, H)
