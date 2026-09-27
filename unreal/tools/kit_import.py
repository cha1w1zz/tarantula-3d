# Real spider parts into Unreal: python kit_import.py [species ...]   (after: node spider_kit.js)
# unreal/kit/<sp>_<Part>.glb -> .fbx (glb2fbx.py) -> /Game/Spider/Kit/SM_<sp>_<Part>, slots get MI_<sp>_<Part>_<n> (spider_mats in kit_mats.py)
# Body/Abd are a span-10 m spider (component scale = Span / 1000); segments/knob are unit shapes (see EXPORT.kit in js/export.js).
import sys, os, json; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
from glb2fbx import convert
SM = 'editor_toolset.toolsets.static_mesh.StaticMeshTools'; AT = 'editor_toolset.toolsets.asset.AssetTools'
MT = 'editor_toolset.toolsets.material_instance.MaterialInstanceTools'
KIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'kit')
PARTS = {'Body': 1000.0, 'Abd': 1000.0, 'SegA': 100.0, 'SegB': 100.0, 'SegC': 100.0, 'SegT': 100.0, 'Knob': 100.0}
PAR = {False: '/Game/Spider/Kit/M_SpiderVC.M_SpiderVC', True: '/Game/Spider/Kit/M_SpiderVC2.M_SpiderVC2'}


def mi(name, s, abd):
    ref = {'refPath': '/Game/Spider/Kit/%s.%s' % (name, name)}
    if call('editor_toolset.toolsets.object.ObjectTools', 'get_class', {'instance': ref}).startswith('ERROR'):
        call(MT, 'create', {'folder_path': '/Game/Spider/Kit', 'asset_name': name, 'parent': {'refPath': PAR[s['twoSided']]}})
    call('editor_toolset.toolsets.object.ObjectTools', 'set_properties', {'instance': ref, 'values': json.dumps({'Parent': PAR[s['twoSided']]})})   # kit_mats.py rebuilds the parents
    c = s['color']
    call(MT, 'set_vector_parameter', {'instance': ref, 'name': 'Tint', 'value': {'r': c[0], 'g': c[1], 'b': c[2], 'a': 1}})
    call(MT, 'set_scalar_parameter', {'instance': ref, 'name': 'Rough', 'value': s['rough']})
    call(MT, 'set_scalar_parameter', {'instance': ref, 'name': 'IsAbd', 'value': 1.0 if abd else 0.0})
    return ref


MATS = '--mats' in sys.argv
for sp in [a for a in sys.argv[1:] if a != '--mats'] or ['lividus']:
    for p, k in PARTS.items():
        src = os.path.join(KIT, '%s_%s.glb' % (sp, p)); fbx = src[:-4] + '.fbx'
        name = 'SM_%s_%s' % (sp, p); ref = {'refPath': '/Game/Spider/Kit/%s.%s' % (name, name)}
        if MATS:
            for i, s in enumerate(json.load(open(fbx[:-4] + '.json'))): mi('MI_%s_%s_%d' % (sp, p, i), s, p == 'Abd')
            continue
        nv, nf, info = convert(src, fbx, k)
        call(AT, 'delete', {'path': '/Game/Spider/Kit/' + name})
        r = call(SM, 'import_file', {'folder_path': '/Game/Spider/Kit', 'asset_name': name, 'source_file': os.path.abspath(fbx).replace('\\', '/'),
                                     'import_materials': False, 'combine_meshes': True})
        for i, s in enumerate(info):
            m = mi('MI_%s_%s_%d' % (sp, p, i), s, p == 'Abd')
            ok = call(SM, 'set_material', {'mesh': ref, 'slot_name': s['slot'], 'material': m})
            if ok.strip() != 'true': print('slot', s['slot'], ok[:200])
        print(name, nv, 'verts', nf, 'tris', len(info), 'slots', r[:80].replace('\n', ' '), call(SM, 'get_vertex_count', {'mesh': ref}).strip())
call(AT, 'save_assets', {'asset_paths': []})
