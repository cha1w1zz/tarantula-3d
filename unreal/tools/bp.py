# Blueprint builder: python bp.py <script.py>
# The script calls target(path, parent) first (creates the Blueprint if missing), then comp()/var()/objvar()/fn()/dsl()
# and ends with compile(). Existing variables, components and function graphs are kept, so re-running only rewrites graphs.
# Graph code is Unreal MCP's Blueprint DSL; bare member names / own function calls are expanded by xl().
import sys, json, re; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
BT = 'editor_toolset.toolsets.blueprint.BlueprintTools'
AT = 'editor_toolset.toolsets.actor.ActorTools'
BP = {'refPath': '/Game/Spider/BP_Tarantula.BP_Tarantula'}
PATH = '/Game/Spider/BP_Tarantula'
MEMBERS = []; COMPS = []; FNS = []; PEND = []
HAVE_V = set(); HAVE_G = set(); HAVE_C = set()


def js(s):
    try: return json.loads(s)
    except Exception: return None


def target(path, parent='/Script/Engine.Actor'):
    """select (and create if needed) the Blueprint at /Game/.../Name"""
    global BP, PATH
    PATH = path; name = path.rsplit('/', 1)[1]
    BP = {'refPath': path + '.' + name}
    if js(call(BT, 'list_graphs', {'blueprint': BP})) is None:
        print('create', path, call(BT, 'create', {'folder_path': path.rsplit('/', 1)[0], 'asset_name': name, 'asset_type': {'refPath': parent}})[:200])
    HAVE_V.clear(); HAVE_G.clear(); HAVE_C.clear()
    HAVE_V.update(js(call(BT, 'list_variables', {'blueprint': BP})) or [])
    for g in js(call(BT, 'list_graphs', {'blueprint': BP})) or []:
        HAVE_G.add((g.get('refPath', '') if isinstance(g, dict) else str(g)).rsplit(':', 1)[-1].rsplit('.', 1)[-1])


def G(name): return {'refPath': BP['refPath'] + ':' + name}


def T(name): return {'refPath': PATH + '.' + PATH.rsplit('/', 1)[1] + '_C:' + name + '_GEN_VARIABLE'}   # component template


def comp(name, cls, props=None, parent=None):
    """component on the Blueprint (cls like /Script/Engine.StaticMeshComponent); props = ObjectTools values dict; parent = component name"""
    COMPS.append(name)
    if call('editor_toolset.toolsets.object.ObjectTools', 'get_class', {'instance': T(name)}).startswith('ERROR'):
        print('comp', name, call(AT, 'add_component', {'owner': T(parent) if parent else BP, 'component_type': {'refPath': cls}, 'name': name})[:200])
    if props:
        r = call('editor_toolset.toolsets.object.ObjectTools', 'set_properties', {'instance': T(name), 'values': json.dumps(props)})
        if r.strip() != 'true': print('props', name, r[:300])


def fn(name, ins=(), outs=()):
    FNS.append(name)
    if name in HAVE_G: return
    print(call(BT, 'add_function_graph', {'blueprint': BP, 'graph_name': name})[:120])
    for n, t in ins: call(BT, 'add_function_param', {'graph': G(name), 'param_name': n, 'param_type': t, 'input_param': True})
    for n, t in outs: call(BT, 'add_function_param', {'graph': G(name), 'param_name': n, 'param_type': t, 'input_param': False})


def var(name, t, arr=False):
    MEMBERS.append(name)
    if name in HAVE_V: return
    a = {'blueprint': BP, 'name': name, 'type_name': t}
    if arr: a['container_type'] = 'ARRAY'
    print(name, call(BT, 'add_variable', a)[:200])


def objvar(name, cls, arr=False):
    MEMBERS.append(name)
    if name in HAVE_V: return
    a = {'blueprint': BP, 'name': name, 'object_class': {'refPath': cls}}
    if arr: a['container_type'] = 'ARRAY'
    print(name, call(BT, 'add_object_variable', a)[:200])


def edit(*names):
    """make member variables editable per instance (shown in Details)"""
    for n in names: call(BT, 'set_variable_instance_editable', {'blueprint': BP, 'variable_name': n, 'is_instance_editable': True})


CAT = {}


def cat(m):   # getter/setter node ids use the variable's category (e.g. Variables|Tarantula|GetSpan)
    if m not in CAT:
        c = call(BT, 'get_variable_category', {'blueprint': BP, 'variable_name': m}).strip().strip('"')
        CAT[m] = c if c and not c.startswith('ERROR') and c != 'null' else 'Default'
    return CAT[m]


def xl(code):
    for m in COMPS: code = re.sub(r'(?<=[\s(])' + m + r'(?=[\s)])', '(Variables|Default|Get' + m + ')', code)
    for m in MEMBERS:
        c = cat(m)
        code = re.sub(r'(?<=[\s(])' + m + r'(?=[\s)])', '(Variables|' + c + '|Get' + m + ')', code)
        code = code.replace('(Variables|Default|Set' + m + ' ', '(Variables|' + c + '|Set' + m + ' ')
    code = code.replace('(% ', '(Math|Integer|%(Integer) ')   # the DSL's % operator has no node
    for f in FNS: code = re.sub(r'\((' + f + r')(?=[\s)])', r'(CallFunction|\1', code)
    return code


def dsl(graph, code): PEND.append((graph, code))


CLEAR = '''
import json
def run():
    g = {"refPath": "%s"}
    nodes = execute_tool("editor_toolset.toolsets.blueprint.BlueprintTools.find_nodes", json.dumps({"graph": g, "title": ""}))["returnValue"]
    n = 0
    for nd in nodes:
        r = nd["refPath"]
        if "FunctionEntry" in r or "FunctionResult" in r: continue
        execute_tool("editor_toolset.toolsets.blueprint.BlueprintTools.delete_node", json.dumps({"node": nd}))
        n += 1
    return {"deleted": n}
'''


def clear(graph):
    """write_graph_dsl leaves the old nodes in the graph: delete them first (one in-editor batch)"""
    return call('editor_toolset.toolsets.programmatic.ProgrammaticToolset', 'execute_tool_script', {'script': CLEAR % G(graph)['refPath']})


def flush():
    while PEND:
        g, c = PEND.pop(0); cl = clear(g)
        r = call(BT, 'write_graph_dsl', {'graph': G(g), 'code': xl(c)}); print(g, ' '.join(cl.split())[:60], '->', r[:3000])
        if 'ERROR' in r: FAILED.append(g)


FAILED = []


def compile():
    CAT.clear(); flush(); r = call(BT, 'compile_blueprint', {'blueprint': BP}); print('compile ->', r[:3000])
    if FAILED: print('FAILED GRAPHS:', FAILED)


if __name__ == '__main__':
    exec(open(sys.argv[1], encoding='utf-8').read())
