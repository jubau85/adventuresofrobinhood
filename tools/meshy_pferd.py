# Erzeugt das Pferd bei Meshy: Vorschau (Form) -> Bemalung (Fell, Mähne, Schweif, Hufe). Ohne Sattel und Zaumzeug:
# Sattel, Decke und Schabracke setzt tools/pferd.py dazu, das Skelett und die Gangarten auch.
# Aufruf: python3 tools/meshy_pferd.py <arbeitsordner>
# Zustand in <arbeitsordner>/auftraege.json, Ergebnis <arbeitsordner>/pferd_meshy.glb, farbe.png, bild.png.
# Der API-Schlüssel kommt nicht aus diesem Skript, sondern über den Netzwerk-Proxy der Umgebung.
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

FORM = ('a medieval riding horse, a sturdy palfrey around the year 1190, standing still on all four legs in a neutral side pose, '
        'all four legs straight and vertical, front legs together and hind legs together, head and neck raised naturally, '
        'tail hanging down, realistic anatomy and proportions, well-defined muscles, no saddle, no bridle, no reins, no rider, '
        'full body, game asset')
FELL = ('hand-painted detailed horse texture, warm bay brown coat with soft painterly shading on the muscles, lighter belly '
        'and muzzle, darker shoulders and hindquarters, black mane, black tail, black lower legs below the knees, dark grey '
        'hooves, dark eyes, short glossy coat hair, no saddle, no tack, no dirt')

def run(kind, path, body):
    s = st.get(kind)
    if not s or s.get('status') in ('FAILED', 'CANCELED', 'EXPIRED'):
        r = req(path, body); st[kind] = s = {'id': r['result'], 'status': 'PENDING'}; save(); log(kind, 'gestartet', r['result'])
    while s.get('status') not in ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED'):
        time.sleep(12)
        d = req(f'{path}/{s["id"]}')
        if d.get('status') != s.get('status') or d.get('progress') != s.get('progress'): log(kind, d.get('status'), d.get('progress'), d.get('task_error') or '')
        st[kind] = s = {'id': s['id'], 'status': d.get('status'), 'progress': d.get('progress'), 'd': d}; save()
    if s['status'] != 'SUCCEEDED': raise SystemExit(f'{kind} {s["status"]}')
    return s['d']

pv = run('preview', '/openapi/v2/text-to-3d', dict(mode='preview', prompt=FORM, ai_model='meshy-6', should_remesh=True,
                                                    target_polycount=30000, topology='triangle', symmetry_mode='on'))
if not os.path.exists(os.path.join(D, 'vorschau.png')): get(pv['thumbnail_url'], os.path.join(D, 'vorschau.png'))
rf = run('refine', '/openapi/v2/text-to-3d', dict(mode='refine', preview_task_id=st['preview']['id'], enable_pbr=False, texture_prompt=FELL))
if not os.path.exists(os.path.join(D, 'pferd_meshy.glb')):
    get(rf['model_urls']['glb'], os.path.join(D, 'pferd_meshy.glb'))
    get(rf['thumbnail_url'], os.path.join(D, 'bild.png'))
    tex = (rf.get('texture_urls') or [{}])[0].get('base_color')
    if tex: get(tex, os.path.join(D, 'farbe.png'))
log('fertig', os.path.join(D, 'pferd_meshy.glb'))
