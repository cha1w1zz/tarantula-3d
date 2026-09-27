# tiny Material graph builder over MCP: material('/Game/X/M_Name', nodes, links, outs, props)
# nodes {id: ('VertexColor', {props})}, links [(from, out_pin, to, in_pin)], outs {'MP_BaseColor': (id, out_pin)}; the asset is rebuilt from scratch
import json
from ue import call
MT = 'editor_toolset.toolsets.material.MaterialTools'; O = 'editor_toolset.toolsets.object.ObjectTools'; AT = 'editor_toolset.toolsets.asset.AssetTools'


def ref(path): return {'refPath': path + '.' + path.rsplit('/', 1)[1]}


def mpc(path, scalars=(), vectors=()):
    """MaterialParameterCollection with scalars [(name, default)] and vectors [(name, (r, g, b, a))]"""
    if call(O, 'get_class', {'instance': ref(path)}).startswith('ERROR'):
        call(MT, 'create_parameter_collection', {'folder_path': path.rsplit('/', 1)[0], 'asset_name': path.rsplit('/', 1)[1]})
    v = {'ScalarParameters': [{'ParameterName': n, 'DefaultValue': d} for n, d in scalars],
         'VectorParameters': [{'ParameterName': n, 'DefaultValue': {'R': c[0], 'G': c[1], 'B': c[2], 'A': c[3]}} for n, c in vectors]}
    r = call(O, 'set_properties', {'instance': ref(path), 'values': json.dumps(v)})
    if r.strip() != 'true': print('mpc', path, r[:300])


def material(path, nodes, links, outs, props=None):
    call(AT, 'delete', {'path': path})
    m = json.loads(call(MT, 'create_material', {'folder_path': path.rsplit('/', 1)[0], 'asset_name': path.rsplit('/', 1)[1]}))
    if props:
        r = call(O, 'set_properties', {'instance': m, 'values': json.dumps(props)})
        if r.strip() != 'true': print('props', r[:300])
    ex = {}
    for i, (k, (cls, p)) in enumerate(nodes.items()):
        e = call(MT, 'add_expression', {'material_or_function': m, 'expression_class': {'refPath': '/Script/Engine.MaterialExpression' + cls}, 'x': -300 * (1 + i % 4), 'y': 150 * i})
        ex[k] = json.loads(e)
        if p:
            r = call(O, 'set_properties', {'instance': ex[k], 'values': json.dumps(p)})
            if r.strip() != 'true': print('node', k, r[:300])
    for a, ao, b, bi in links:
        r = call(MT, 'connect_expressions', {'from_expression': ex[a], 'from_output_name': ao, 'to_expression': ex[b], 'to_input_name': bi})
        if r.strip() not in ('true', 'null'): print('link', a, b, r[:300])
    for mp, (a, ao) in outs.items():
        r = call(MT, 'connect_to_output', {'expression': ex[a], 'output_name': ao, 'material_property': mp})
        if 'rror' in r: print('out', mp, r[:300])
    call(MT, 'layout_expressions', {'material_or_function': m})
    r = call(MT, 'recompile', {'material_or_function': m})
    if 'rror' in r: print('compile', r[:400])
    call(AT, 'save_assets', {'asset_paths': [path]})
    return m
