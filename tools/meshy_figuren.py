# Erzeugt die Spielfiguren bei Meshy: Vorschau -> Bemalung -> Neubemalungen (Rüstungen) + Skelett -> Bewegungen.
# Aufruf: python3 tools/meshy_figuren.py <arbeitsordner> [modell ...]
# Zustand in <arbeitsordner>/auftraege.json, Dateien in <arbeitsordner>/<modell>/. Wiederholbar: fertige Schritte
# werden übersprungen. Der API-Schlüssel kommt nicht aus diesem Skript, sondern über den Netzwerk-Proxy der Umgebung.
# Danach: tools/figuren_rendern.py und tools/figuren_packen.py.
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

GEO = 'slightly chunky stylized proportions with a slightly larger head, empty open hands, standing in A-pose, full body game character'
TEX = 'hand-painted stylized game texture, clear flat colour areas, soft painterly shading, no dirt'
M = {
 'frau': dict(h=1.65, p='medieval English peasant woman around the year 1194, long ankle-length wool dress in flat cyan colour with long sleeves, plain off-white linen apron, white linen veil and wimple covering the hair and neck, simple brown leather shoes, kind face, ' + GEO,
   t=TEX + ', the long dress is pure flat cyan, off-white linen apron, white linen veil and wimple, brown leather shoes, warm skin',
   a=[0, 1, 274, 342, 298, 313, 552, 363, 178]),
 'kind': dict(h=1.25, p='medieval English peasant child about eight years old around the year 1194, simple knee-length wool tunic in flat cyan colour with long sleeves, brown woollen hose, simple leather shoes, short tousled light brown hair, cheerful face, child proportions with a large head, empty open hands, standing in A-pose, full body game character',
   t=TEX + ', the tunic is pure flat cyan, brown hose, brown leather shoes, warm skin, light brown hair', a=[0, 118, 61, 298, 178]),
 'buerger': dict(h=1.76, p='medieval English merchant townsman around the year 1194, calf-length wool coat with long sleeves in flat cyan colour, short dark brown woollen shoulder hood, dark brown hose, black leather shoes, leather belt with a money pouch, short dark beard, well-fed friendly face, ' + GEO,
   t=TEX + ', the long coat is pure flat cyan, dark brown hood, dark brown hose, black shoes, brown leather belt and pouch, warm skin, dark hair and short beard', a=[0, 313, 342, 298, 363, 178]),
 'handwerker': dict(h=1.78, p='medieval English blacksmith craftsman around the year 1194, knee-length wool tunic in flat cyan colour with the sleeves rolled up to the elbows, long brown leather apron from chest to knees, off-white linen coif cap, brown trousers, sturdy leather boots, strong arms, short reddish beard, ' + GEO,
   t=TEX + ', the tunic is pure flat cyan, long brown leather apron, off-white linen coif, brown trousers, brown boots, warm skin, short reddish beard', a=[0, 128, 237, 276, 342, 298, 178]),
 'geistlicher': dict(h=1.72, p='medieval Benedictine monk around the year 1194, ankle-length loose habit robe with wide sleeves in flat cyan colour, the hood lies on the shoulders, simple off-white rope belt, tonsured head with a ring of brown hair, leather sandals, calm friendly face, ' + GEO,
   t=TEX + ', the habit robe and hood are pure flat cyan, off-white rope belt, brown leather sandals, warm skin, tonsure with a ring of brown hair', a=[0, 365, 290, 313, 178]),
 'soldat': dict(h=1.8, p='medieval Anglo-Norman foot soldier around the year 1194, conical iron helmet with a nose guard, knee-length quilted off-white gambeson with long sleeves, over it a sleeveless knee-length tunic in flat cyan colour, brown trousers, leather boots, brown leather belt, short beard, determined face, ' + GEO,
   t=TEX + ', grey iron conical helmet with nose guard, off-white quilted gambeson sleeves and skirt, the sleeveless tunic is pure flat cyan, brown trousers, brown leather boots and belt, warm skin, short dark beard', a=[0, 219, 178, 224, 342, 298, 189],
   re={'gambeson': TEX + ', grey iron conical helmet with nose guard, the sleeveless knee-length tunic worn over the armour is pure flat cyan and covers the whole chest, belly and the skirt down to the knees, the long sleeves are off-white quilted gambeson, brown trousers, brown leather boots and belt, warm skin, short dark beard',
       'leder': TEX + ', grey iron conical helmet with nose guard, the long sleeves and the skirt below the tunic are brown boiled leather with visible stitching and iron rivets, the sleeveless tunic is pure flat cyan, brown trousers, brown leather boots and belt, warm skin, short dark beard',
       'kette': TEX + ', grey iron conical helmet with nose guard over a grey chainmail coif, the long sleeves and the skirt below the tunic are grey steel chainmail drawn as a fine ring pattern, the sleeveless tunic is pure flat cyan, brown trousers, brown leather boots and belt, warm skin, short dark beard',
       'schuppe': TEX + ', grey iron conical helmet with nose guard, the long sleeves and the skirt below the tunic are overlapping polished steel scales riveted on leather, the sleeveless tunic is pure flat cyan, brown trousers, brown leather boots and belt, warm skin, short dark beard'}),
 'bettler': dict(h=1.7, p='medieval beggar around the year 1194, ragged patched hooded cloak in flat cyan colour with the hood up, torn knee-length off-white tunic, bare legs, rag-wrapped feet, unkempt grey beard, thin tired face, ' + GEO,
   t='hand-painted stylized game texture, clear flat colour areas, soft painterly shading, the ragged hooded cloak is pure flat cyan with a few darker patches, torn grey-white tunic, rag-wrapped feet, weathered skin, unkempt grey beard', a=[0, 363, 553, 178, 298]),
 'jaeger': dict(h=1.78, p='medieval English forester and hunter around the year 1194, short shoulder cape with a hood in flat cyan colour, the hood down, knee-length brown leather jerkin, brown hose, tall soft leather boots, leather belt with a hunting knife, a quiver of arrows on the back, short brown beard, ' + GEO,
   t=TEX + ', the hooded shoulder cape is pure flat cyan, brown leather jerkin, brown hose, brown boots, quiver with arrows, warm skin, brown hair and short beard', a=[0, 224, 559, 219, 178, 342]),
 'ritterin': dict(h=1.7, p='medieval Anglo-Norman noblewoman warrior around the year 1190, knee-length black wool tunic with long sleeves and a narrow embroidered gold trim at neck, cuffs and hem, black hose, tall dark brown leather boots, brown leather belt with a small buckle, long dark brown hair tied back in a single braid, proud determined face, ' + GEO,
   t=TEX + ', knee-length deep black wool tunic with a narrow embroidered gold trim at the collar, cuffs and hem, black hose, dark brown leather boots, brown leather belt with a brass buckle, warm skin, long dark brown braided hair', a=[0, 219, 178, 189, 298],
   re={'gambeson': 'hand-painted stylized game texture, clear flat colour areas: the knee-length coat is a thick quilted padded gambeson of off-white undyed linen with vertical stitched quilting lines, long padded sleeves, brown leather belt, black hose, dark brown leather boots, warm skin, long dark brown braided hair, soft painterly shading, no dirt',
       'leder': TEX + ', the knee-length coat is a brown boiled-leather jerkin with visible stitching, leather laces and small iron rivets on the chest, the long sleeves are of black wool, brown leather belt with brass buckle, black hose, dark brown leather boots, warm skin, long dark brown braided hair',
       'kette': TEX + ', a knee-length grey steel chainmail hauberk with long mail sleeves and a mail coif covering the head, neck and hair so that only the face is visible, the rings drawn as a fine grey pattern, brown leather belt, black hose, dark brown leather boots, warm skin',
       'schuppe': TEX + ', a knee-length coat of overlapping polished steel scales (scale armour) riveted on brown leather, long sleeves of black wool, brown leather belt, black hose, dark brown leather boots, warm skin, long dark brown braided hair',
       'ritter': TEX + ', a crusader knight: knee-length grey chainmail hauberk with long mail sleeves and mail mittens, a mail coif covering the head and hair, mail chausses on the legs, over the mail a sleeveless knee-length surcoat in pure flat cyan colour without any pattern, brown leather sword belt, dark leather shoes'}),
}
# Bauer: vorhandenes Skelett, nur weitere Bewegungen
BAUER_RIG = '01a217a5-a18d-7763-8af9-0732d6c35c34'
BAUER_ANIM = [128, 342, 363, 298, 313, 283, 237]
only = sys.argv[2:] or list(M)

