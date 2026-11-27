# Meshy-Gegenstände (GLB) als Spielbilder rendern, im Format von assets/gegenstaende (tools/gegenstaende.py):
#   lang:     liegt waagerecht, Griffende links, Kopf rechts, schwere Seite (Klinge, Kopf) unten; griff = Griffpunkt
#   aufrecht: Schilde von vorn (und <name>_innen von hinten), Waren schräg von vorn oben wie im Spiel
# Aufruf: /opt/blender-venv/bin/python tools/gegenstaende_render.py <glb-ordner> <ziel-ordner> <name:art:meter[:griff]> ...
#   art: lang | schild | ware;  meter: Länge (lang) oder Höhe (schild, ware) in Metern; griff: Anteil der Länge vom Griffende
import bpy, sys, os, math, json
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
SRC, DST, ITEMS = args[0], args[1], args[2:]
os.makedirs(DST, exist_ok=True)
PPM = 128          # Bildpunkte je Meter (kleine Dinge 256)
SS = 4             # Überabtastung beim Rendern

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'          # ohne Grafikkarte: Cycles auf dem Prozessor
    sc.cycles.samples = 24; sc.cycles.use_denoising = False; sc.cycles.device = 'CPU'
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    return sc

def load(name):
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f'{name}.glb'))
    obs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    pts = np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices])
    return obs, pts

def light(sc, d=(0.4, -0.6, 1.0), e=3.2):
    l = bpy.data.lights.new('sonne', 'SUN'); l.energy = e
    o = bpy.data.objects.new('sonne', l); sc.collection.objects.link(o)
    o.rotation_euler = Vector(d).to_track_quat('Z', 'Y').to_euler()

def camera(sc, loc, target, scale, w, h):
    c = bpy.data.cameras.new('cam'); c.type = 'ORTHO'; c.ortho_scale = scale
    o = bpy.data.objects.new('cam', c); sc.collection.objects.link(o); sc.camera = o
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x, sc.render.resolution_y = w, h

def render(sc, out):
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)

meta = json.load(open(os.path.join(DST, '_render.json'))) if os.path.exists(os.path.join(DST, '_render.json')) else {}
for spec in ITEMS:
    parts = spec.split(':')
    name, art, meter = parts[0], parts[1], float(parts[2])
    grip = float(parts[3]) if len(parts) > 3 else 0.12
    kopf = parts[4] if len(parts) > 4 else 'oben'   # wo Meshy den Kopf hingestellt hat (Schaufel: unten)
    sc = reset()
    obs, pts = load(name)
    lo, hi = pts.min(0), pts.max(0)
    ext = hi - lo
    # Auf die gewünschte Größe bringen: lang = längste Achse, sonst Höhe (Z)
    s = meter / (ext.max() if art == 'lang' else ext[2])
    for o in obs: o.scale = [x * s for x in o.scale]
    bpy.context.view_layer.update()
    pts = np.array([list(o.matrix_world @ v.co) for o in obs for v in o.data.vertices]); lo, hi = pts.min(0), pts.max(0)
    mid = (lo + hi) / 2
    ppm = PPM * (2 if meter < 0.5 else 1)
    # Nur rendern (große Rohbilder _<name>_<blick>.png); zuschneiden, drehen und Griffpunkt setzt tools/gegenstaende_nach.py.
    # Damit sich ein Ding mit der Figur dreht, gibt es mehrere Blicke: lange Dinge um ihre Längsachse gerollt (0° flach,
    # 45°, 80° fast hochkant), Schilde um die Hochachse gedreht (0° Schauseite, 45°, 75°, 135°, 180° Rückseite).
    # Meshy stellt alles aufrecht hin (Kopf oder Oberkante oben); die Kamera blickt von vorn.
    blicke = [0, 45, 80] if art == 'lang' else [0, 45, 75, 135, 180] if art == 'schild' else [0]
    light(sc, (0.35, -1.0, 0.7))
    l2 = bpy.data.lights.new('fuell', 'SUN'); l2.energy = 1.2
    o2 = bpy.data.objects.new('fuell', l2); sc.collection.objects.link(o2)
    o2.rotation_euler = Vector((-0.4, 1.0, 0.5)).to_track_quat('Z', 'Y').to_euler()
    piv = bpy.data.objects.new('dreh', None); sc.collection.objects.link(piv); piv.location = Vector(mid)
    for o in obs:
        if o.parent is None: o.parent = piv; o.matrix_parent_inverse = piv.matrix_world.inverted()
    size = (max(ext) if art == 'lang' else float(np.linalg.norm(ext))) * s * 1.06
    camera(sc, (mid[0], mid[1] - 5, mid[2]), mid, size, int(size * ppm * SS), int(size * ppm * SS))
    for b in blicke:
        piv.rotation_euler = (0, 0, math.radians(b))
        bpy.context.view_layer.update()
        render(sc, os.path.join(DST, f'_{name}_{b}.png'))
    meta[name] = {'art': art, 'meter': meter, 'griff': grip, 'ppm': ppm, 'ss': SS, 'blicke': blicke, 'kopf': kopf}
    print('fertig', name, flush=True)
    continue
    meta[name] = {'art': art, 'meter': meter, 'griff': grip, 'ppm': ppm, 'ss': SS}
    print('fertig', name, flush=True)
json.dump(meta, open(os.path.join(DST, '_render.json'), 'w'), indent=1, ensure_ascii=False)
