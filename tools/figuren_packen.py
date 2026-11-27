# Packt den Held (<held-ordner>/sp_<stufe>) und alle übrigen Figuren (<arbeitsordner>/sp_*) und schreibt src/figuren.js
# und die Bildeinträge in src/assets.js.
# Aufruf: python3 tools/figuren_packen.py <arbeitsordner> <held-ordner> [nur-figuren | nur-held] [schlüssel ...]
import json, glob, os, subprocess, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.abspath(sys.argv[1]); E = os.path.abspath(sys.argv[2])
NAMEN = ('walking_man=gehen,walking=gehen,walking_woman=gehen,running=laufen,Idle=stehen,Walking_Woman=gehen,Elderly_Shaky_Walk=gehen,'
         'Female_Crouch_Pick_Up_Place_Side=aufheben,Male_Bend_Over_Pick_Up=aufheben,Stand_and_Drink=trinken,Cheer_with_Both_Hands_Up=jubeln,'
         'Talk_with_Hands_Open=reden,Carry_Water_Bucket_Walk=eimer,Sit_Cross_Legged_on_Floor=sitzen,Hit_Reaction=getroffen,'
         'Heavy_Hammer_Swing=haemmern,Charged_Axe_Chop=hacken,Kneel_on_One_Knee_and_Stand=knien,Wave_One_Hand=segnen,'
         'Right_Hand_Sword_Slash=schlag,Archery_Shot=bogen,Pull_Radish=jaeten,Skip_Forward=huepfen,happy_jump_m=springen,Sneaky_Walk=schleichen,reiten=reiten')
def entry(d):
    fx, fy = d['fusspunkt']
    pts = {k: [c for p in arr for c in (round((p[0] - fx) * 2) / 2, round((p[1] - fy) * 2) / 2)] for k, arr in d.get('punkte', {}).items()}
    return {'zelle': d['zelle'], 'breite': d.get('breite', d['zelle']), 'hoehe': d.get('hoehe', d['zelle']), 'figur_px': d['figur_px'],
            'fusspunkt': d['fusspunkt'], 'bewegungen': {a: {'bilder': b['bilder'], 'dauer': b['dauer']} for a, b in d['bewegungen'].items()}, 'punkte': pts}
def pack(src, dst, name, extra):
    m = json.load(open(os.path.join(src, 'sprites.json')))
    # nur Bewegungen mit Bild; Sterben und Probebilder weglassen
    m['bewegungen'] = {k: v for k, v in m['bewegungen'].items() if os.path.exists(os.path.join(src, f'{k}.png')) and k != 'dying_backwards'}
    json.dump(m, open(os.path.join(src, 'sprites.json'), 'w'))
    p = subprocess.run(['python3', os.path.join(R, 'tools/sprite_pack.py'), src, dst, name, '--zuschnitt', '1', '--namen', NAMEN] + extra, capture_output=True, text=True)
    if p.returncode: print(p.stderr[-800:]); raise SystemExit(1)
    print(name, ' '.join(l.split()[1] + ':' + l.split()[-2] for l in p.stdout.splitlines() if l.startswith('gepackt')), flush=True)
    return json.loads(p.stdout.strip().splitlines()[-1])
only_fig = 'nur-figuren' in sys.argv[3:]
only_hero = 'nur-held' in sys.argv[3:]
hero, fig = {}, {}
def tables():
    # vorhandene Tabellen aus src/figuren.js lesen (je Zeile „  name: {…},“)
    cur, tab = None, {'HERO3D': {}, 'FIG3D': {}}
    for line in open(os.path.join(R, 'src/figuren.js')).read().split('\n'):
        if line.startswith('export const '): cur = line.split()[2]; continue
        if cur and line.startswith('  ') and ': {' in line:
            k, v = line.strip().split(': ', 1); tab[cur][k] = json.loads(v.rstrip(',').replace("'", '"'))
    return tab