def poll(kind, path, key):
    # wartet auf alle offenen Aufträge dieser Art
    while True:
        open_ = [(n, s) for n, s in st.items() if kind in s and s[kind].get('status') not in ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED')]
        if not open_: return
        for n, s in open_:
            d = req(f'{path}/{s[kind]["id"]}')
            if d.get('status') != s[kind].get('status'): log(n, kind, d.get('status'), d.get('progress'), d.get('task_error') or '')
            s[kind] = {'id': s[kind]['id'], 'status': d.get('status'), 'd': d}
        save(); time.sleep(12)

def stage(kind, path, make):
    for n in only:
        s = st.setdefault(n, {})
        for k, body in make(n, s):
            if k in s and s[k].get('status') not in ('FAILED', 'CANCELED', 'EXPIRED'): continue
            r = req(path, body); s[k] = {'id': r['result'], 'status': 'PENDING'}; log(n, k, 'gestartet', r['result']); save()

# 1 Vorschau
stage('preview', '/openapi/v2/text-to-3d', lambda n, s: [('preview', dict(mode='preview', prompt=M[n]['p'], ai_model='meshy-6', pose_mode='a-pose', should_remesh=True, target_polycount=12000, topology='triangle'))] if n in M else [])
poll('preview', '/openapi/v2/text-to-3d', 'preview')
# 2 Bemalung
stage('refine', '/openapi/v2/text-to-3d', lambda n, s: [('refine', dict(mode='refine', preview_task_id=s['preview']['id'], enable_pbr=False, texture_prompt=M[n]['t']))] if n in M and s.get('preview', {}).get('status') == 'SUCCEEDED' else [])
poll('refine', '/openapi/v2/text-to-3d', 'refine')
for n in only:
    if n not in M: continue
    s = st[n]; os.makedirs(os.path.join(D, n), exist_ok=True)
    if s.get('refine', {}).get('status') != 'SUCCEEDED': log(n, 'Bemalung fehlt'); continue
    d = s['refine']['d']
    if not os.path.exists(os.path.join(D, n, 'bemalt.png')):
        get(d['thumbnail_url'], os.path.join(D, n, 'bemalt.png'))
        tex = (d.get('texture_urls') or [{}])[0].get('base_color')
        if tex: get(tex, os.path.join(D, n, 'farbe.png'))
        log(n, 'Bemalung geladen')
# 3 Neubemalungen und Skelett
def re_make(n, s):
    if n not in M or s.get('refine', {}).get('status') != 'SUCCEEDED': return []
    out = [(f're_{v}', dict(input_task_id=s['refine']['id'], enable_original_uv=True, enable_pbr=False, text_style_prompt=p)) for v, p in M[n].get('re', {}).items()]
    return out
for n in only:
    s = st.get(n, {})
    for k, body in re_make(n, s):
        if k in s and s[k].get('status') not in ('FAILED', 'CANCELED', 'EXPIRED'): continue
        r = req('/openapi/v1/retexture', body); s[k] = {'id': r['result'], 'status': 'PENDING'}; log(n, k, 'gestartet'); save()
    if n in M and s.get('refine', {}).get('status') == 'SUCCEEDED' and ('rig' not in s or s['rig'].get('status') in ('FAILED', 'CANCELED')):
        r = req('/openapi/v1/rigging', dict(input_task_id=s['refine']['id'], height_meters=M[n]['h'])); s['rig'] = {'id': r['result'], 'status': 'PENDING'}; log(n, 'Skelett gestartet'); save()
# warten auf Neubemalungen (jede eigene Art) und Skelette
while True:
    pend = [(n, k) for n in only for k, v in st.get(n, {}).items() if (k.startswith('re_') or k == 'rig') and v.get('status') not in ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED')]
    if not pend: break
    for n, k in pend:
        path = '/openapi/v1/rigging' if k == 'rig' else '/openapi/v1/retexture'
        d = req(f'{path}/{st[n][k]["id"]}')
        if d.get('status') != st[n][k].get('status'): log(n, k, d.get('status'), d.get('task_error') or '')
        st[n][k] = {'id': st[n][k]['id'], 'status': d.get('status'), 'd': d}
    save(); time.sleep(12)
for n in only:
    s = st.get(n, {})
    for k, v in s.items():
        if k.startswith('re_') and v.get('status') == 'SUCCEEDED':
            f = os.path.join(D, n, f'{k[3:]}_farbe.png')
            if not os.path.exists(f):
                tex = (v['d'].get('texture_urls') or [{}])[0].get('base_color')
                if tex: get(tex, f); get(v['d']['thumbnail_url'], os.path.join(D, n, f'{k[3:]}_bild.png')); log(n, k, 'geladen')
                else: log(n, k, 'keine Textur-URL')
    if s.get('rig', {}).get('status') == 'SUCCEEDED' and not os.path.exists(os.path.join(D, n, 'rig.glb')):
        r = s['rig']['d']['result']; get(r['rigged_character_glb_url'], os.path.join(D, n, 'rig.glb'))
        ba = r.get('basic_animations', {})
        for k in ('walking', 'running'):
            if ba.get(f'{k}_glb_url'): get(ba[f'{k}_glb_url'], os.path.join(D, n, f'{k}.glb'))
        log(n, 'Skelett geladen')
# 4 Bewegungen
if 'bauer' in only or not sys.argv[2:]:
    s = st.setdefault('bauer', {})
    if 'anim' not in s or s['anim'].get('status') in ('FAILED', 'CANCELED'):
        r = req('/openapi/v1/animations', dict(rig_task_id=BAUER_RIG, action_ids=BAUER_ANIM)); s['anim'] = {'id': r['result'], 'status': 'PENDING'}; log('bauer Bewegungen gestartet'); save()
for n in only:
    s = st.get(n, {})
    if n in M and s.get('rig', {}).get('status') == 'SUCCEEDED' and ('anim' not in s or s['anim'].get('status') in ('FAILED', 'CANCELED')):
        r = req('/openapi/v1/animations', dict(rig_task_id=s['rig']['id'], action_ids=M[n]['a'])); s['anim'] = {'id': r['result'], 'status': 'PENDING'}; log(n, 'Bewegungen gestartet'); save()
poll('anim', '/openapi/v1/animations', 'anim')
for n, s in st.items():
    if s.get('anim', {}).get('status') == 'SUCCEEDED':
        os.makedirs(os.path.join(D, n), exist_ok=True)
        f = os.path.join(D, n, 'aktionen.glb')
        if not os.path.exists(f):
            r = s['anim']['d'].get('result') or {}
            url = r.get('animation_glb_url')
            if url: get(url, f); log(n, 'Bewegungen geladen')
            else: log(n, 'keine Bewegungs-URL', list(r))
print('ALLES FERTIG', flush=True)
