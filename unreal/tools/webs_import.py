# spider webs into the level: python webs_import.py   (after node spider_kit.js and fx_mats.py)
# unreal/kit/webs.glb -> SM_Webs (slot M0 threads, M1 film) with MI_WebThread / MI_WebFilm, one actor "Webs" at the origin
import sys, os, json; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
from glb2fbx import convert
SM = 'editor_toolset.toolsets.static_mesh.StaticMeshTools'; AT = 'editor_toolset.toolsets.asset.AssetTools'
MT = 'editor_toolset.toolsets.material_instance.MaterialInstanceTools'; S = 'editor_toolset.toolsets.scene.SceneTools'
A = 'editor_toolset.toolsets.actor.ActorTools'; O = 'editor_toolset.toolsets.object.ObjectTools'
src = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'kit', 'webs.glb'); fbx = src[:-4] + '.fbx'
print(convert(src, fbx, 100.0, 0)[:2])
call(AT, 'delete', {'path': '/Game/Game/Webs/SM_Webs'})
print(call(SM, 'import_file', {'folder_path': '/Game/Game/Webs', 'asset_name': 'SM_Webs', 'source_file': os.path.abspath(fbx).replace(os.sep, '/'),
                               'import_materials': False, 'combine_meshes': True})[:120])
mesh = {'refPath': '/Game/Game/Webs/SM_Webs.SM_Webs'}
for slot, name, g in (('M0', 'MI_WebThread', 0.2), ('M1', 'MI_WebFilm', 0.05)):
    ref = {'refPath': '/Game/Game/Webs/%s.%s' % (name, name)}
    if call(O, 'get_class', {'instance': ref}).startswith('ERROR'):
        call(MT, 'create', {'folder_path': '/Game/Game/Webs', 'asset_name': name, 'parent': {'refPath': '/Game/Game/Mat/M_Web.M_Web'}})
    call(O, 'set_properties', {'instance': ref, 'values': json.dumps({'Parent': '/Game/Game/Mat/M_Web.M_Web'})})
    call(MT, 'set_scalar_parameter', {'instance': ref, 'name': 'Glow', 'value': g})
    print(slot, call(SM, 'set_material', {'mesh': mesh, 'slot_name': slot, 'material': ref}).strip())
call(SM, 'remove_collisions', {'mesh': mesh})
found = json.loads(call(S, 'find_actors', {'name': 'Webs', 'tag': '', 'collision_channels': []}))
if not found:
    a = json.loads(call(S, 'add_to_scene_from_asset', {'asset_path': '/Game/Game/Webs/SM_Webs', 'name': 'Webs', 'xform': {'location': {'x': 0, 'y': 0, 'z': 0}}}))
    call(A, 'set_label', {'actor': a, 'label': 'Webs'})
    call(A, 'add_tag', {'actor': a, 'tag': 'NoWalk'})
    print('placed', a)
else: a = found[0]
# the re-import above leaves an existing actor pointing at nothing: re-assign; silk never blocks traces or casts shadows
print('actor', call(O, 'set_properties', {'instance': {'refPath': a['refPath'] + '.StaticMeshComponent0'}, 'values': json.dumps(
    {'StaticMesh': '/Game/Game/Webs/SM_Webs.SM_Webs', 'BodyInstance': {'collisionProfileName': 'NoCollision', 'collisionEnabled': 'NoCollision'}, 'CastShadow': False})}))
call(AT, 'save_assets', {'asset_paths': []})
