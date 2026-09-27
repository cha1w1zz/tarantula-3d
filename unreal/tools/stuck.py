# PIE stuck detector: python stuck.py <secs>  -> prints moments the spider wants to walk but doesn't move for 3 s
import sys, time, json; sys.stdout.reconfigure(encoding='utf-8')
from pie import get, loc
T = float(sys.argv[1]); t0 = time.time(); hist = []; stuck = 0; last = None
while time.time() - t0 < T:
    l = loc('Spider')['location']; v = get('Spider', ['Speed', 'PauseT', 'Target', 'Eating', 'Hunting', 'Span', 'Blocked'])
    t = time.time() - t0; hist.append((t, l))
    walk = not v['Eating'] and v['PauseT'] <= 0 and ((v['Target']['x'] - l['x']) ** 2 + (v['Target']['y'] - l['y']) ** 2) ** .5 > v['Span'] * .5
    old = [h for h in hist if t - h[0] >= 3.0]
    if walk and old:
        o = old[-1][1]; d = ((o['x'] - l['x']) ** 2 + (o['y'] - l['y']) ** 2) ** .5
        if d < 30:
            stuck += 1
            print('%5.0f STUCK at (%.0f, %.0f, %.0f) tgt (%.0f, %.0f) speed %.0f hunt %s blk %s' % (t, l['x'], l['y'], l['z'], v['Target']['x'], v['Target']['y'], v['Speed'], v['Hunting'], v['Blocked']), flush=True)
    if int(t) % 30 == 0 and (last is None or int(t) != last): last = int(t); print('%5.0f at (%.0f, %.0f, %.0f)' % (t, l['x'], l['y'], l['z']), flush=True)
    time.sleep(1.0)
print('stuck samples', stuck)
