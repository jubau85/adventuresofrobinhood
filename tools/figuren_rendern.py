# Rendert alle Figuren (Modelle und Bemalungen) aus tools/meshy_figuren.py mit tools/sprites.py nach <arbeitsordner>/sp_<schlüssel>/.
# Aufruf: python3 tools/figuren_rendern.py <arbeitsordner> <held-ordner mit teile/topfhelm.glb> [schlüssel ...]
# Schlüssel held_<stufe> rendern den Helden (edel, gambeson, leder, kette, schuppe, ritter) nach <held-ordner>/sp_<stufe>/.
# Ohne Schlüssel: erst der Held, dann alle übrigen Figuren.
# Liegt im Arbeitsordner der Unterordner neubemalung/ (tools/meshy_bemalung.py), gilt dessen Bemalung <schlüssel>_farbe.png
# (Held: edel_farbe.png, edel_<stufe>_farbe.png) vor der alten.
import subprocess, sys, os, json, time, shutil
D = os.path.abspath(sys.argv[1]); R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = '/opt/blender-venv/bin/python'
E = os.path.abspath(sys.argv[2])
# Bewegungen je Modell: Meshy-Name -> Bilder; Bereich (Anteil) für Übergänge
ANIM = {
 'Idle': 4, 'Walking_Woman': 8, 'Female_Crouch_Pick_Up_Place_Side': 6, 'Male_Bend_Over_Pick_Up': 6, 'Stand_and_Drink': 6,
 'Cheer_with_Both_Hands_Up': 6, 'Talk_with_Hands_Open': 6, 'Carry_Water_Bucket_Walk': 8, 'Sit_Cross_Legged_on_Floor': 2, 'Hit_Reaction': 4,
 'Heavy_Hammer_Swing': 6, 'Charged_Axe_Chop': 6, 'Kneel_on_One_Knee_and_Stand': 2, 'Wave_One_Hand': 6, 'Right_Hand_Sword_Slash': 6,
 'Archery_Shot': 6, 'Pull_Radish': 6, 'Skip_Forward': 8, 'happy_jump_m': 6, 'Sneaky_Walk': 8, 'Elderly_Shaky_Walk': 8,
}
BEREICH = {'Sit_Cross_Legged_on_Floor': '0.9:1', 'Kneel_on_One_Knee_and_Stand': '0.3:0.42'}
STELLE = 'Skip_Forward,happy_jump_m'
# Modell -> (Ordner, eigene Gehbewegung statt walking.glb oder None, Reitpose)
MOD = {
 'bauer': ('bauer', None, True), 'frau': ('frau', 'Walking_Woman', False), 'kind': ('kind', None, False),
 'buerger': ('buerger', None, True), 'handwerker': ('handwerker', None, False), 'geistlicher': ('geistlicher', None, True),
 'soldat': ('soldat', None, True), 'bettler': ('bettler', 'Elderly_Shaky_Walk', False), 'jaeger': ('jaeger', None, True),
 'ritterin': ('ritterin', None, True),
}
# Schlüssel -> (Modell, Bemalung oder None, Helm)
KEYS = {k: (k, None, False) for k in MOD}
# Fußsoldat im Gambeson: Neubemalung mit großem Waffenrock (die erste Bemalung hatte kaum Farbe zum Einfärben)
KEYS['soldat'] = ('soldat', 'gambeson', False)
# Ritterin ohne Rüstung: das Wams cyan (tools/wams.py), damit es die Wappenfarbe trägt
KEYS['ritterin'] = ('ritterin', 'wams', False)
for v in ['leder', 'kette', 'schuppe']: KEYS[f'soldat_{v}'] = ('soldat', v, False)
for v in ['gambeson', 'leder', 'kette', 'schuppe', 'ritter']: KEYS[f'ritterin_{v}'] = ('ritterin', v, v == 'ritter')
HELD = ['edel', 'gambeson', 'leder', 'kette', 'schuppe', 'ritter']
NEU = os.path.join(os.path.dirname(D), 'neubemalung')
def neu(name):
    f = os.path.join(NEU, f'{name}_farbe.png')
    return f if os.path.exists(f) else None
want = sys.argv[3:] or [f'held_{v}' for v in HELD] + list(KEYS)
# Bildgüte: dreifach … zweifach groß rendern und flächig verkleinern (statt kleiner Bilder mit Entrauscher, der die
# Bemalung verschmiert), dünner Umriss, kräftigere Sonne mit Gegenlicht und Umgebungsverdeckung in den Falten
QUALI = ['--ss', '2', '--samples', '32', '--entrauschen', '0', '--linie', '1.2', '--schaerfe', '0.35',
         '--sonne', '4.6', '--umgebung', '0.8', '--gegenlicht', '2.5', '--ao', '0.8']
