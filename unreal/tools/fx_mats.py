# shader-like materials the .glb could not carry (js/pond.js, world.js gpuWind, webs.js): python fx_mats.py [water] [wind] [web]
# (no args = all). Each material is deleted + rebuilt, which breaks what points at it: rerun level_setup.py (water, wind) / webs_import.py (web) after.
# M_Water: murky pond, three slow crossing wave trains (pond.js pondWave) as the normal, glossy
import sys; sys.stdout.reconfigure(encoding='utf-8')
from mat import material
WANT = sys.argv[1:] or ['water', 'wind', 'web']

WAVE = '''float2 p = P.xy / 100.0; float T = P.z, S = 0.12; float2 g = 0;
g += float2(.9, .4) * cos(dot(p, float2(.9, .4)) * 1.7 + T * 1.1) * .5;
g += float2(-.3, .95) * cos(dot(p, float2(-.3, .95)) * 2.6 - T * 1.4) * .35;
g += float2(.7, -.7) * cos(dot(p, float2(.7, -.7)) * 4.3 + T * 2.0) * .2;
return normalize(float3(-g.x * S, -g.y * S, 1.0));'''

if 'water' in WANT:
    material('/Game/Game/Mat/M_Water', {
        'wp': ('WorldPosition', None),
        'time': ('Time', None),
        'xy': ('ComponentMask', {'R': True, 'G': True, 'B': False, 'A': False}),
        'pt': ('AppendVector', None),   # one Custom input (x, y, time): the MCP can't grow a Custom node's Inputs array
        'wave': ('Custom', {'Code': WAVE, 'OutputType': 'CMOT_Float3', 'Description': 'PondWave', 'Inputs': [{'InputName': 'P'}]}),
        'col': ('Constant3Vector', {'Constant': {'R': 0.010, 'G': 0.016, 'B': 0.012, 'A': 1}}),
        'rough': ('Constant', {'R': 0.06}),
        'spec': ('Constant', {'R': 0.8}),
        'uv': ('TextureCoordinate', None),   # disc uv: centre .5 → like pond.js' radial alpha map, thin at the shore
        'fade': ('Custom', {'Code': 'float d = length(P.xy - 0.5); return lerp(0.93, 0.0, smoothstep(0.3, 0.5, d));', 'OutputType': 'CMOT_Float1',
                            'Description': 'ShoreFade', 'Inputs': [{'InputName': 'P'}]}),
    }, [('wp', '', 'xy', ''), ('xy', '', 'pt', 'A'), ('time', '', 'pt', 'B'), ('pt', '', 'wave', 'P'), ('uv', '', 'fade', 'P')],
       {'MP_BaseColor': ('col', ''), 'MP_Normal': ('wave', ''), 'MP_Roughness': ('rough', ''), 'MP_Specular': ('spec', ''), 'MP_Opacity': ('fade', '')},
       {'BlendMode': 'BLEND_Translucent', 'TranslucencyLightingMode': 'TLM_SurfacePerPixelLighting'})
    print('M_Water ok')

# plants sway in the wind (world.js bendable gpuWind): copy of the glTF M_Default + world position offset.
# P = (world x, world y, time, uv v); UE flips glTF v, so the blade tip is v = 0. Offset in cm along game wind (.82, .57) = UE (x, y).
WIND = '''float2 ip = P.xy / 100.0; float t = P.z; float f = saturate(1.0 - P.w);
float gust = sin(dot(ip, float2(.19, .13)) - t * 1.7) * .55 + sin(dot(ip, float2(-.09, .27)) * 1.6 - t * 2.6) * .25
           + sin(ip.x * 1.9 + ip.y * 2.3 - t * 4.1) * .08 + .45;
float wk = f * f * gust * 9.0;
return float3(.82 * wk, .57 * wk, -wk * wk * .02);'''
if 'wind' in WANT:
    material('/Game/Game/Mat/M_DefaultWind', {
        'wp': ('WorldPosition', None), 'time': ('Time', None), 'uv': ('TextureCoordinate', None),
        'xy': ('ComponentMask', {'R': True, 'G': True, 'B': False, 'A': False}),
        'v': ('ComponentMask', {'R': False, 'G': True, 'B': False, 'A': False}),
        'pt': ('AppendVector', None), 'ptv': ('AppendVector', None),
        'wind': ('Custom', {'Code': WIND, 'OutputType': 'CMOT_Float3', 'Description': 'Wind', 'Inputs': [{'InputName': 'P'}]}),
    }, [('wp', '', 'xy', ''), ('xy', '', 'pt', 'A'), ('time', '', 'pt', 'B'), ('uv', '', 'v', ''), ('pt', '', 'ptv', 'A'), ('v', '', 'ptv', 'B'), ('ptv', '', 'wind', 'P')],
       {'MP_WorldPositionOffset': ('wind', '')}, base='/InterchangeAssets/gltf/M_Default')
    # glTF instance variants (blend mode / two-sided overrides) re-rooted on the wind material; level_setup.py re-parents the plant materials
    AT = 'editor_toolset.toolsets.asset.AssetTools'; O = 'editor_toolset.toolsets.object.ObjectTools'
    from ue import call
    import json
    for v in ('Opaque', 'Opaque_DS', 'Mask', 'Mask_DS'):
        dst = '/Game/Game/Mat/MI_Wind_' + v
        call(AT, 'delete', {'path': dst})
        call(AT, 'duplicate', {'path': '/InterchangeAssets/gltf/MaterialInstances/MI_Default_' + v, 'new_path': dst})
        print(v, call(O, 'set_properties', {'instance': {'refPath': dst + '.MI_Wind_' + v}, 'values': json.dumps({'Parent': '/Game/Game/Mat/M_DefaultWind.M_DefaultWind'})}))
    call(AT, 'save_assets', {'asset_paths': []})
    print('wind ok')

# spider webs (webs.js): additive silk, unlit; Glow = thread / film brightness (instances in webs_import.py)
if 'web' in WANT:
    material('/Game/Game/Mat/M_Web', {
        'glow': ('ScalarParameter', {'ParameterName': 'Glow', 'DefaultValue': 0.4}),
        'col': ('Constant3Vector', {'Constant': {'R': 0.85, 'G': 0.88, 'B': 0.95, 'A': 1}}),
        'mul': ('Multiply', None),
    }, [('col', '', 'mul', 'A'), ('glow', '', 'mul', 'B')], {'MP_EmissiveColor': ('mul', '')},
       {'BlendMode': 'BLEND_Additive', 'ShadingModel': 'MSM_Unlit', 'TwoSided': True})
    print('M_Web ok')
