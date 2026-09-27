# PIE helpers: python pie.py start | stop | nocard | shot <png> | get <Actor> <prop,...> | set <Actor> '<json>' | watch <secs> [step]
# Actor = Keeper | Spider | Heli1 ... (first PIE actor whose name starts with BP_<Actor>, or a full refPath)
import sys, json, time; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
E = 'EditorToolset.EditorAppToolset'; O = 'editor_toolset.toolsets.object.ObjectTools'; S = 'editor_toolset.toolsets.scene.SceneTools'
LV = '/Game/UEDPIE_0_SpiderTest.SpiderTest:PersistentLevel.'
NAMES = {'Keeper': 'BP_Keeper_C_0'}


def actor(n):
    if n.startswith('/'): return {'refPath': n}
    if n in NAMES: return {'refPath': LV + NAMES[n]}
    r = call(O, 'get_properties', {'instance': {'refPath': LV + 'BP_Keeper_C_0'}, 'properties': [n]})
    try: return json.loads(r)[n]
    except Exception: raise SystemExit('no actor ' + n + ': ' + r[:200])


def get(n, props): return json.loads(call(O, 'get_properties', {'instance': actor(n), 'properties': props}))


def loc(n): return json.loads(call('editor_toolset.toolsets.actor.ActorTools', 'get_actor_transform', {'actor': actor(n)}))


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'start': print(call(E, 'StartPIE', {'options': {'warmupSeconds': 3}}))
    elif a[0] == 'stop': print(call(E, 'StopPIE', {}))
    elif a[0] == 'get': print(json.dumps(get(a[1], a[2].split(',')), ensure_ascii=False))
    elif a[0] == 'set': print(call(O, 'set_properties', {'instance': actor(a[1]), 'values': a[2]}))
    elif a[0] == 'nocard':   # hide the start card (screenshots)
        h = get('Keeper', ['HUD'])['HUD']; b = json.loads(call(O, 'get_properties', {'instance': h, 'properties': ['StartBox']}))['StartBox']
        print(call(O, 'set_properties', {'instance': b, 'values': json.dumps({'Visibility': 'Collapsed'})}))
    elif a[0] == 'shot':   # python pie.py shot out.png: editor capture cropped to the game viewport
        import re, base64, io
        r = call(E, 'CaptureEditorImage', {}); m = re.search(r'"data": "([^"]+)"', r)
        open(a[1], 'wb').write(base64.b64decode(m.group(1))); print('saved', a[1])
    elif a[0] == 'loc': print(json.dumps(loc(a[1])))
    elif a[0] == 'watch':
        T, st = float(a[1]), float(a[2]) if len(a) > 2 else 5.0
        t0 = time.time()
        while time.time() - t0 < T:
            l = loc('Spider')['location']; v = get('Spider', ['Speed', 'PauseT', 'HasTarget', 'Target', 'Blocked', 'Hunting'])
            print('%5.0f  x%7.0f y%7.0f z%6.0f  sp%5.0f pause%5.1f blk %s tgt (%.0f, %.0f) hunt %s' % (time.time() - t0, l['x'], l['y'], l['z'], v['Speed'], v['PauseT'], v['Blocked'], v['Target']['x'], v['Target']['y'], v['Hunting']), flush=True)
            time.sleep(st)
