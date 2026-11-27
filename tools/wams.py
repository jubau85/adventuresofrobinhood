# Färbt das dunkle Wams einer Meshy-Figur in der Textur cyan, damit das Spiel es in die Wappenfarbe umfärben kann
# (wie den Waffenrock des Ritters). Erkannt wird es an Lage und Farbe: Flächen des Modells zwischen Knie und Hals
# (Anteile der Körperhöhe in der Grundhaltung) und dort dunkle, wenig gesättigte Bildpunkte. Haut, Leder, Goldborte,
# Haare und die Beinlinge unter dem Knie bleiben, wie sie sind. Die Helligkeitsunterschiede der Wolle bleiben als
# Schattierung erhalten.
#   /opt/blender-venv/bin/python tools/wams.py -- <figur.glb> <ausgabe.png> [--textur <eingabe.png>] [--hoehe 0.27,0.84]
#       [--dunkel 0.32] [--saettigung 0.35] [--pruef <bild.png>]
import bpy, sys, os
import numpy as np

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
opt = {}
k = 2
while k < len(argv): opt[argv[k].lstrip('-')] = argv[k + 1]; k += 2
ZLO, ZHI = (float(v) for v in opt.get('hoehe', '0.27,0.84').split(','))
DARK, SAT = float(opt.get('dunkel', 0.32)), float(opt.get('saettigung', 0.35))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
# nur das Netz der Figur (mit Skelett), nicht die Hilfskugel, die Meshy mitliefert
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and (o.find_armature() or any(m.type == 'ARMATURE' for m in o.modifiers))]
meshes = meshes or [o for o in bpy.context.scene.objects if o.type == 'MESH']
# Bild der Grundfarbe: aus dem Modell oder vorgegeben (gleiche UV-Abwicklung)
img = None
for o in meshes:
    for m in o.data.materials:
        if m and m.use_nodes:
            for nd in m.node_tree.nodes:
                if nd.type == 'TEX_IMAGE' and nd.image and any(l.to_socket.name == 'Base Color' for l in nd.outputs[0].links): img = nd.image
if opt.get('textur'): img = bpy.data.images.load(opt['textur'])
W, H = img.size
tex = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)   # Zeile 0 unten

# Körperhöhe in der Grundhaltung (ohne Bewegung): Ecken der Netze in Weltlage
zs = np.concatenate([np.array([(o.matrix_world @ v.co).z for v in o.data.vertices]) for o in meshes])
z0, z1 = zs.min(), zs.max()
mask = np.zeros((H, W), bool)
legs = np.zeros((H, W), bool)
n = 0
for o in meshes:
    me = o.data
    uv = me.uv_layers.active.data
    co = [o.matrix_world @ v.co for v in me.vertices]
    for p in me.polygons:
        zc = sum(co[i].z for i in p.vertices) / len(p.vertices)
        f = (zc - z0) / (z1 - z0)
        inband = ZLO <= f <= ZHI
        # Flächen unterhalb (Beinlinge) teilen sich manchmal Bildpunkte mit dem Wams: die bleiben dunkel
        if not inband and not (f < ZLO and f > 0.06): continue
        target = mask if inband else legs
        pts = np.array([uv[li].uv[:] for li in p.loop_indices]) * [W, H]
        for t in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[t], pts[t + 1]
            x0, x1 = int(max(0, np.floor(min(a[0], b[0], c[0])) - 1)), int(min(W - 1, np.ceil(max(a[0], b[0], c[0])) + 1))
            y0, y1 = int(max(0, np.floor(min(a[1], b[1], c[1])) - 1)), int(min(H - 1, np.ceil(max(a[1], b[1], c[1])) + 1))
            if x1 < x0 or y1 < y0: continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9: continue
            l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
            l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
            inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
            target[y0:y1 + 1, x0:x1 + 1] |= inside
        n += inband
rgb = tex[..., :3]
mx, mn = rgb.max(-1), rgb.min(-1)
sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
print(f'Wams und Beine teilen sich {(mask & legs).sum() / max(1, mask.sum()) * 100:.1f} % der Wams-Bildpunkte')
wool = mask & ~legs & (mx < DARK) & (sat < SAT)
# Cyan mit der Helligkeit der Wolle: dunkle Falten bleiben dunkler, die Fläche wird mittelhell
lum = rgb.mean(-1)
ref = np.median(lum[wool]) if wool.any() else 0.1
v = np.clip(0.62 * (lum / max(ref, 1e-3)) ** 0.7, 0.18, 0.95)
cyan = np.array([0.0, 0.58, 0.72], np.float32)
rgb[wool] = (cyan[None, :] * v[wool][:, None] / 0.72 * 0.85)
tex[..., :3] = np.clip(rgb, 0, 1)
outimg = bpy.data.images.new('wams', W, H, alpha=True)
outimg.pixels[:] = tex.ravel()
outimg.filepath_raw = out; outimg.file_format = 'PNG'; outimg.save()
print(f'Flächen {n}, Wams {wool.sum()} Bildpunkte ({wool.mean() * 100:.1f} %), geschrieben {out}')
if opt.get('pruef'):
    pr = np.zeros((H, W, 4), np.float32); pr[..., 3] = 1
    pr[mask] = (0.3, 0.3, 0.3, 1); pr[wool] = (0, 0.8, 1, 1)
    pi = bpy.data.images.new('pruef', W, H, alpha=True); pi.pixels[:] = pr.ravel()
    pi.filepath_raw = opt['pruef']; pi.file_format = 'PNG'; pi.save()
