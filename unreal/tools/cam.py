# while playing (PIE): python cam.py <dist cm> [pitch] [yaw]  -> keeper camera follows the spider at that distance
import sys, json
from ue import call
K = {'refPath': '/Game/UEDPIE_0_SpiderTest.SpiderTest:PersistentLevel.BP_Keeper_C_0'}
v = {'Follow': True, 'Dist': float(sys.argv[1])}
if len(sys.argv) > 2: v['Pitch'] = float(sys.argv[2])
if len(sys.argv) > 3: v['Yaw'] = float(sys.argv[3])
print(call('editor_toolset.toolsets.object.ObjectTools', 'set_properties', {'instance': K, 'values': json.dumps(v)}))
