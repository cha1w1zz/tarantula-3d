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
for a in acts:
    p = a['refPath']
    if 'BP_Tarantula_C' in p: spider = a
    if 'StaticMeshActor' not in p: continue
    lab = call(A, 'get_label', {'actor': a}).strip().strip('"')
    if lab.startswith('Test') or lab.startswith('Spider_'):
        print('remove', lab, call(S, 'remove_from_scene', {'actor': a}).strip()); continue
    if not lab.startswith('World_'): continue
    mesh = '/Game/Tarantula/tarantula-scene/StaticMeshes/%s.%s' % (lab, lab)
    sm = json.loads(call(O, 'get_properties', {'instance': {'refPath': mesh}, 'properties': ['StaticMaterials']}))
    mat = sm['StaticMaterials'][0]['materialInterface']['refPath']
    par = json.loads(call(O, 'get_properties', {'instance': {'refPath': mat}, 'properties': ['Parent']})).get('Parent', {}).get('refPath', '')
    vp = json.loads(call(O, 'get_properties', {'instance': {'refPath': mat}, 'properties': ['VectorParameterValues']})).get('VectorParameterValues') or []
    c = vp[0]['parameterValue'] if vp else {'r': 1, 'g': 1, 'b': 1}
    green = c['g'] > c['r'] * 1.3 and c['g'] > c['b'] * 2 and c['g'] < 0.5          # plant clumps (sedges / strap leaves)
    b = json.loads(call(A, 'get_actor_bounds', {'actor': a}))
    litter = par.endswith('MI_Default_Opaque_DS') and b['max']['z'] - b['min']['z'] < 700 and b['max']['x'] - b['min']['x'] > 10000
    if par.rsplit('.', 1)[-1] in NOWALK_PARENTS or green or litter:
        tags = call(A, 'get_tags', {'actor': a})
        if 'NoWalk' not in tags: call(A, 'add_tag', {'actor': a, 'tag': 'NoWalk'})
        print('NoWalk', lab)
if not spider:
    spider = json.loads(call(S, 'add_to_scene_from_class', {'actor_type': {'refPath': '/Game/Spider/BP_Tarantula.BP_Tarantula_C'}, 'name': 'Tarantula',
                                                          'xform': {'location': {'x': -2400, 'y': 600, 'z': 300}}}))
call(A, 'set_actor_transform', {'actor': spider, 'xform': {'location': {'x': -2400, 'y': 600, 'z': 300}, 'rotation': {'pitch': 0, 'yaw': -15, 'roll': 0}}})
print('spider', call(O, 'set_properties', {'instance': spider, 'values': json.dumps({'bIsSpatiallyLoaded': False, 'Span': 500.0, 'MaxSpan': 3800.0, 'WanderRadius': 2000.0, 'TimeScale': 1.0})}))
print('gamemode', call(O, 'set_properties', {'instance': {'refPath': lvl + '.WorldSettings'}, 'values': json.dumps({'DefaultGameMode': '/Game/Game/BP_TarantulaGame.BP_TarantulaGame_C'})}))
print('save', call('editor_toolset.toolsets.asset.AssetTools', 'save_assets', {'asset_paths': []}))
