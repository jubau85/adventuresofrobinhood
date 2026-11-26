# Baut ein Pferd in Blender (Körper aus einem Skelett mit Hautmodifikator, Knochen, Gewichte) und
# berechnet seine Gangarten. Ergebnis ist eine GLB-Datei, die tools/sprites.py in Sprite-Bögen rendert.
#
#   /opt/blender-venv/bin/python tools/pferd.py <ziel.glb> [--art pferd|ross]
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
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
OUT = argv[0]
ART = argv[argv.index('--art') + 1] if '--art' in argv else 'pferd'
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
    # Kopfschutz aus Stoff
    ellipsoid('kopfdecke', (0, -1.17, 1.67), (0.145, 0.2, 0.13), STOFF, 16)

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
bone('koerper', (0, 0.62, 1.2), (0, -0.45, 1.2))
bone('hals', (0, -0.62, 1.33), (0, -1.06, 1.78), 'koerper')
bone('kopf', (0, -1.06, 1.78), (0, -1.38, 1.4), 'hals', True)
bone('schweif1', (0, 0.86, 1.3), (0, 1.03, 1.0), 'koerper')
bone('schweif2', (0, 1.03, 1.0), (0, 1.07, 0.58), 'schweif1', True)
for side, sx in (('l', X), ('r', -X)):
    bone(f'v{side}_ober', (sx, -0.45, 1.05), (sx, -0.5, 0.52), 'koerper')
    bone(f'v{side}_unter', (sx, -0.5, 0.52), (sx, -0.53, 0.0), f'v{side}_ober', True)
    bone(f'h{side}_ober', (sx, 0.55, 1.08), (sx, 0.42, 0.78), 'koerper')
    bone(f'h{side}_mitte', (sx, 0.42, 0.78), (sx, 0.66, 0.5), f'h{side}_ober', True)
    bone(f'h{side}_unter', (sx, 0.66, 0.5), (sx, 0.63, 0.0), f'h{side}_mitte', True)
# Sitz: tiefster Punkt des Sattels, etwas hinter der Mitte; Kopfmitte für die Verdeckung des Reiters von vorn
bone('sattel', (0, 0.0, 1.55), (0, 0.0, 1.7), 'koerper', deform=False)
bone('kopfmitte', (0, -1.2, 1.62), (0, -1.2, 1.72), 'kopf', deform=False)
bpy.ops.object.mode_set(mode='OBJECT')

# Gewichte: Körper, Mähne, Schweif, Ohren automatisch; Sattel und Schabracke fest am Rumpf
def parent_auto(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
parent_auto([body])
parent_auto([mane, tail])
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
for side, sx in (('l', X), ('r', -X)):
    L[f'v{side}'] = ((Vector((sx, -0.5, 0.52)) - Vector((sx, -0.45, 1.05))).length, (Vector((sx, -0.53, 0.0)) - Vector((sx, -0.5, 0.52))).length)
    L[f'h{side}'] = ((Vector((sx, 0.42, 0.78)) - Vector((sx, 0.55, 1.08))).length, (Vector((sx, 0.66, 0.5)) - Vector((sx, 0.42, 0.78))).length, (Vector((sx, 0.63, 0.0)) - Vector((sx, 0.66, 0.5))).length)
HOOF0 = {'vl': Vector((X, -0.53, 0.0)), 'vr': Vector((-X, -0.53, 0.0)), 'hl': Vector((X, 0.63, 0.0)), 'hr': Vector((-X, 0.63, 0.0))}
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
    pivot = Vector((0, 0.05, 1.2))
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
    for side, sx in (('l', X), ('r', -X)):
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
