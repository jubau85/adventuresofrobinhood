# Baut ein Pferd in Blender (Körper aus einem Skelett mit Hautmodifikator, Knochen, Gewichte) und
# berechnet seine Gangarten. Ergebnis ist eine GLB-Datei, die tools/sprites.py in Sprite-Bögen rendert.
#
#   /opt/blender-venv/bin/python tools/pferd.py <ziel.glb> [--art pferd|ross] [--meshy <pferd_meshy.glb>]
#
# --meshy: statt des selbst gebauten Körpers das bemalte Meshy-Pferd (tools/meshy_pferd.py). Es wird ausgerichtet
# (Kopf nach -y, Rücken 1,5 m hoch, Hufe mittig um y = 0,05), die Hufe, Bauch, Rücken, Genick, Maul und Schweif werden
# im Netz gesucht, das Skelett danach gesetzt und das Netz automatisch gewichtet. Das braune Fell wird in der Textur
# cyan (pferd, das Spiel färbt es) oder dunkel (ross); Mähne, Schweif, Beine und Hufe bleiben. Sattel, Decke und
# Schabracke sitzen auf dem gefundenen Rücken.
#
# pferd: Fell in Cyan (das Spiel färbt es je Pferd ein: Braun, Schimmel, Rappe), Sattel und Decke fest.
# ross:  Rappe mit Schabracke in Cyan (das Spiel färbt sie in die Wappenfarbe des Reiters).
#
# Bewegungen (24 Bilder je Sekunde, Hufe stehen während der Stützphase fest auf dem Boden):
#   stehen  4 s  Gewicht verlagern, Kopf heben und senken, Schweif schlagen
#   schritt 1 s  Viertakt: links hinten, links vorn, rechts hinten, rechts vorn
#   galopp  0,6 s Dreitakt im Linksgalopp mit Schwebephase, der Rumpf schaukelt
#   grasen  3 s  Kopf am Boden, kauen
# Das Pferd schaut nach -y (wie die Meshy-Figuren), Ursprung am Boden unter der Rumpfmitte.

import bpy, bmesh, sys, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = argv[0]
ART = argv[argv.index('--art') + 1] if '--art' in argv else 'pferd'
MESHY = argv[argv.index('--meshy') + 1] if '--meshy' in argv else None
FPS = 24

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS


def mat(name, rgb, rough=0.75):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


CYAN = (0.05, 0.62, 0.68)
FELL = mat('fell', CYAN if ART == 'pferd' else (0.045, 0.04, 0.038), 0.6)
HAAR = mat('haar', (0.035, 0.025, 0.02), 0.9)
HUF = mat('huf', (0.09, 0.075, 0.065), 0.5)
LEDER = mat('leder', (0.30, 0.16, 0.07), 0.55)
DECKE = mat('decke', (0.42, 0.07, 0.05), 0.85)
STOFF = mat('schabracke', CYAN, 0.85)
METALL = mat('metall', (0.55, 0.55, 0.58), 0.3)


def link(o):
    sc.collection.objects.link(o)
    return o


