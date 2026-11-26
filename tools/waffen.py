# Einfache Waffen und Schilde als 3D-Modelle für die Sprite-Strecke (tools/sprites.py).
# Aufruf: /opt/blender-venv/bin/python tools/waffen.py <ausgabe-ordner>
# Jedes Teil liegt mit dem Griff am Ursprung und der Klinge entlang +Y. Farben: Stahl, Eisen, Leder, Holz.

import bpy, sys, os, math

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else sys.argv[1]
os.makedirs(out, exist_ok=True)

def mat(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m

STAHL = lambda: mat('stahl', (0.72, 0.74, 0.76), 0.35, 0.6)
EISEN = lambda: mat('eisen', (0.30, 0.30, 0.32), 0.5, 0.5)
LEDER = lambda: mat('leder', (0.33, 0.20, 0.11), 0.8)
HOLZ = lambda: mat('holz', (0.45, 0.30, 0.17), 0.8)

def box(name, size, loc, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    return o

def cyl(name, r, h, loc, m, axis='Y', verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc,
                                        rotation=(math.radians(90), 0, 0) if axis == 'Y' else (0, 0, 0))
    o = bpy.context.object; o.name = name; o.data.materials.append(m)
    return o

def save(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{name}.glb'), use_selection=True, export_format='GLB')
    for o in objs: bpy.data.objects.remove(o)
    print('gespeichert', name)

bpy.ops.wm.read_factory_settings(use_empty=True)

# Schwert: Knauf bei y=0, Griff, Parierstange, gerade zweischneidige Klinge mit Spitze
parts = [
    cyl('knauf', 0.026, 0.03, (0, 0.0, 0), EISEN(), verts=10),
    cyl('griff', 0.016, 0.12, (0, 0.075, 0), LEDER()),
    box('parier', (0.22, 0.026, 0.03), (0, 0.145, 0), EISEN()),
]
blade = box('klinge', (0.055, 0.70, 0.012), (0, 0.51, 0), STAHL())
# Spitze: vordere Kante zusammenziehen
me = blade.data
for v in me.vertices:
    if v.co.y > 0.3: v.co.x *= 0.05
parts.append(blade)
parts.append(box('kehle', (0.012, 0.55, 0.014), (0, 0.46, 0), EISEN()))
save('schwert', parts)
