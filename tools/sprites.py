# Rendert eine animierte 3D-Figur (GLB mit Skelett und Bewegungen) zu Sprite-Bögen für die Schrägansicht.
#
# Aufruf (Blender als Python-Modul, siehe README):
#   /opt/blender-venv/bin/python tools/sprites.py <figur.glb> <ausgabe-ordner> [optionen]
# Optionen:
#   --waffe <glb>        Waffe in die rechte Hand setzen
#   --zelle <px>         Größe einer Zelle (Standard 224)
#   --figur <px>         Höhe der Figur in Pixeln (Standard 120, also 8× die 15 px im Spiel)
#   --richtungen <n>     Blickrichtungen (Standard 8)
#   --bilder name=n,...  Bilder je Bewegung, z. B. Idle=4,Casual_Walk=8 (Standard 6, Gehen 8)
#   --nur <name,...>     nur diese Bewegungen
#   --probe              nur ein Bild je Bewegung und Richtung 0, zum schnellen Prüfen
#   --schleife <name,...> diese Bewegungen laufen im Kreis (letztes Bild = erstes, wird nicht doppelt gerendert)
#   --punkt <knochen>    Lage dieses Knochens (Kopf) je Richtung und Bild mitschreiben, z. B. der Sattel für den Reiter
#   --textur <png>       Grundfarbe des Modells durch dieses Bild ersetzen (gleiche UV-Abwicklung, z. B. Meshy-Neubemalung)
#   --reitpose           zusätzliche Haltung „reiten“: Beine gespreizt nach vorn, Hände halten die Zügel
#   --helm <glb>         Helm (Ursprung unten, Gesicht nach -Y) passend über den Kopf setzen, fest am Kopfknochen
#   --punkt <a,b,...>    auch mehrere Knochen, je Name eine Liste
#   --bereich name=a:b,… nur diesen Teil der Bewegung (Anteile 0…1), z. B. die Endhaltung eines Hinsetzens (0.97:1)
#   --stelle <name,...>  diese Bewegungen auf der Stelle halten (Hüfte waagerecht zum Ursprung), auch ohne „walk“ im Namen
#   --meter <m>          Körpergröße, an der sich der Maßstab misst (Standard: Höhe des Modells); mit --figur
#                        zusammen bleibt der Maßstab über Modelle hinweg gleich (Mensch 1,75 m = 120 px)
#
# Ausgabe je Bewegung: <name>.png (Zeilen = Richtungen, Spalten = Bilder) und sprites.json mit Zellgröße,
# Fußpunkt, Bildzahl und Richtungen. Richtung 0 schaut nach links unten (zum Betrachter), jede weitere
# dreht sich um 45° gegen den Uhrzeigersinn, von oben gesehen.

import bpy, sys, json, math, os
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
src, out = argv[0], argv[1]
opt = {}
k = 2
while k < len(argv):
    a = argv[k]
    if a == '--probe': opt['probe'] = True; k += 1; continue
    opt[a.lstrip('-')] = argv[k + 1]; k += 2
CELL = int(opt.get('zelle', 224))
FIG_PX = float(opt.get('figur', 120))
DIRS = int(opt.get('richtungen', 8))
FRAMES = {}
for part in (opt.get('bilder') or '').split(','):
    if '=' in part: n, v = part.split('='); FRAMES[n.strip()] = int(v)
ONLY = set(x.strip() for x in opt['nur'].split(',')) if opt.get('nur') else None
LOOPS = set(x.strip() for x in opt['schleife'].split(',')) if opt.get('schleife') else set()
STELLE = set(x.strip() for x in opt['stelle'].split(',')) if opt.get('stelle') else set()
RANGE = {}
for part in (opt.get('bereich') or '').split(','):
    if '=' in part: n, v = part.split('='); a, b = v.split(':'); RANGE[n.strip()] = (float(a), float(b))
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=src)
arm = next((o for o in sc.objects if o.type == 'ARMATURE'), None)
meshes = [o for o in sc.objects if o.type == 'MESH']
# Hilfsobjekte ohne Bezug zum Skelett (Meshy legt manchmal eine Kugel bei) nicht rendern und nicht messen
if arm:
    for o in meshes:
        if o.parent is not arm and o.find_armature() is not arm: o.hide_render = True
    meshes = [o for o in meshes if not o.hide_render]
# Ohne Skelett: unbewegtes Modell (Figur in Ruhe, Gebäude, Gegenstand), ein Bild je Richtung

# Wurzel: alles unter ein Leerobjekt hängen, das wir drehen und verschieben
root = bpy.data.objects.new('wurzel', None); sc.collection.objects.link(root)
for o in sc.objects:
    if o is not root and o.parent is None: o.parent = root

