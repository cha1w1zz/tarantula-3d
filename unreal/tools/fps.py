# python fps.py [tag]: average keeper FPS over 3 fixed views (noon, TimeMul 0) in PIE; saves <tag>_v<i>.png in the scratchpad if a tag is given
import sys, json, time, os; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
from pie import actor, get
O = 'editor_toolset.toolsets.object.ObjectTools'
K = actor('Keeper')
VIEWS = [({'x': -2300.0, 'y': 900.0, 'z': 250.0}, 1500.0, -18.0, -70.0), ({'x': -1000.0, 'y': 800.0, 'z': 250.0}, 6000.0, -30.0, -90.0),
         ({'x': 0.0, 'y': 0.0, 'z': 300.0}, 16000.0, -35.0, -90.0)]
tot = []
for i, (f, d, p, y) in enumerate(VIEWS):
    call(O, 'set_properties', {'instance': K, 'values': json.dumps({'Hours': 12.0, 'TimeMul': 0.0, 'Follow': False, 'Focus': f, 'Dist': d, 'Pitch': p, 'Yaw': y})})
    time.sleep(4.0); s = []
    for _ in range(8): s.append(get('Keeper', ['Fps'])['Fps']); time.sleep(0.5)
    v = sum(s) / len(s); tot.append(v); print('view %d  fps %.0f' % (i, v), flush=True)
    if len(sys.argv) > 1: os.system('python pie.py shot "%s/%s_v%d.png"' % (os.environ.get('SP', '.'), sys.argv[1], i))
print('mean fps %.1f' % (sum(tot) / len(tot)))