def run(args):
    p = subprocess.run([B, os.path.join(R, 'tools/sprites.py'), '--'] + args, capture_output=True, text=True)
    out = [l for l in (p.stdout + p.stderr).splitlines() if l.startswith('fertig') or 'Error' in l or 'Traceback' in l]
    print('   ', ' | '.join(out)[:400], flush=True)
def fresh(out):
    # alte Bögen weg, damit sprites.json nur die neuen Bewegungen kennt
    if os.path.isdir(out) and os.path.basename(out).startswith('sp_'): shutil.rmtree(out)
    os.makedirs(out)
for key in [k for k in want if k.startswith('held_')]:
    v = key[5:]; out = os.path.join(E, f'sp_{v}'); t0 = time.time(); fresh(out)
    X = ['--meter', '1.8', '--zelle', '224', '--figur', '120', '--punkt', 'RightHand,LeftHand,Hips'] + QUALI
    # ohne Rüstung das Wams cyan (tools/wams.py), damit es die Wappenfarbe trägt
    X += ['--textur', neu('edel' if v == 'edel' else f'edel_{v}') or os.path.join(E, f'{"wams" if v == "edel" else v}_farbe.png')]
    if v == 'ritter': X += ['--helm', os.path.join(E, 'teile', 'topfhelm.glb')]
    print(key, flush=True)
    run([os.path.join(E, 'edel_walking.glb'), out] + X + ['--bilder', 'walking_man=8'])
    run([os.path.join(E, 'edel_running.glb'), out] + X + ['--bilder', 'running=8'])
    run([os.path.join(E, 'edel_aktionen.glb'), out] + X + ['--nur', 'Idle,Right_Hand_Sword_Slash,Hit_Reaction', '--bilder', 'Idle=4,Right_Hand_Sword_Slash=6,Hit_Reaction=4'])
    run([os.path.join(E, 'edel_rig.glb'), out] + X + ['--reitpose', '1', '--nur', 'reiten', '--bilder', 'reiten=1'])
    run([os.path.join(E, 'edel_rig.glb'), out] + X + ['--reitpose', '1', '--fernbein', '1', '--nur', 'reiten', '--bilder', 'reiten=1'])
    print(key, 'fertig', round(time.time() - t0), 's', flush=True)
for key in [k for k in want if not k.startswith('held_')]:
    mod, var, helm = KEYS[key]
    folder, walk, ride = MOD[mod]
    src = os.path.join(D, folder) if mod != 'bauer' else os.path.join(D, 'bauer')
    out = os.path.join(D, f'sp_{key}')
    t0 = time.time(); fresh(out)
    # Spielgröße (Zelle 168, Figur 90 px), intern doppelt so groß gerendert
    X = ['--meter', '1.8', '--zelle', '168', '--figur', '90', '--punkt', 'RightHand,LeftHand,Hips'] + QUALI
    if neu(key): X += ['--textur', neu(key)]
    elif var: X += ['--textur', os.path.join(D, folder, f'{var}_farbe.png')]
    if helm: X += ['--helm', os.path.join(E, 'teile', 'topfhelm.glb')]
    rig = os.path.join(src, 'rig.glb')
    print(key, flush=True)
    if not walk: run([os.path.join(src, 'walking.glb'), out] + X + ['--bilder', 'walking=8'])
    run([os.path.join(src, 'running.glb'), out] + X + ['--bilder', 'running=8'])
    names = [n for n in ANIM]
    for akt in [os.path.join(src, 'aktionen_alt.glb'), os.path.join(src, 'aktionen.glb')]:
        if not os.path.exists(akt): continue
        run([akt, out] + X + ['--nur', ','.join(names), '--bilder', ','.join(f'{n}={v}' for n, v in ANIM.items()),
             '--bereich', ','.join(f'{n}={v}' for n, v in BEREICH.items()), '--stelle', STELLE])
    if ride:
        run([rig, out] + X + ['--reitpose', '1', '--nur', 'reiten', '--bilder', 'reiten=1'])
        run([rig, out] + X + ['--reitpose', '1', '--fernbein', '1', '--nur', 'reiten', '--bilder', 'reiten=1'])
    print(key, 'fertig', round(time.time() - t0), 's', flush=True)
print('RENDERN FERTIG', flush=True)
