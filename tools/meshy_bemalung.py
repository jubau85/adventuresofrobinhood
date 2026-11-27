# Neue, reichere Bemalung der Figuren bei Meshy (Retexture auf derselben UV-Abwicklung): kräftige, warme Farben, gemalte
# Lichter und Schatten in jeder Falte, Nähte, Flicken, Schnallen und ein deutliches Gesicht, wie bei den gemalten
# Häusern. Die Fläche in Wappenfarbe bleibt cyan (mit gemalten Falten), damit das Spiel sie umfärbt.
# Aufruf: python3 tools/meshy_bemalung.py <arbeitsordner> [schlüssel ...]
# Ergebnis je Schlüssel: <arbeitsordner>/<schlüssel>_farbe.png und _bild.png; Zustand in <arbeitsordner>/auftraege.json.
# Der API-Schlüssel kommt nicht aus diesem Skript, sondern über den Netzwerk-Proxy der Umgebung. Je Bemalung 10 Punkte.
import json, os, sys, time, urllib.request, urllib.error
D = os.path.abspath(sys.argv[1]); os.makedirs(D, exist_ok=True)
STATE = os.path.join(D, 'auftraege.json')
st = json.load(open(STATE)) if os.path.exists(STATE) else {}
def save(): json.dump(st, open(STATE, 'w'), indent=1)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def req(path, body=None):
    for k in range(4):
        try:
            r = urllib.request.Request('https://api.meshy.ai' + path, data=json.dumps(body).encode() if body is not None else None,
                                       headers={'Content-Type': 'application/json'}, method='POST' if body is not None else 'GET')
            with urllib.request.urlopen(r, timeout=90) as rr: return json.loads(rr.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]; log('HTTP', e.code, path, msg)
            if e.code in (400, 401, 402, 403, 404, 422): raise
        except Exception as e: log('Netz', path, e)
        time.sleep(5 * (k + 1))
    raise RuntimeError('keine Antwort ' + path)
def get(url, out):
    for k in range(4):
        try: urllib.request.urlretrieve(url, out); return
        except Exception as e: log('Laden', out, e); time.sleep(5)
    raise RuntimeError('Laden fehlgeschlagen ' + out)

STIL = ('richly detailed hand-painted texture like a classic painted medieval strategy game, bright warm saturated colours, '
        'crisp painted highlights on top and darker painted shadows in every fold and under the belt, visible seams and stitching, '
        'clearly painted face with eyes, eyebrows, nose and mouth, rosy cheeks, no dirt, no grunge, no photo texture')
CYAN = 'pure cyan with lighter cyan highlights and darker cyan folds'
# Schlüssel -> (Meshy-Aufgabe mit der Form, Beschreibung der Bemalung)
EDEL = '01a21817-a139-7216-85e4-89bb46d7bf4a'
R = {'frau': '01a21874-14e5-715d-82b0-1e6445b9904d', 'kind': '01a21874-1cee-719f-a06d-d0c09313ffb1', 'buerger': '01a21874-243e-74e8-882a-129b5510e293',
     'handwerker': '01a21874-2ec9-75cf-a9c8-66a3d7c61259', 'geistlicher': '01a21874-3610-7023-b1a0-484988c8bf11', 'soldat': '01a21874-3f8f-72e0-b595-f9214e68aa93',
     'bettler': '01a21874-477a-761b-b22c-e32a3e8b3cb6', 'jaeger': '01a21874-4fd9-743b-b868-b8b379d25c18', 'ritterin': '01a21874-58d4-72ae-843b-eefc76283c20',
     'bauer': '01a21797-281e-7684-b3dd-edcd4449c8f6'}