# Größe aus der Ruhehaltung: Füße auf 0, Höhe messen
def bounds(objs):
    bpy.context.view_layer.update()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    dg = bpy.context.evaluated_depsgraph_get()
    for o in objs:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    return lo, hi
lo, hi = bounds(meshes)
HEIGHT = hi.z - lo.z
root.location.z -= lo.z

# Waffe in die rechte Hand
hand = None
for b in (arm.data.bones if arm else []):
    n = b.name.lower().replace('_', '').replace(':', '')
    if ('righthand' in n or 'handr' in n or n.endswith('rhand')) and 'thumb' not in n and 'index' not in n:
        hand = b.name; break
if opt.get('waffe'):
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=opt['waffe'])
    wobjs = [o for o in sc.objects if o not in before]
    wm = [o for o in wobjs if o.type == 'MESH']
    wroot = bpy.data.objects.new('waffe', None); sc.collection.objects.link(wroot)
    for o in wobjs:
        if o.parent is None: o.parent = wroot
    wlo, whi = bounds(wm)
    size = whi - wlo
    axis = max(range(3), key=lambda i: size[i])
    # Klinge entlang der Längsachse, auf etwa 0,55 × Körpergröße bringen, Griff am Ursprung
    s = HEIGHT * float(opt.get('waffenlaenge', 0.55)) / size[axis]
    wroot.scale = (s, s, s)
    grip = (wlo + whi) / 2; grip[axis] = wlo[axis] + size[axis] * float(opt.get('griff', 0.12))
    for o in wobjs:
        if o.parent is wroot: o.location -= grip
    if hand:
        wroot.parent = arm; wroot.parent_type = 'BONE'; wroot.parent_bone = hand
        rot = [float(x) for x in opt.get('waffendreh', '0,0,0').split(',')]
        wroot.rotation_euler = [math.radians(r) for r in rot]
        # Das Skelett kann einen eigenen Maßstab haben (Meshy: 0,01), die Waffe soll trotzdem echte Größe haben
        asc = arm.matrix_world.to_scale()[0] or 1
        wroot.scale = (s / asc,) * 3
        # Angehängtes sitzt am Knochenende, das bei Händen ohne Finger weit draußen liegen kann:
        # zurück zum Handgelenk, dann ein Stück in die Handfläche
        palm = float(opt.get('handflaeche', 0.08)) / asc
        wroot.location = (0, -arm.data.bones[hand].length + palm, 0)
    meshes += wm

# Andere Bemalung, gleiche Form: Bild der Grundfarbe austauschen
if opt.get('textur'):
    img = bpy.data.images.load(opt['textur'])
    n = 0
    for o in meshes:
        for m in o.data.materials:
            if m and m.use_nodes:
                for nd in m.node_tree.nodes:
                    if nd.type == 'TEX_IMAGE' and nd.image and any(l.to_socket.name == 'Base Color' for l in nd.outputs[0].links):
                        nd.image = img; n += 1
    print('Textur getauscht', n)

# Reithaltung als eigene Bewegung: Oberschenkel nach vorn und etwas nach außen, Unterschenkel hängen,
# Oberarme leicht vor, Unterarme nach vorn zu den Zügeln
if opt.get('reitpose') and arm:
    bpy.context.view_layer.objects.active = arm
    pbs = arm.pose.bones
    act = bpy.data.actions.new('reiten'); arm.animation_data_create(); arm.animation_data.action = act
    for p in pbs: p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = (1, 0, 0, 0); p.location = (0, 0, 0)
    bpy.context.view_layer.update()
    def aim(name, d):
        pb = pbs[name]; rest = pb.bone.matrix_local
        cur = pb.matrix.copy()
        rdir = rest.to_3x3() @ Vector((0, 1, 0))
        q = rdir.rotation_difference(Vector(d).normalized())
        m = (q.to_matrix() @ rest.to_3x3()).to_4x4(); m.translation = cur.translation
        pb.matrix = m; bpy.context.view_layer.update()
    for side, sx in (('Left', 1), ('Right', -1)):
        aim(f'{side}UpLeg', (0.3 * sx, -0.42, -0.86))
        aim(f'{side}Leg', (0.05 * sx, 0.2, -1))
        aim(f'{side}Arm', (0.25 * sx, -0.45, -0.85))
        aim(f'{side}ForeArm', (-0.1 * sx, -1, -0.25))
    for f in (0, 1):
        for p in pbs: p.keyframe_insert('rotation_quaternion', frame=f); p.keyframe_insert('location', frame=f)
    arm.animation_data.action = None

