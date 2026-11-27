# Gegenstände (Schilde, Lanze, Werkzeuge, Waren) als 3D-Modelle bei Meshy: je Gegenstand drei Vorlagen (vorne, seite,
# hinten, 1280 × 1280, transparent) -> Multi-Image-to-3D mit Textur. Ergebnis: <arbeitsordner>/<name>.glb und _bild.png,
# Zustand in <arbeitsordner>/auftraege.json (ein zweiter Aufruf setzt fort, ohne erneut zu bezahlen).
# Aufruf: python3 -I tools/meshy_gegenstaende.py <vorlagen-ordner> <arbeitsordner> [name ...]
# Der Vorlagen-Ordner enthält ausruestung/, werkzeuge/, waren/ (auch verteilt auf mehrere Teil-Ordner darunter).
# Der API-Schlüssel kommt nicht aus diesem Skript, sondern über den Netzwerk-Proxy der Umgebung.
import json, os, sys, time, base64, glob, urllib.request, urllib.error
SRC, D = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]); os.makedirs(D, exist_ok=True)
STATE = os.path.join(D, 'auftraege.json')
st = json.load(open(STATE)) if os.path.exists(STATE) else {}
def save(): json.dump(st, open(STATE, 'w'), indent=1)
def log(*a): print(time.strftime('%H:%M:%S'), *a, flush=True)
def req(path, body=None):
    for k in range(4):
        try:
            r = urllib.request.Request('https://api.meshy.ai' + path, data=json.dumps(body).encode() if body is not None else None,
                                       headers={'Content-Type': 'application/json'}, method='POST' if body is not None else 'GET')
            with urllib.request.urlopen(r, timeout=120) as rr: return json.loads(rr.read())
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
def uri(f): return 'data:image/png;base64,' + base64.b64encode(open(f, 'rb').read()).decode()

# Vorlagen finden: name -> [vorne, seite, hinten]
views = {}
for f in glob.glob(os.path.join(SRC, '**', '*_vorne.png'), recursive=True):
    n = os.path.basename(f)[:-len('_vorne.png')]
    fs = [f, f.replace('_vorne.png', '_seite.png'), f.replace('_vorne.png', '_hinten.png')]
    if all(os.path.exists(x) for x in fs): views[n] = fs
only = sys.argv[3:] or sorted(views)
for n in only:
    s = st.get(n)
    if not s or s.get('status') in ('FAILED', 'CANCELED', 'EXPIRED'):
        body = dict(image_urls=[uri(x) for x in views[n]], ai_model='latest', should_texture=True, enable_pbr=False,
                    should_remesh=True, topology='triangle', target_polycount=12000, symmetry_mode='auto')
        r = req('/openapi/v1/multi-image-to-3d', body)
        st[n] = {'id': r['result'], 'status': 'PENDING'}; save(); log(n, 'gestartet', r['result'])
while True:
    pend = [n for n in only if st[n].get('status') not in ('SUCCEEDED', 'FAILED', 'CANCELED', 'EXPIRED')]
    if not pend: break
    for n in pend:
        d = req(f'/openapi/v1/multi-image-to-3d/{st[n]["id"]}')
        if d.get('status') != st[n].get('status'): log(n, d.get('status'), d.get('progress'), (d.get('task_error') or {}).get('message', '') if isinstance(d.get('task_error'), dict) else '')
        st[n] = {'id': st[n]['id'], 'status': d.get('status'), 'd': d}
    save(); time.sleep(15)
for n in only:
    s = st[n]
    if s.get('status') != 'SUCCEEDED': log(n, s.get('status')); continue
    out = os.path.join(D, f'{n}.glb')
    if not os.path.exists(out):
        u = (s['d'].get('model_urls') or {}).get('glb')
        if u: get(u, out); log(n, 'geladen')
        if s['d'].get('thumbnail_url'): get(s['d']['thumbnail_url'], os.path.join(D, f'{n}_bild.png'))
log('fertig')
