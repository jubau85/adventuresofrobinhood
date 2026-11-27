# Warenbilder aus den Gegenstands-Vorlagen (<name>_vorne.png, 1280 × 1280, transparent): auf den Inhalt zuschneiden,
# premultipliziert auf höchstens 128 Bildpunkte verkleinern und als assets/waren/<name>.webp ablegen.
# Aufruf: python3 -I tools/waren.py <vorlagen-ordner> <ziel-ordner>
import sys, os, glob
import numpy as np
from PIL import Image
SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
MAXPX = 128
for f in sorted(glob.glob(os.path.join(SRC, '**', 'waren', '*_vorne.png'), recursive=True)):
    name = os.path.basename(f)[:-len('_vorne.png')]
    im = Image.open(f).convert('RGBA')
    im = im.crop(im.getbbox())
    a = np.asarray(im).astype(np.float32) / 255
    a[..., :3] *= a[..., 3:4]
    k = MAXPX / max(im.size)
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    pm = Image.fromarray((a * 255).astype(np.uint8), 'RGBA').resize((w, h), Image.LANCZOS)
    b = np.asarray(pm).astype(np.float32) / 255
    rgb = np.where(b[..., 3:4] > 1e-4, b[..., :3] / np.maximum(b[..., 3:4], 1e-4), 0)
    out = Image.fromarray((np.concatenate([rgb, b[..., 3:4]], -1) * 255).clip(0, 255).astype(np.uint8), 'RGBA')
    out.save(os.path.join(DST, f'{name}.webp'), quality=90)
    print(name, out.size)