def skin_object(name, nodes, edges, material, levels=2):
    """Körper aus Knoten (Punkt, Radius) und Kanten, mit Hautmodifikator und Glättung."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([p for p, _ in nodes], edges, [])
    o = link(bpy.data.objects.new(name, me))
    mod = o.modifiers.new('haut', 'SKIN')
    mod.branch_smoothing = 0.6
    if not me.skin_vertices: me.skin_vertices.new()
    sv = me.skin_vertices[0].data
    for i, (_, r) in enumerate(nodes):
        sv[i].radius = (r, r) if not isinstance(r, tuple) else r
    sv[0].use_root = True
    sub = o.modifiers.new('glatt', 'SUBSURF'); sub.levels = levels; sub.render_levels = levels
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(material)
    return o


# ---------------------------------------------------------------- Körper
X = 0.17  # Abstand der Beine von der Mitte
V = lambda *a: Vector(a)
# Gelenke und Merkpunkte des selbst gebauten Pferdes (linke Seite; rechts gespiegelt)
PT = dict(sh=V(X, -0.45, 1.05), knee=V(X, -0.5, 0.52), hoof_v=V(X, -0.53, 0.0), hip=V(X, 0.55, 1.08), stifle=V(X, 0.42, 0.78),
          hock=V(X, 0.66, 0.5), hoof_h=V(X, 0.63, 0.0), body_h=V(0, 0.62, 1.2), body_v=V(0, -0.45, 1.2), neck0=V(0, -0.62, 1.33),
          poll=V(0, -1.06, 1.78), muzzle=V(0, -1.38, 1.4), tail0=V(0, 0.86, 1.3), tail1=V(0, 1.03, 1.0), tail2=V(0, 1.07, 0.58),
          seat=V(0, 0.0, 1.55), headmid=V(0, -1.2, 1.62))
TACK = dict(dz=0.0, w=1.0, head=V(0, 0, 0))


def meshy_body(path):
    """Meshy-Pferd laden, ausrichten und seine Merkpunkte im Netz suchen."""
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in sc.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in meshes:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.data.transform(o.matrix_world); o.matrix_world = Matrix()
    for o in new:
        if o not in meshes: bpy.data.objects.remove(o, do_unlink=True)
    if len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes: o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]; bpy.ops.object.join()
    body = meshes[0]; body.name = 'pferd'
    co = lambda: np.array([v.co[:] for v in body.data.vertices])
    c = co(); ext = c.max(0) - c.min(0)
    # Länge entlang y, Kopf (das höhere Ende) nach -y
    if ext[0] > ext[1]: body.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z')); c = co()
    y0, y1 = c[:, 1].min(), c[:, 1].max(); L3 = (y1 - y0) / 3
    if c[c[:, 1] > y1 - L3, 2].max() > c[c[:, 1] < y0 + L3, 2].max(): body.data.transform(Matrix.Rotation(math.radians(180), 4, 'Z')); c = co()
    body.data.transform(Matrix.Translation((-(c[:, 0].min() + c[:, 0].max()) / 2, 0, -c[:, 2].min()))); c = co()
    body.data.transform(Matrix.Scale(1 / c[:, 2].max(), 4)); c = co()
    def hooves(c):
        low = c[c[:, 2] < 0.03]
        ys = np.sort(low[:, 1]); gap = np.argmax(np.diff(ys)); split = (ys[gap] + ys[gap + 1]) / 2
        out = {}
        for k, sel in (('v', low[:, 1] < split), ('h', low[:, 1] >= split)):
            g = low[sel]
            out[k] = (np.abs(g[:, 0]).mean(), g[:, 1].mean())
        return out
    hv = hooves(c); mid = (hv['v'][1] + hv['h'][1]) / 2
    near = lambda c, y, dy, dx: c[(np.abs(c[:, 1] - y) < dy) & (np.abs(c[:, 0]) < dx)]
    back = near(c, mid, 0.03, 0.04)[:, 2].max()
    body.data.transform(Matrix.Scale(1.5 / back, 4)); c = co()
    hv = hooves(c); mid = (hv['v'][1] + hv['h'][1]) / 2
    body.data.transform(Matrix.Translation((0, 0.05 - mid, 0))); c = co()
    hv = hooves(c); mid = 0.05
    (xf, yf), (xh, yh) = hv['v'], hv['h']
    belly = near(c, mid, 0.08, 0.06)[:, 2].min(); back = near(c, mid, 0.05, 0.05)[:, 2].max()
    kl = belly / 0.78; bz = (belly + back) / 2
    head = c[c[:, 1] < yf - 0.3]
    top = head[np.argmax(head[:, 2])]
    mz = head[head[:, 1] < head[:, 1].min() + 0.05]
    muzzle = V(0, head[:, 1].min() + 0.03, mz[:, 2].mean())
    poll = V(0, top[1] + 0.03, top[2] - 0.14)
    rump = c[(c[:, 1] > yh) & (c[:, 2] > back - 0.25)]
    r0 = rump[np.argmax(rump[:, 1])]
    tl = c[(c[:, 1] > yh + 0.12) & (np.abs(c[:, 0]) < 0.12)]
    tip = tl[np.argmin(tl[:, 2])]
    t0 = V(0, r0[1] - 0.03, r0[2] - 0.03); t2 = V(0, tip[1], max(tip[2], 0.3))
    seat_back = near(c, -0.05, 0.04, 0.05)[:, 2].max()
    barrel = c[(np.abs(c[:, 1] - mid) < 0.1) & (c[:, 2] > belly) & (c[:, 2] < back)]
    pt = dict(sh=V(xf, yf + 0.08, 1.05 * kl), knee=V(xf, yf + 0.03, 0.52 * kl), hoof_v=V(xf, yf, 0.0),
              hip=V(xh, yh - 0.08, 1.08 * kl), stifle=V(xh, yh - 0.21, 0.78 * kl), hock=V(xh, yh + 0.03, 0.5 * kl), hoof_h=V(xh, yh, 0.0),
              body_h=V(0, yh - 0.01, bz), body_v=V(0, yf + 0.08, bz), neck0=V(0, yf - 0.09, bz + 0.13), poll=poll, muzzle=muzzle,
              tail0=t0, tail1=V(0, (t0.y + t2.y) / 2 + 0.04, (t0.z + t2.z) / 2), tail2=t2, seat=V(0, -0.05, seat_back + 0.04),
              headmid=V(0, (poll.y + muzzle.y) / 2, (poll.z + muzzle.z) / 2 + 0.02))
    tack = dict(dz=near(c, -0.08, 0.04, 0.05)[:, 2].max() - 1.53, w=np.abs(barrel[:, 0]).max() / 0.37,
                head=pt['headmid'] - V(0, -1.2, 1.62))
    print('Meshy-Pferd: Hufe vorn', round(xf, 3), round(yf, 3), 'hinten', round(xh, 3), round(yh, 3), 'Bauch', round(belly, 3), 'Rücken', round(back, 3),
          'Genick', tuple(round(v, 2) for v in poll), 'Maul', tuple(round(v, 2) for v in muzzle), 'Schweif', tuple(round(v, 2) for v in t0), tuple(round(v, 2) for v in t2))
    for p in body.data.polygons: p.use_smooth = True
    return body, pt, tack


def uv_mask(body, W, H, pick):
    """Bildpunkte der Textur, die zu Flächen gehören, deren Mitte pick(Mitte) erfüllt."""
    mask = np.zeros((H, W), bool)
    me = body.data; uv = me.uv_layers.active.data
    for p in me.polygons:
        if not pick(p.center): continue
        pts = np.array([uv[li].uv[:] for li in p.loop_indices]) * [W, H]
        for t in range(1, len(pts) - 1):
            a, b, c = pts[0], pts[t], pts[t + 1]
            x0, x1 = int(max(0, min(a[0], b[0], c[0]) - 1)), int(min(W - 1, max(a[0], b[0], c[0]) + 1))
            y0, y1 = int(max(0, min(a[1], b[1], c[1]) - 1)), int(min(H - 1, max(a[1], b[1], c[1]) + 1))
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if x1 < x0 or y1 < y0 or abs(d) < 1e-9: continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
            l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
            mask[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
    return mask


def recolor_coat(body, dark, cloth=None):
    """Braunes Fell in der Textur cyan (das Spiel färbt es ein) oder dunkel (Rappe); Schwarzes und Helles bleibt.
    cloth: beim Schlachtross die Flächen unter der Decke (Rumpf ohne Hals und Beine), dort wird alles zu cyanfarbenem
    Tuch in der Helligkeit des Fells."""
    for m in body.data.materials:
        if not (m and m.use_nodes): continue
        for nd in m.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image and any(l.to_socket.name == 'Base Color' for l in nd.outputs[0].links):
                im = nd.image; W, H = im.size
                px = np.array(im.pixels[:], np.float32).reshape(H, W, 4); rgb = px[..., :3]
                mx, mn = rgb.max(-1), rgb.min(-1); d = np.maximum(mx - mn, 1e-4)
                hue = np.where(mx == rgb[..., 0], ((rgb[..., 1] - rgb[..., 2]) / d * 60) % 360, np.where(mx == rgb[..., 1], (rgb[..., 2] - rgb[..., 0]) / d * 60 + 120, (rgb[..., 0] - rgb[..., 1]) / d * 60 + 240))
                sat = (mx - mn) / np.maximum(mx, 1e-4)
                coat = (mx > 0.16) & (sat > 0.22) & (hue > 8) & (hue < 52)
                lum = rgb.mean(-1); ref = np.median(lum[coat]) if coat.any() else 0.3
                v = np.clip((lum / max(ref, 1e-3)) ** 0.8, 0.25, 1.8)
                tgt = np.array([0.03, 0.035, 0.04]) * 1.6 if dark else np.array([0.05, 0.62, 0.68]) * 0.85
                rgb[coat] = np.clip(tgt[None, :] * v[coat][:, None], 0, 1)
                if cloth:
                    under = uv_mask(body, W, H, cloth) & (mx > 0.12)   # Mähne und Schweif bleiben schwarz
                    tuch = np.array([0.05, 0.62, 0.68]) * 0.8
                    vv = np.clip((lum / max(ref, 1e-3)) ** 0.5, 0.55, 1.3)
                    rgb[under] = np.clip(tuch[None, :] * vv[under][:, None], 0, 1)
                    print('Decke auf dem Rumpf', round(under.mean() * 100, 1), '% der Bildpunkte')
                px[..., :3] = rgb
                new = bpy.data.images.new(im.name + '_fell', W, H, alpha=True); new.pixels[:] = px.ravel(); new.pack()
                nd.image = new
                print('Fell umgefärbt', round(coat.mean() * 100, 1), '% der Bildpunkte')


if MESHY:
    body, PT, TACK = meshy_body(MESHY)
    # Schlachtross: Decke über dem Rumpf zwischen Brust und Kruppe, oberhalb des Bauchs
    belly = PT['knee'].z / 0.52 * 0.78
    cloth = (lambda c: PT['body_v'].y - 0.12 < c.y < PT['tail0'].y - 0.02 and c.z > belly - 0.04) if ART != 'pferd' else None
    recolor_coat(body, ART != 'pferd', cloth)
    mane = tail = None; ears = []
else:
    spine = [
        ((0, 0.86, 1.3), 0.17),    # 0 Schweifansatz
        ((0, 0.6, 1.24), 0.35),    # 1 Kruppe
        ((0, 0.08, 1.15), 0.37),   # 2 Bauch
        ((0, -0.42, 1.18), 0.36),  # 3 Brust
        ((0, -0.64, 1.34), 0.29),  # 4 Halsansatz
        ((0, -0.86, 1.56), 0.21),  # 5 Hals
        ((0, -1.06, 1.76), 0.14),  # 6 Genick
        ((0, -1.22, 1.6), 0.13),   # 7 Kopf
        ((0, -1.37, 1.42), 0.1),   # 8 Maul
    ]
    legs = []
    def leg(pts, root):
        i0 = len(spine) + sum(len(l[0]) for l in legs)
        legs.append((pts, root, i0))
    for sx in (X, -X):
        leg([((sx, -0.45, 1.05), 0.165), ((sx, -0.48, 0.8), 0.11), ((sx, -0.5, 0.52), 0.075), ((sx, -0.51, 0.14), 0.052), ((sx, -0.53, 0.025), 0.066)], 3)
        leg([((sx, 0.55, 1.1), 0.21), ((sx, 0.42, 0.78), 0.14), ((sx, 0.66, 0.5), 0.072), ((sx, 0.65, 0.14), 0.052), ((sx, 0.63, 0.025), 0.066)], 1)
    nodes = list(spine)
    edges = [(i, i + 1) for i in range(len(spine) - 1)]
    for pts, root, i0 in legs:
        nodes += pts
        edges.append((root, i0))
        edges += [(i0 + k, i0 + k + 1) for k in range(len(pts) - 1)]
    body = skin_object('pferd', nodes, edges, FELL)
    # Hufe dunkel: Flächen nahe am Boden
    body.data.materials.append(HUF)
    for p in body.data.polygons:
        if p.center.z < 0.075: p.material_index = 1

    # Mähne, Schopf, Schweif, Ohren
    mane = skin_object('maehne', [((0, -0.55, 1.56), 0.05), ((0, -0.76, 1.72), 0.06), ((0, -0.95, 1.88), 0.055), ((0, -1.08, 1.93), 0.045), ((0, -1.17, 1.84), 0.04)],
                       [(0, 1), (1, 2), (2, 3), (3, 4)], HAAR)
    tail = skin_object('schweif', [((0, 0.88, 1.3), 0.07), ((0, 0.99, 1.12), 0.08), ((0, 1.05, 0.9), 0.095), ((0, 1.07, 0.66), 0.07), ((0, 1.06, 0.55), 0.03)],
                       [(0, 1), (1, 2), (2, 3), (3, 4)], HAAR)
    ears = []
    for sx in (0.055, -0.055):
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.035, radius2=0.004, depth=0.13, location=(sx, -1.04, 1.92), rotation=(math.radians(-25), math.radians(10 if sx > 0 else -10), 0))
        e = bpy.context.active_object; e.data.materials.append(FELL); ears.append(e)

# Sattel und Decke (Reitpferd) oder Schabracke (Schlachtross)
rigid = []
def ellipsoid(name, loc, scale, material, segs=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=12, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons: p.use_smooth = True
    o.data.materials.append(material); rigid.append(o)
    return o
ellipsoid('sattel', (0, -0.08, 1.49), (0.2, 0.26, 0.075), LEDER)
ellipsoid('knauf', (0, -0.3, 1.55), (0.07, 0.05, 0.06), LEDER, 12)
if ART == 'pferd':
    ellipsoid('decke', (0, -0.05, 1.44), (0.33, 0.33, 0.06), DECKE)
    # Steigbügel am Riemen
    for sx in (0.34, -0.34):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.012, depth=0.36, location=(sx, -0.1, 1.27))
        r = bpy.context.active_object; r.data.materials.append(LEDER); rigid.append(r)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.04, minor_radius=0.01, location=(sx, -0.1, 1.07), rotation=(0, math.radians(90), 0))
        r = bpy.context.active_object; r.data.materials.append(METALL); rigid.append(r)
else:
    # Schabracke: Rumpf umhüllt, seitlich bis zum Knie herabhängend
    if not MESHY:
        cover = skin_object('schabracke_ruecken', [((0, 0.72, 1.25), 0.3), ((0, 0.1, 1.18), 0.4), ((0, -0.45, 1.2), 0.385), ((0, -0.62, 1.32), 0.29)],
                            [(0, 1), (1, 2), (2, 3)], STOFF, 1)
        rigid.append(cover)
    bm = bmesh.new()
    n = 28
    for k in range(n):
        a = 2 * math.pi * k / n
        x, y = math.cos(a) * 0.43, 0.08 + math.sin(a) * 0.78
        # vorn zwischen den Beinen und hinten unter dem Schweif kürzer
        low = 0.62 if abs(math.sin(a)) < 0.75 else 0.88
        bm.verts.new((x, y, 1.18)); bm.verts.new((x, y, low))
    bm.verts.ensure_lookup_table()
    for k in range(n):
        a0, b0 = bm.verts[2 * k], bm.verts[2 * k + 1]
        a1, b1 = bm.verts[2 * ((k + 1) % n)], bm.verts[2 * ((k + 1) % n) + 1]
        bm.faces.new((a0, a1, b1, b0))
    me = bpy.data.meshes.new('schabracke'); bm.to_mesh(me); bm.free()
    skirt = link(bpy.data.objects.new('schabracke', me))
    sol = skirt.modifiers.new('dicke', 'SOLIDIFY'); sol.thickness = 0.02
    bpy.context.view_layer.objects.active = skirt; bpy.ops.object.modifier_apply(modifier='dicke')
    for p in skirt.data.polygons: p.use_smooth = True
    skirt.data.materials.append(STOFF); rigid.append(skirt)
    # Kopfschutz aus Stoff (beim Meshy-Pferd nicht: dort sitzt die Decke in der Bemalung)
    if not MESHY: ellipsoid('kopfdecke', (0, -1.17, 1.67), (0.145, 0.2, 0.13), STOFF, 16)

# Beim Meshy-Pferd: Sattelzeug auf die Höhe des gefundenen Rückens, Schabracke so breit wie der Rumpf, Kopfdecke
# auf den Kopf
if MESHY:
    for o in rigid:
        if o.name.startswith('kopfdecke'): o.data.transform(Matrix.Translation(TACK['head'])); continue
        o.data.transform(Matrix.Translation((0, 0, TACK['dz'])) @ Matrix.Diagonal((TACK['w'], 1, 1, 1)))

# ---------------------------------------------------------------- Skelett
arm_data = bpy.data.armatures.new('skelett')
arm = link(bpy.data.objects.new('skelett', arm_data))
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, head, tail, parent=None, connect=False, deform=True):
    b = eb.new(name); b.head = head; b.tail = tail
    if parent: b.parent = eb[parent]; b.use_connect = connect
    b.use_deform = deform
    return b
side_pt = lambda k, sgn: Vector((PT[k].x * sgn, PT[k].y, PT[k].z))
bone('koerper', PT['body_h'], PT['body_v'])
bone('hals', PT['neck0'], PT['poll'], 'koerper')
bone('kopf', PT['poll'], PT['muzzle'], 'hals', True)
bone('schweif1', PT['tail0'], PT['tail1'], 'koerper')
bone('schweif2', PT['tail1'], PT['tail2'], 'schweif1', True)
for side, sgn in (('l', 1), ('r', -1)):
    bone(f'v{side}_ober', side_pt('sh', sgn), side_pt('knee', sgn), 'koerper')
    bone(f'v{side}_unter', side_pt('knee', sgn), side_pt('hoof_v', sgn), f'v{side}_ober', True)
    bone(f'h{side}_ober', side_pt('hip', sgn), side_pt('stifle', sgn), 'koerper')
    bone(f'h{side}_mitte', side_pt('stifle', sgn), side_pt('hock', sgn), f'h{side}_ober', True)
    bone(f'h{side}_unter', side_pt('hock', sgn), side_pt('hoof_h', sgn), f'h{side}_mitte', True)
# Sitz: tiefster Punkt des Sattels, etwas hinter der Mitte; Kopfmitte für die Verdeckung des Reiters von vorn
bone('sattel', PT['seat'], PT['seat'] + Vector((0, 0, 0.15)), 'koerper', deform=False)
bone('kopfmitte', PT['headmid'], PT['headmid'] + Vector((0, 0, 0.1)), 'kopf', deform=False)
bpy.ops.object.mode_set(mode='OBJECT')

# Gewichte: Körper, Mähne, Schweif, Ohren automatisch; Sattel und Schabracke fest am Rumpf
def parent_auto(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
def weights_via_proxy(obj, voxel=0.02):
    """Meshy-Netze sind an den Nähten offen, daran scheitert die automatische Gewichtung. Darum eine geschlossene
    Hilfsform aus Voxeln gewichten und die Gewichte von dort auf das Netz übertragen."""
    proxy = obj.copy(); proxy.data = obj.data.copy(); proxy.name = 'gewichtsform'; link(proxy)
    for g in list(proxy.vertex_groups): proxy.vertex_groups.remove(g)
    bpy.ops.object.select_all(action='DESELECT'); proxy.select_set(True); bpy.context.view_layer.objects.active = proxy
    rm = proxy.modifiers.new('voxel', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier='voxel')
    parent_auto([proxy])
    for g in proxy.vertex_groups:
        if not obj.vertex_groups.get(g.name): obj.vertex_groups.new(name=g.name)
    dt = obj.modifiers.new('gewichte', 'DATA_TRANSFER'); dt.object = proxy
    dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier='gewichte')
    bpy.data.objects.remove(proxy, do_unlink=True)
    obj.parent = arm
    m = obj.modifiers.new('skelett', 'ARMATURE'); m.object = arm

if MESHY: weights_via_proxy(body)
else: parent_auto([body])
if mane: parent_auto([mane, tail])
if MESHY:
    # Ecken ohne Gewicht (die automatische Gewichtung findet nicht immer für jeden Knochen eine Lösung): an den nächsten Knochen
    vgs = {g.index: g.name for g in body.vertex_groups}
    segs = [(b.name, b.head_local, b.tail_local) for b in arm_data.bones if b.use_deform]
    def nearest(p):
        best, bd = None, 1e9
        for n, a, b in segs:
            ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared)); d = (a + ab * t - p).length
            if d < bd: best, bd = n, d
        return best
    lost = [v for v in body.data.vertices if sum(g.weight for g in v.groups) < 1e-4]
    for v in lost:
        n = nearest(v.co); g = body.vertex_groups.get(n) or body.vertex_groups.new(name=n); g.add([v.index], 1.0, 'REPLACE')
    print('Ecken ohne Gewicht nachgetragen:', len(lost), 'von', len(body.data.vertices))
for o in ears + rigid:
    bone_name = 'kopf' if o in ears or o.name.startswith('kopfdecke') else 'koerper'
    vg = o.vertex_groups.new(name=bone_name); vg.add(range(len(o.data.vertices)), 1.0, 'REPLACE')
    o.parent = arm
    m = o.modifiers.new('skelett', 'ARMATURE'); m.object = arm

# ---------------------------------------------------------------- Bewegungen
pb = arm.pose.bones
for p in pb: p.rotation_mode = 'QUATERNION'
REST = {b.name: b.matrix_local.copy() for b in arm_data.bones}

def aim(name, head, target):
    """Knochen so drehen, dass er von head nach target zeigt (Armaturraum = Welt)."""
    rest = REST[name]
    rdir = rest.to_3x3() @ Vector((0, 1, 0))
    q = rdir.rotation_difference((target - head).normalized())
    m = (q.to_matrix() @ rest.to_3x3()).to_4x4()
    m.translation = head
    pb[name].matrix = m
    bpy.context.view_layer.update()

def two_bone(a, b, root, goal, l1, l2, bend):
    """Zwei Knochen von root zu goal; bend: Richtung, in die das Gelenk ausweicht (in der y-z-Ebene)."""
    d = goal - root
    dist = min(d.length, l1 + l2 - 1e-4)
    dn = d.normalized()
    goal = root + dn * dist
    x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
    h = math.sqrt(max(0.0, l1 * l1 - x * x))
    perp = (bend - dn * bend.dot(dn)).normalized()
    joint = root + dn * x + perp * h
    aim(a, root, joint)
    aim(b, joint, goal)
    return joint

L = {}
for side in ('l', 'r'):
    L[f'v{side}'] = ((PT['knee'] - PT['sh']).length, (PT['hoof_v'] - PT['knee']).length)
    L[f'h{side}'] = ((PT['stifle'] - PT['hip']).length, (PT['hock'] - PT['stifle']).length, (PT['hoof_h'] - PT['hock']).length)
HOOF0 = {'vl': side_pt('hoof_v', 1), 'vr': side_pt('hoof_v', -1), 'hl': side_pt('hoof_h', 1), 'hr': side_pt('hoof_h', -1)}
BODY_REST = REST['koerper']

def smooth(t): return t * t * (3 - 2 * t)

def hoof_path(p, beta, stride, lift, base, fold=0.0):
    """Huf relativ zum Rumpf: Stützphase gleitet nach hinten, Schwungphase hebt an und schwingt vor."""
    if p < beta:
        s = p / beta
        return base + Vector((0, -stride / 2 + stride * s, 0))
    q = (p - beta) / (1 - beta)
    y = stride / 2 - stride * smooth(q)
    z = lift * math.sin(math.pi * q) ** 0.9
    return base + Vector((0, y + fold * math.sin(math.pi * q), z))

def pose_frame(body_dz=0.0, body_pitch=0.0, body_roll=0.0, neck=0.0, head=0.0, tail=(0.0, 0.0), hooves=None, hind_tip=None):
    """Eine Haltung setzen. Winkel in Grad, positive Nickbewegung hebt die Front."""
    # Rumpf
    R = Matrix.Rotation(math.radians(body_pitch), 4, 'X') @ Matrix.Rotation(math.radians(body_roll), 4, 'Y')
    pivot = Vector((0, (PT['body_h'].y + PT['body_v'].y) / 2, PT['body_v'].z))
    M = Matrix.Translation(pivot + Vector((0, 0, body_dz))) @ R @ Matrix.Translation(-pivot) @ BODY_REST
    pb['koerper'].matrix = M
    bpy.context.view_layer.update()
    # positive Winkel senken Hals und Kopf
    pb['hals'].rotation_quaternion = Quaternion((1, 0, 0), math.radians(neck))
    pb['kopf'].rotation_quaternion = Quaternion((1, 0, 0), math.radians(head))
    pb['schweif1'].rotation_quaternion = Quaternion((0, 0, 1), math.radians(tail[0])) @ Quaternion((1, 0, 0), math.radians(tail[1]))
    pb['schweif2'].rotation_quaternion = Quaternion((0, 0, 1), math.radians(tail[0] * 0.8))
    bpy.context.view_layer.update()
    body_m = pb['koerper'].matrix @ BODY_REST.inverted()
    for side in ('l', 'r'):
        # Vorderbein: Schulter -> Knie -> Huf, Knie weicht nach vorn aus
        sh = body_m @ REST[f'v{side}_ober'].translation
        goal = hooves[f'v{side}']
        two_bone(f'v{side}_ober', f'v{side}_unter', sh, goal, *L[f'v{side}'], Vector((0, -1, 0.15)))
        # Hinterbein: Röhre (Sprunggelenk -> Huf) steht fast senkrecht, Hüfte -> Knie -> Sprunggelenk
        hip = body_m @ REST[f'h{side}_ober'].translation
        hg = hooves[f'h{side}']
        lift = max(0.0, hg.z) / 0.35
        tilt = (hind_tip or {}).get(f'h{side}', 0.0)
        cannon_dir = Vector((0, 0.06 + 0.55 * lift + tilt, 1)).normalized()
        hock = hg + cannon_dir * L[f'h{side}'][2]
        two_bone(f'h{side}_ober', f'h{side}_mitte', hip, hock, L[f'h{side}'][0], L[f'h{side}'][1], Vector((0, -1, 0)))
        aim(f'h{side}_unter', hock, hg)

def key_all(frame):
    for p in pb:
        p.keyframe_insert('rotation_quaternion', frame=frame)
        p.keyframe_insert('location', frame=frame)

def new_action(name):
    act = bpy.data.actions.new(name)
    arm.animation_data_create(); arm.animation_data.action = act
    return act

def reset():
    for p in pb: p.rotation_quaternion = (1, 0, 0, 0); p.location = (0, 0, 0)
    bpy.context.view_layer.update()

STRIDE_WALK, STRIDE_GALLOP = 0.5, 0.62

def walk_action():
    new_action('schritt')
    T = 24
    phase = {'hl': 0.0, 'vl': 0.25, 'hr': 0.5, 'vr': 0.75}
    for f in range(T + 1):
        t = f / T
        reset()
        hooves = {k: hoof_path((t - ph) % 1.0, 0.62, STRIDE_WALK, 0.13 if k[0] == 'v' else 0.1, HOOF0[k]) for k, ph in phase.items()}
        nod = math.sin(4 * math.pi * t)
        pose_frame(body_dz=-0.012 * abs(math.sin(2 * math.pi * t)), body_roll=1.2 * math.sin(2 * math.pi * t), neck=3 + 3.5 * nod, head=1.5 * nod,
                   tail=(6 * math.sin(2 * math.pi * t), 4), hooves=hooves)
        key_all(f)

def gallop_action():
    new_action('galopp')
    T = 15
    # Linksgalopp: rechts hinten, dann links hinten + rechts vorn, dann links vorn, danach Schwebephase
    phase = {'hr': 0.0, 'hl': 0.12, 'vr': 0.17, 'vl': 0.3}
    for f in range(T + 1):
        t = f / T
        reset()
        hooves = {}
        for k, ph in phase.items():
            p = (t - ph) % 1.0
            hooves[k] = hoof_path(p, 0.4, STRIDE_GALLOP, 0.3 if k[0] == 'v' else 0.22, HOOF0[k], fold=0.1 if k[0] == 'v' else -0.05)
        rock = math.sin(2 * math.pi * (t - 0.1))
        pose_frame(body_dz=0.05 * math.sin(2 * math.pi * (t - 0.35)) - 0.02, body_pitch=6 * rock, neck=8 + 9 * rock, head=-4 * rock,
                   tail=(4 * math.sin(2 * math.pi * t), 22 + 6 * rock), hooves=hooves)
        key_all(f)

def idle_action():
    new_action('stehen')
    T = 96
    for f in range(T + 1):
        t = f / T
        reset()
        hooves = dict(HOOF0)
        # rechtes Hinterbein entlastet: Huf auf der Spitze, etwas vorgestellt
        rest_leg = 0.5 - 0.5 * math.cos(2 * math.pi * t)
        hooves['hr'] = HOOF0['hr'] + Vector((0, -0.06 * rest_leg, 0.035 * rest_leg))
        swish = math.sin(2 * math.pi * 3 * t) * (0.5 + 0.5 * math.sin(2 * math.pi * t))
        pose_frame(body_dz=-0.01 * rest_leg, body_roll=-1.5 * rest_leg, neck=2 + 7 * math.sin(2 * math.pi * t), head=3 * math.sin(2 * math.pi * 2 * t),
                   tail=(18 * swish, 6), hooves=hooves, hind_tip={'hr': 0.35 * rest_leg})
        key_all(f)

def graze_action():
    new_action('grasen')
    T = 72
    for f in range(T + 1):
        t = f / T
        reset()
        chew = math.sin(2 * math.pi * 4 * t)
        hooves = dict(HOOF0)
        hooves['vl'] = HOOF0['vl'] + Vector((0, -0.12, 0))
        pose_frame(body_pitch=-2.5, neck=62 + 2 * chew, head=22 + 3 * chew, tail=(10 * math.sin(2 * math.pi * 2 * t), 4), hooves=hooves)
        key_all(f)

idle_action(); walk_action(); gallop_action()
if ART == 'pferd': graze_action()
reset()
arm.animation_data.action = None

# Prüfen: Hufe in der Stützphase auf dem Boden?
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_frame_range=False, export_apply=False)
print('geschrieben', OUT)
