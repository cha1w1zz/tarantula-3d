# colour materials for Blueprint-built bodies: MI_<name> in /Game/Game/Mat, parent = glTF default opaque (param BaseColorFactor)
import sys; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
MT = 'editor_toolset.toolsets.material_instance.MaterialInstanceTools'
PARENT = {'refPath': '/InterchangeAssets/gltf/MaterialInstances/MI_Default_Opaque.MI_Default_Opaque'}
COLORS = {   # linear rgb, roughness
    'SpiderBody': ((0.035, 0.028, 0.024), 0.75), 'SpiderLeg': ((0.05, 0.04, 0.035), 0.8), 'SpiderAbd': ((0.06, 0.045, 0.035), 0.85),
    'Cricket': ((0.13, 0.07, 0.03), 0.5), 'CricketLeg': ((0.2, 0.12, 0.05), 0.55),
    'Dubia': ((0.08, 0.035, 0.02), 0.35), 'DubiaEdge': ((0.35, 0.18, 0.06), 0.4), 'DubiaLeg': ((0.12, 0.06, 0.03), 0.5),
    'Skin': ((0.55, 0.36, 0.25), 0.6), 'Gown': ((0.45, 0.02, 0.02), 0.7), 'Gold': ((0.8, 0.55, 0.1), 0.35),
    'Shirt': ((0.85, 0.85, 0.85), 0.8), 'Black': ((0.015, 0.015, 0.015), 0.7), 'Hair': ((0.01, 0.008, 0.006), 0.6),
    'School': ((0.8, 0.82, 0.85), 0.8), 'Navy': ((0.02, 0.03, 0.08), 0.7), 'Rice': ((0.9, 0.9, 0.85), 0.9), 'Nori': ((0.01, 0.02, 0.01), 0.6),
    'HeliRed': ((0.5, 0.03, 0.02), 0.35), 'HeliBlue': ((0.02, 0.08, 0.4), 0.35), 'Glass': ((0.02, 0.03, 0.04), 0.1), 'Blood': ((0.25, 0.0, 0.0), 0.2),
    'Silk': ((0.9, 0.9, 0.88), 0.5), 'Shell': ((0.3, 0.22, 0.15), 0.6),
}
for n, (c, r) in COLORS.items():
    ref = {'refPath': '/Game/Game/Mat/MI_%s.MI_%s' % (n, n)}
    if call('editor_toolset.toolsets.object.ObjectTools', 'get_class', {'instance': ref}).startswith('ERROR'):
        call(MT, 'create', {'folder_path': '/Game/Game/Mat', 'asset_name': 'MI_' + n, 'parent': PARENT})
    a = call(MT, 'set_vector_parameter', {'instance': ref, 'name': 'BaseColorFactor', 'value': {'r': c[0], 'g': c[1], 'b': c[2], 'a': 1}})
    b = call(MT, 'set_scalar_parameter', {'instance': ref, 'name': 'RoughnessFactor', 'value': r})
    call(MT, 'set_scalar_parameter', {'instance': ref, 'name': 'MetallicFactor', 'value': 0.0})
    print(n, a.strip()[:60], b.strip()[:60])