# Helm über den Kopf: Kopf in der Ruhehaltung ausmessen (Punkte, die am Kopfknochen hängen), Helm darum,
# dann wie ein starres Teil mit voller Gewichtung am Kopfknochen
if opt.get('helm') and arm:
    head = next(b.name for b in arm.data.bones if b.name.lower() == 'head')
    body = max(meshes, key=lambda o: len(o.data.vertices))
    gi = {g.index for g in body.vertex_groups if g.name.lower() in ('head', 'head_end', 'headfront')}
    pts = [body.matrix_world @ v.co for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in gi) > 0.5]
    hlo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hhi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=opt['helm'])
    hobjs = [o for o in sc.objects if o not in before and o.type == 'MESH']
    for o in hobjs:
        o.parent = None
    bpy.ops.object.select_all(action='DESELECT')
    for o in hobjs: o.select_set(True)
    bpy.context.view_layer.objects.active = hobjs[0]
    bpy.ops.object.join()
    hm = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    size = max(hhi.x - hlo.x, hhi.y - hlo.y)
    k = size * float(opt.get('helmweite', 1.08)) / 0.25
    top = hhi.z + 0.02
    bottom = min(hlo.z + (hhi.z - hlo.z) * 0.08, top - 0.32 * k)
    kz = (top - bottom) / 0.32
    for v in hm.data.vertices:
        v.co = Vector(((hlo.x + hhi.x) / 2 + v.co.x * k, (hlo.y + hhi.y) / 2 + v.co.y * k, bottom + v.co.z * kz))
    hm.parent = root
    hm.matrix_parent_inverse = root.matrix_world.inverted()
    vg = hm.vertex_groups.new(name=head); vg.add(range(len(hm.data.vertices)), 1.0, 'REPLACE')
    hm.parent = arm; hm.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = hm.modifiers.new('skelett', 'ARMATURE'); mod.object = arm
    meshes.append(hm)
    print('Helm', [round(x, 3) for x in hlo], [round(x, 3) for x in hhi], 'Maß', round(k, 2), round(kz, 2))