if not only_fig:
    for f in glob.glob(os.path.join(R, 'assets/held/*.webp')): os.remove(f)
    for v in ['edel', 'gambeson', 'leder', 'kette', 'schuppe', 'ritter']:
        x = ['--farbton', '190', '--breite', '16', '--hell', '0.55'] if v == 'ritter' else ['--ohne-maske', '1']
        hero[v] = entry(pack(os.path.join(E, f'sp_{v}'), os.path.join(R, 'assets/held'), f'held_{v}', ['--zelle', '224', '--qualitaet', '84'] + x))
    # nur der Held: die Figuren bleiben, wie sie sind
    if only_hero: fig.update(tables()['FIG3D'])
else:
    tab = tables(); hero = tab['HERO3D']; fig.update(tab['FIG3D'])
keys = [a for a in sys.argv[3:] if a not in ('nur-figuren', 'nur-held')]
for f in [] if only_hero else glob.glob(os.path.join(R, 'assets/figuren3d/*.webp')):
    if not keys or any(os.path.basename(f).startswith(k + '_') and not os.path.basename(f)[len(k) + 1:].split('_')[0] in ('leder', 'kette', 'schuppe', 'gambeson', 'ritter') for k in keys): os.remove(f)
for sp in [] if only_hero else sorted(glob.glob(os.path.join(D, 'sp_*'))):
    key = os.path.basename(sp)[3:]
    if keys and key not in keys: continue
    if not os.path.exists(os.path.join(sp, 'sprites.json')): continue
    x = ['--farbton', '190', '--breite', '16', '--hell', '0.55'] if key == 'ritterin_ritter' else ['--farbton', '188', '--breite', '34'] if key.startswith('soldat') else []
    fig[key] = entry(pack(sp, os.path.join(R, 'assets/figuren3d'), key, ['--zelle', '168', '--qualitaet', '76', '--maske-qualitaet', '60', '--alpha', '50'] + x))
js = lambda o: json.dumps(o, separators=(',', ':')).replace('"', "'")
lines = ['// 3D-Figuren aus Meshy, gerendert mit tools/sprites.py, gepackt mit tools/sprite_pack.py (Rand abgeschnitten).',
         '// HERO3D: der Held je Rüstung (Bilder held_<stufe>_<bewegung>), FIG3D: alle übrigen Figuren (fig3d_<modell>_<bewegung>).',
         '// punkte: je Bewegung und Knochen (RightHand, LeftHand, Hips) die Lage je Richtung und Bild (x, y abwechselnd),',
         '// in Zellen-Pixeln relativ zum Fußpunkt.', 'export const HERO3D = {']
lines += [f'  {k}: {js(v)},' for k, v in hero.items()] + ['};', 'export const FIG3D = {']
lines += [f'  {k}: {js(v)},' for k, v in fig.items()] + ['};']
open(os.path.join(R, 'src/figuren.js'), 'w').write('\n'.join(lines) + '\n')
# Bildeinträge in assets.js
s = open(os.path.join(R, 'src/assets.js')).read()
def block(a, b, ents):
    global s
    if a in s: s = s[:s.index(a)] + s[s.index(b) + len(b):]
    s = s.replace('\n};\n\nexport const ART', '\n' + a + ents + b + '};\n\nexport const ART', 1)
held = sorted(glob.glob(os.path.join(R, 'assets/held/*.webp')))
block('  // Held (tools/sprites.py)\n', '  // Ende Held\n', ''.join(f"  {os.path.basename(f)[:-5]}: 'assets/held/{os.path.basename(f)}',\n" for f in held))
figs = sorted(glob.glob(os.path.join(R, 'assets/figuren3d/*.webp')))
a, b = '  // Figuren 3D (tools/sprites.py)\n', '  // Ende Figuren 3D\n'
if a in s: s = s[:s.index(a)] + s[s.index(b) + len(b):]
# alte Einzeleinträge (Probebauer) entfernen, dann den Block neu schreiben
s = '\n'.join(l for l in s.split('\n') if not l.strip().startswith('fig3d_'))
block(a, b, ''.join(f"  fig3d_{os.path.basename(f)[:-5]}: 'assets/figuren3d/{os.path.basename(f)}',\n" for f in figs))
open(os.path.join(R, 'src/assets.js'), 'w').write(s)
tot = sum(os.path.getsize(f) for f in held + figs)
print(len(held), 'Heldbögen,', len(figs), 'Figurenbögen,', tot // 1024, 'KB')