JOBS = {
    'edel': (EDEL, f'{STIL}, knee-length wool doublet in {CYAN}, narrow embroidered gold trim at the collar, cuffs and hem, black hose, dark brown leather boots with painted creases, brown leather belt with a shiny brass buckle, warm skin, dark brown hair and short neat beard'),
    'buerger': (R['buerger'], f'{STIL}, the long coat is {CYAN}, dark brown woollen hood with stitched edge, dark brown hose, black leather shoes, brown leather belt with a money pouch and brass buckle, warm skin, dark hair and short beard'),
    'frau': (R['frau'], f'{STIL}, the long dress is {CYAN}, off-white linen apron with folds, white linen veil and wimple, brown leather shoes, warm skin'),
    'kind': (R['kind'], f'{STIL}, the tunic is {CYAN}, brown woollen hose, brown leather shoes, warm skin, light brown tousled hair'),
    'handwerker': (R['handwerker'], f'{STIL}, the tunic is {CYAN} with rolled sleeves, long brown leather apron with stitched edges and scuffs, off-white linen coif, brown trousers, brown boots, warm skin, short reddish beard'),
    'geistlicher': (R['geistlicher'], f'{STIL}, the habit robe and hood are {CYAN}, off-white rope belt with knots, brown leather sandals, warm skin, tonsure with a ring of brown hair'),
    'bettler': (R['bettler'], f'{STIL}, the ragged hooded cloak is {CYAN} with darker patches and frayed edges, torn grey-white tunic, rag-wrapped feet, weathered skin, unkempt grey beard'),
    'jaeger': (R['jaeger'], f'{STIL}, the hooded shoulder cape is {CYAN}, brown leather jerkin with lacing, brown hose, brown boots, quiver with fletched arrows, warm skin, brown hair and short beard'),
    'ritterin': (R['ritterin'], f'{STIL}, knee-length wool tunic in {CYAN} with a narrow embroidered gold trim at the collar, cuffs and hem, black hose, dark brown leather boots, brown leather belt with a brass buckle, warm skin, long dark brown braided hair'),
    'soldat': (R['soldat'], f'{STIL}, grey iron conical helmet with nose guard and a painted shine, the sleeveless knee-length tunic over the armour is {CYAN} and covers the chest, belly and skirt, the long sleeves are off-white quilted gambeson with stitched quilting lines, brown trousers, brown leather boots and belt, warm skin, short dark beard'),
    'bauer': (R['bauer'], f'{STIL}, the knee-length tunic is {CYAN}, brown woollen hose, brown leather shoes, rope belt, warm skin, brown hair and short beard'),
}
# Rüstungen: dieselbe Form wie die Grundfigur, neu bemalt (Held und Ritterin ohne Wappenfarbe außer im Waffenrock des Ritters)
HELD = 'dark brown hair and short neat beard'
for v, txt in {
    'gambeson': 'the knee-length coat is a thick quilted padded gambeson of off-white undyed linen with vertical stitched quilting lines and painted shadows between the quilts, long padded sleeves, brown leather belt with a brass buckle, black hose, dark brown leather boots',
    'leder': 'the knee-length coat is a brown boiled-leather jerkin with visible stitching, leather laces and small iron rivets on the chest, painted scuffs and highlights, the long sleeves are of black wool, brown leather belt with a brass buckle, black hose, dark brown leather boots',
    'kette': 'a knee-length grey steel chainmail hauberk with long mail sleeves and a mail coif covering the head, neck and hair so that only the face is visible, the rings drawn as a fine grey pattern with bright painted highlights, brown leather belt, black hose, dark brown leather boots',
    'schuppe': 'a knee-length coat of overlapping polished steel scales riveted on brown leather with bright painted highlights on every scale, long sleeves of black wool, brown leather belt with a brass buckle, black hose, dark brown leather boots',
    'ritter': f'a crusader knight: knee-length grey chainmail hauberk with long mail sleeves and mail mittens, a mail coif covering the head and hair, mail chausses on the legs, over the mail a sleeveless knee-length surcoat in {CYAN} without any pattern, brown leather sword belt, dark leather shoes',
}.items():
    JOBS[f'edel_{v}'] = (EDEL, f'{STIL}, {txt}, warm skin' + ('' if v in ('kette', 'ritter') else f', {HELD}'))
    # Meshy malte der Ritterin sonst einen Bart oder blondes Haar
    JOBS[f'ritterin_{v}'] = (R['ritterin'], f"{STIL}, {txt}, a young woman's smooth face without any beard or stubble, warm skin" + ('' if v == 'ritter' else ', long dark brown hair tied back in a single braid'))
SOLDAT = f'{STIL}, grey iron conical helmet with nose guard and a painted shine, the sleeveless knee-length tunic over the armour is {CYAN}, brown trousers, brown leather boots and belt, warm skin, short dark beard'
JOBS['soldat_leder'] = (R['soldat'], SOLDAT + ', both arms are fully covered down to the wrists by long sleeves of brown boiled leather with visible stitching and iron rivets, no bare skin on the arms, the skirt below the tunic is brown boiled leather')
JOBS['soldat_kette'] = (R['soldat'], SOLDAT + ', a grey chainmail coif under the helmet, the long sleeves and the skirt below the tunic are grey steel chainmail drawn as a fine ring pattern with bright highlights')
JOBS['soldat_schuppe'] = (R['soldat'], SOLDAT + ', the long sleeves and the skirt below the tunic are overlapping polished steel scales riveted on leather with bright highlights')
only = sys.argv[2:] or list(JOBS)
for n in only:
    s = st.get(n)
    if not s or s.get('status') in ('FAILED', 'CANCELED', 'EXPIRED'):
        src, prompt = JOBS[n]
        r = req('/openapi/v1/retexture', dict(input_task_id=src, enable_original_uv=True, enable_pbr=False, text_style_prompt=prompt))
        st[n] = {'id': r['result'], 'status': 'PENDING'}; save(); log(n, 'gestartet', r['result'])
while True:
    pend = [n for n in only if st[n].get('status') not in ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED')]
    if not pend: break
    for n in pend:
        d = req(f'/openapi/v1/retexture/{st[n]["id"]}')
        if d.get('status') != st[n].get('status'): log(n, d.get('status'), d.get('progress'), d.get('task_error') or '')
        st[n] = {'id': st[n]['id'], 'status': d.get('status'), 'd': d}
    save(); time.sleep(12)
for n in only:
    s = st[n]
    if s.get('status') != 'SUCCEEDED': log(n, s.get('status')); continue
    f = os.path.join(D, f'{n}_farbe.png')
    if not os.path.exists(f):
        tex = (s['d'].get('texture_urls') or [{}])[0].get('base_color')
        if tex: get(tex, f); get(s['d']['thumbnail_url'], os.path.join(D, f'{n}_bild.png')); log(n, 'geladen')
        else: log(n, 'keine Textur-URL')
log('fertig')
