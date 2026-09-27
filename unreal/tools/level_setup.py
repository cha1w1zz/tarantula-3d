# Prepare the open level (after import_tarantula.py) for play: python level_setup.py
# - removes test floor/rocks and the frozen spider meshes from the .glb (BP_Tarantula replaces them)
# - tags leaves / grass / moss shells "NoWalk" (feet and prey ground traces go through them)
# - places BP_Tarantula in the front-left garden (-2400, 600) with bIsSpatiallyLoaded off
# - sets the level's GameMode to BP_TarantulaGame (keeper pawn + HUD)
import sys, json; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
S = 'editor_toolset.toolsets.scene.SceneTools'; A = 'editor_toolset.toolsets.actor.ActorTools'; O = 'editor_toolset.toolsets.object.ObjectTools'
level = call(S, 'get_current_level', {}).strip().strip('"')
lvl = level + '.' + level.rsplit('/', 1)[1] + ':PersistentLevel'
acts = json.loads(call(S, 'find_actors', {'name': '', 'tag': '', 'collision_channels': []}))
spider = None
NOWALK_PARENTS = ('MI_Default_Mask', 'MI_Default_Mask_DS')
# meshes that came out white (their three.js shaders are not exportable): rocks, pebbles, reeds, pond water
PAINT = {'World_MeshStandardMaterial_39': 'MI_Rock', 'World_MeshStandardMaterial_21': 'MI_Pebble', 'World_MeshStandardMaterial_27': 'MI_Reed',
         'World_MeshLambertMaterial_7': 'M_Water'}   # M_Water / wind materials come from fx_mats.py (run it first)
# plant clumps / ferns that sway: their glTF material instance is re-parented from MI_Default_<v> to MI_Wind_<v>
WIND = ('World_MeshStandardMaterial_8', 'World_MeshStandardMaterial_14', 'World_MeshStandardMaterial_15', 'World_MeshStandardMaterial_16',
        'World_MeshStandardMaterial_47')
for a in acts:
    p = a['refPath']
    if 'BP_Tarantula_C' in p: spider = a
    if 'StaticMeshActor' not in p: continue
    lab = call(A, 'get_label', {'actor': a}).strip().strip('"')
    if lab.startswith('Test') or lab.startswith('Spider_'):
        print('remove', lab, call(S, 'remove_from_scene', {'actor': a}).strip()); continue
    if not lab.startswith('World_'): continue
    if lab in PAINT:
        m = '/Game/Game/Mat/%s.%s' % (PAINT[lab], PAINT[lab])
        print('paint', lab, call(O, 'set_properties', {'instance': {'refPath': p + '.StaticMeshComponent0'}, 'values': json.dumps({'OverrideMaterials': [m]})}).strip())
    mesh = '/Game/Tarantula/tarantula-scene/StaticMeshes/%s.%s' % (lab, lab)
    sm = json.loads(call(O, 'get_properties', {'instance': {'refPath': mesh}, 'properties': ['StaticMaterials']}))
    mat = sm['StaticMaterials'][0]['materialInterface']['refPath']
    par = json.loads(call(O, 'get_properties', {'instance': {'refPath': mat}, 'properties': ['Parent']})).get('Parent', {}).get('refPath', '')
    if lab in WIND and '/MI_Default_' in par:   # a fresh copy re-rooted on the wind material (re-parenting a material in use crashed the RHI)
        v = par.rsplit('MI_Default_', 1)[1].split('.')[0]; w = '/Game/Game/Mat/Wind/MI_W_' + lab
        call('editor_toolset.toolsets.asset.AssetTools', 'delete', {'path': w})
        call('editor_toolset.toolsets.asset.AssetTools', 'duplicate', {'path': mat.split('.')[0], 'new_path': w})
        call(O, 'set_properties', {'instance': {'refPath': w + '.MI_W_' + lab}, 'values': json.dumps({'Parent': '/Game/Game/Mat/MI_Wind_%s.MI_Wind_%s' % (v, v)})})
        print('wind', lab, call(O, 'set_properties', {'instance': {'refPath': p + '.StaticMeshComponent0'}, 'values': json.dumps({'OverrideMaterials': [w + '.MI_W_' + lab]})}).strip())
    vp = json.loads(call(O, 'get_properties', {'instance': {'refPath': mat}, 'properties': ['VectorParameterValues']})).get('VectorParameterValues') or []
    c = vp[0]['parameterValue'] if vp else {'r': 1, 'g': 1, 'b': 1}
    green = c['g'] > c['r'] * 1.3 and c['g'] > c['b'] * 2 and c['g'] < 0.5          # plant clumps (sedges / strap leaves)
    b = json.loads(call(A, 'get_actor_bounds', {'actor': a}))
    litter = par.endswith('MI_Default_Opaque_DS') and b['max']['z'] - b['min']['z'] < 700 and b['max']['x'] - b['min']['x'] > 10000
    if par.rsplit('.', 1)[-1] in NOWALK_PARENTS or green or litter:
        tags = call(A, 'get_tags', {'actor': a})
        if 'NoWalk' not in tags: call(A, 'add_tag', {'actor': a, 'tag': 'NoWalk'})
        print('NoWalk', lab)
# a wooden table under the tank (the template landscape is removed)
if not any(call(A, 'get_label', {'actor': a}).strip().strip('"') == 'Table' for a in acts if 'StaticMeshActor' in a['refPath']):
    t = json.loads(call(S, 'add_to_scene_from_asset', {'asset_path': '/Engine/BasicShapes/Cube', 'name': 'Table',
                                                      'xform': {'location': {'x': 0, 'y': 0, 'z': -260}, 'scale': {'x': 180, 'y': 130, 'z': 1}}}))
    call(A, 'set_label', {'actor': t, 'label': 'Table'})
    print('table', call(O, 'set_properties', {'instance': {'refPath': t['refPath'] + '.StaticMeshComponent0'}, 'values': json.dumps({'OverrideMaterials': ['/Game/Game/Mat/MI_Table.MI_Table']})}))
if not spider:
    spider = json.loads(call(S, 'add_to_scene_from_class', {'actor_type': {'refPath': '/Game/Spider/BP_Tarantula.BP_Tarantula_C'}, 'name': 'Tarantula',
                                                          'xform': {'location': {'x': -2400, 'y': 600, 'z': 300}}}))
call(A, 'set_actor_transform', {'actor': spider, 'xform': {'location': {'x': -2400, 'y': 600, 'z': 300}, 'rotation': {'pitch': 0, 'yaw': -15, 'roll': 0}}})
print('spider', call(O, 'set_properties', {'instance': spider, 'values': json.dumps({'bIsSpatiallyLoaded': False, 'Span': 500.0, 'MaxSpan': 3800.0, 'WanderRadius': 2000.0, 'TimeScale': 1.0})}))
print('gamemode', call(O, 'set_properties', {'instance': {'refPath': lvl + '.WorldSettings'}, 'values': json.dumps({'DefaultGameMode': '/Game/Game/BP_TarantulaGame.BP_TarantulaGame_C'})}))
print('save', call('editor_toolset.toolsets.asset.AssetTools', 'save_assets', {'asset_paths': []}))
