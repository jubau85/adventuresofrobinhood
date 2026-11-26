# Macht aus gelieferten Musik- und Geräuschdateien spielfertige MP3s (braucht ffmpeg und numpy).
#
#   python3 tools/ton.py schleife <quelle> <ziel.mp3> [--tiefpass 15000] [--blende 3] [--kbit 96]
#       Hintergrund: nahtlose Schleife. Die letzten Sekunden werden in den Anfang übergeblendet,
#       wahlweise vorher bei 15 kHz beschnitten (gleicht Stücke an, die aus Teilen zusammengesetzt sind).
#   python3 tools/ton.py stueck <quelle> <ziel.mp3> [--kbit 128]
#       Musik zum einmaligen Abspielen: Stille am Anfang und Ende weg, kurz ein- und ausgeblendet.
#
# Lautstärke bleibt wie geliefert (Sound-Brief: Musik −16 LUFS, Hintergrund −22 LUFS).

import subprocess, sys
import numpy as np

SR = 44100

def lesen(pfad, tiefpass=None):
    af = ['-af', f'lowpass=f={tiefpass}:poles=2'] if tiefpass else []
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', pfad, *af, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()

def schreiben(x, pfad, kbit):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', f'{kbit}k', pfad], input=x.astype(np.float32).tobytes(), check=True)

def opt(name, default):
    return type(default)(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default

art, quelle, ziel = sys.argv[1:4]
if art == 'schleife':
    x = lesen(quelle, opt('--tiefpass', 15000) or None)
    d = int(opt('--blende', 3.0) * SR)
    # Gleiche Leistung beim Überblenden (Kosinus), damit es in der Mitte nicht leiser wird
    t = np.linspace(0, np.pi / 2, d, dtype=np.float32)[:, None]
    y = x[d:].copy()
    y[-d:] = x[-d:] * np.cos(t) + x[:d] * np.sin(t)
    schreiben(y, ziel, opt('--kbit', 96))
    print(f'{ziel}: Schleife {len(y) / SR:.1f} s, Überblendung {d / SR:.1f} s')
elif art == 'stueck':
    x = lesen(quelle)
    laut = np.abs(x).max(axis=1)
    an = np.nonzero(laut > 10 ** (-50 / 20))[0]
    a, b = (an[0], an[-1] + 1) if len(an) else (0, len(x))
    y = x[a:b].copy()
    ein, aus = int(0.05 * SR), int(0.8 * SR)
    y[:ein] *= np.linspace(0, 1, ein, dtype=np.float32)[:, None]
    y[-aus:] *= np.linspace(1, 0, aus, dtype=np.float32)[:, None]
    schreiben(y, ziel, opt('--kbit', 128))
    print(f'{ziel}: {len(y) / SR:.1f} s (vorher {len(x) / SR:.1f} s)')
else:
    sys.exit('Art: schleife oder stueck')
