# while playing (PIE): python cam.py <dist cm> [pitch] [yaw]  -> keeper camera follows the spider at that distance
import sys, json
from ue import call
K = {'refPath': '/Game/UEDPIE_0_SpiderTest.SpiderTest:PersistentLevel.BP_Keeper_C_0'}
a = sys.argv[1:]
if a[0] == 'look':
    v = {'Follow': False, 'Focus': {'x': float(a[1]), 'y': float(a[2]), 'z': float(a[3])}, 'Dist': float(a[4])}; a = a[4:]
else:
    v = {'Follow': True, 'Dist': float(a[0])}
if len(a) > 1: v['Pitch'] = float(a[1])
if len(a) > 2: v['Yaw'] = float(a[2])
print(call('editor_toolset.toolsets.object.ObjectTools', 'set_properties', {'instance': K, 'values': json.dumps(v)}))
# python cam.py look <x> <y> <z> <dist> [pitch] [yaw]: free camera aimed at a point (e.g. a person)