# Kamera: orthografisch, 30° von oben, um 45° gedreht – genau die 2:1-Schrägansicht des Spiels
cam = bpy.data.objects.new('kamera', bpy.data.cameras.new('kamera')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
el, az = math.radians(30), math.radians(45)
target = Vector((0, 0, HEIGHT * 0.45))
dist = 20
cam.location = target + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
cam.rotation_euler = (math.radians(90) - el, 0, az)
# Bildhöhe der Figur: HEIGHT * cos(30°) Meter sollen FIG_PX Pixel sein
SCALE_H = float(opt['meter']) if opt.get('meter') else HEIGHT
cam.data.ortho_scale = SCALE_H * math.cos(el) * CELL / FIG_PX
cam.data.clip_start, cam.data.clip_end = 0.1, 100

# Licht von links oben, dazu weiches Umgebungslicht, damit die gemalten Farben stehen bleiben
sun = bpy.data.objects.new('sonne', bpy.data.lights.new('sonne', 'SUN')); sc.collection.objects.link(sun)
sun.data.energy = 3.6; sun.data.angle = math.radians(8)
sun.rotation_euler = (math.radians(50), 0, math.radians(-60))
world = bpy.data.worlds.new('welt'); sc.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.60, 0.56, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 1.25

r = sc.render
r.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 24; sc.cycles.use_denoising = True
r.resolution_x = r.resolution_y = CELL; r.film_transparent = True
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
# Umriss wie bei den gezeichneten Figuren: nach dem Rendern als dunkle Kante um die Figur gelegt.
# Breite in Pixeln der großen Fassung, im Spiel wird daraus etwa ein Pixel.
LINE = int(opt.get('linie', 3))
def outline(px):
    a = np.array(px, dtype=np.float32).reshape(CELL, CELL, 4)
    m = a[..., 3] > 0.35
    d = m.copy()
    for _ in range(LINE):
        e = d.copy()
        e[1:] |= d[:-1]; e[:-1] |= d[1:]; e[:, 1:] |= d[:, :-1]; e[:, :-1] |= d[:, 1:]
        d = e
    edge = d & ~m
    a[edge] = (0.16, 0.11, 0.08, 0.92)
    # halbdurchsichtige Ränder der Figur selbst etwas abdunkeln, damit die Kante weich anschließt
    soft = (a[..., 3] > 0.02) & ~m & ~edge
    a[soft] = (0.16, 0.11, 0.08, 0.92)
    return a.ravel()

# Fußpunkt im Bild
bpy.context.view_layer.update()
fx, fy, _ = world_to_camera_view(sc, cam, Vector((0, 0, 0)))
ANCHOR = (round(fx * CELL, 1), round((1 - fy) * CELL, 1))

# Bewegungen (ohne Skelett: nur „statisch“)
acts = list(bpy.data.actions) if arm else [None]
hips = next((b.name for b in arm.pose.bones if 'hip' in b.name.lower() or 'pelvis' in b.name.lower()), None) if arm else None
# Mehrere Durchläufe (eine Datei je Bewegung) schreiben in dieselbe sprites.json
mpath = os.path.join(out, 'sprites.json')
old = json.load(open(mpath)) if os.path.exists(mpath) else {}
meta = {'zelle': CELL, 'fusspunkt': ANCHOR, 'figur_px': FIG_PX, 'richtungen': DIRS, 'hand': hand, 'bewegungen': old.get('bewegungen', {}), 'punkte': old.get('punkte', {})}
tmp = os.path.join(out, '_tmp.png')
for act in acts:
    parts = act.name.split('|') if act else ['statisch']
    name = parts[1] if len(parts) >= 3 else parts[-1]
    if act and ONLY and name not in ONLY and act.name not in ONLY: continue
    if opt.get('punkt'):
        for pn in opt['punkt'].split(','): meta.setdefault('punkte', {})[name if ',' not in opt['punkt'] else f'{name}|{pn}'] = []
    if act:
        arm.animation_data_create(); arm.animation_data.action = act
        if hasattr(arm.animation_data, 'action_slot') and act.slots: arm.animation_data.action_slot = act.slots[0]
        f0, f1 = act.frame_range
        if name in RANGE: a, b = RANGE[name]; f0, f1 = f0 + (f1 - f0) * a, f0 + (f1 - f0) * b
    else:
        f0, f1 = 0, 0
    walk = 'walk' in name.lower() or 'run' in name.lower() or name in LOOPS or name in STELLE
    n = 1 if opt.get('probe') or not act else FRAMES.get(name, 8 if walk else 6)
    frames = [f0 + (f1 - f0) * i / (n if walk else max(1, n - 1)) for i in range(n)]
    dirs = [0] if opt.get('probe') else list(range(DIRS))
    sheet = bpy.data.images.new(f'bogen_{name}', CELL * n, CELL * len(dirs), alpha=True)
    px = [0.0] * (CELL * n * CELL * len(dirs) * 4)
    for di, d in enumerate(dirs):
        root.rotation_euler = (0, 0, math.radians(45 * d))
        for fi, f in enumerate(frames):
            sc.frame_set(int(f), subframe=f - int(f))
            # Gehen auf der Stelle: Hüfte waagerecht auf den Ursprung zurückziehen
            root.location.x = root.location.y = 0
            if walk and hips and (name not in LOOPS or name in STELLE):
                bpy.context.view_layer.update()
                hw = arm.matrix_world @ arm.pose.bones[hips].head
                root.location.x -= hw.x; root.location.y -= hw.y
            if opt.get('punkt'):
                bpy.context.view_layer.update()
                for pn in opt['punkt'].split(','):
                    pw = arm.matrix_world @ arm.pose.bones[pn].head
                    px_, py_, _ = world_to_camera_view(sc, cam, pw)
                    key = name if ',' not in opt['punkt'] else f'{name}|{pn}'
                    meta.setdefault('punkte', {}).setdefault(key, []).append([round(px_ * CELL, 1), round((1 - py_) * CELL, 1)])
            r.filepath = tmp
            bpy.ops.render.render(write_still=True)
            im = bpy.data.images.load(tmp, check_existing=False)
            src_px = outline(im.pixels[:])
            bpy.data.images.remove(im)
            # Zelle in den Bogen kopieren (Blender-Bilder beginnen unten links)
            rows = len(dirs)
            for y in range(CELL):
                sy = y * CELL * 4
                dy = ((rows - 1 - di) * CELL + y) * CELL * n * 4 + fi * CELL * 4
                px[dy:dy + CELL * 4] = src_px[sy:sy + CELL * 4]
    sheet.pixels[:] = px
    sheet.filepath_raw = os.path.join(out, f'{name}.png'); sheet.file_format = 'PNG'; sheet.save()
    meta['bewegungen'][name] = {'bilder': n, 'schleife': walk or 'idle' in name.lower(), 'dauer': round((f1 - f0) / sc.render.fps, 3)}
    print('fertig', name, n, 'Bilder,', len(dirs), 'Richtungen', flush=True)
if os.path.exists(tmp): os.remove(tmp)
json.dump(meta, open(mpath, 'w'), indent=1, ensure_ascii=False)
print('Fußpunkt', ANCHOR, 'Hand', hand, 'Höhe', round(HEIGHT, 2))
