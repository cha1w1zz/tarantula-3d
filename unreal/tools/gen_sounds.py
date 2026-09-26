# Procedural sounds like js/sound.js (no recordings): writes 16-bit mono WAVs into Content/Game/Sound; the editor
# auto-imports them as SoundWave assets. python gen_sounds.py
import math, os, random, struct, wave
R = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'TarantulaUE', 'Content', 'Game', 'Sound')
os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)


def save(name, xs):
    peak = max(1e-6, max(abs(x) for x in xs))
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(R)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x / peak * 0.9)) * 32767)) for x in xs))
    print(name, len(xs) / R, 's')


def lowpass(xs, a):
    y, out = 0.0, []
    for x in xs: y += a * (x - y); out.append(y)
    return out


def loopfade(xs, n=2000):          # crossfade the end into the start so the loop has no click
    for i in range(n):
        t = i / n; xs[i] = xs[i] * t + xs[len(xs) - n + i] * (1 - t)
    return xs[:len(xs) - n]


# room: brown-noise rumble + faint 50 Hz mains hum + slow wind swell (8 s loop)
N = R * 8
brown, b = [], 0.0
for i in range(N): b = (b + rnd.uniform(-1, 1) * 0.02) * 0.998; brown.append(b)
wind = lowpass([rnd.uniform(-1, 1) for _ in range(N)], 0.03)
save('S_Room', loopfade([brown[i] * 3 + 0.05 * math.sin(2 * math.pi * 50 * i / R) + 0.02 * math.sin(2 * math.pi * 100 * i / R)
                         + wind[i] * 0.6 * (0.5 + 0.5 * math.sin(2 * math.pi * i / N)) for i in range(N)]))
# footstep: soft noise tap + low thump (pitch lowered in game for a big spider)
N = int(R * 0.09)
save('S_Step', [(rnd.uniform(-1, 1) * 0.5 * math.exp(-i / (R * 0.008)) + math.sin(2 * math.pi * 90 * i / R) * math.exp(-i / (R * 0.025))) for i in range(N)])
# rotor: noise chopped at the blade rate (13 Hz) + low engine tone (2 s loop, whole number of chops)
N = R * 2
nz = lowpass([rnd.uniform(-1, 1) for _ in range(N)], 0.25)
save('S_Rotor', loopfade([nz[i] * (0.25 + 0.75 * max(0, math.sin(2 * math.pi * 13 * i / R)) ** 6) + 0.3 * math.sin(2 * math.pi * 62 * i / R) for i in range(N)], 400))
# crunch while eating: a few dry clicks
N = int(R * 0.35)
xs = [0.0] * N
for k in range(7):
    s0 = rnd.randint(0, N - 800)
    for i in range(700): xs[s0 + i] += rnd.uniform(-1, 1) * math.exp(-i / 120)
save('S_Crunch', lowpass(xs, 0.5))
# cricket chirp (4.6 kHz pulses in 3 syllables)
N = int(R * 0.45)
save('S_Chirp', [math.sin(2 * math.pi * 4600 * i / R) * (1 if (i / R) % 0.15 < 0.09 and int((i / R) / 0.015) % 2 == 0 else 0) for i in range(N)])
