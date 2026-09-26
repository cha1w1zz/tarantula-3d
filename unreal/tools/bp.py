# Blueprint builder: python bp.py spider_bp.py            (first time: adds variables + function graphs, writes graphs, compiles)
#                    python bp.py spider_bp.py --names    (graphs exist: only rewrites them)
# Graph code is Unreal MCP's Blueprint DSL; bare member names / own function calls are expanded by xl().
import sys, json, re; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
BT = 'editor_toolset.toolsets.blueprint.BlueprintTools'
BP = {'refPath': '/Game/Spider/BP_Tarantula.BP_Tarantula'}
MEMBERS = ['Legs', 'Knobs', 'Body', 'Abdomen']; FNS = ['GroundZ']; PEND = []
CREATE = True   # False: only register names (graphs/vars already exist)


def G(name): return {'refPath': '/Game/Spider/BP_Tarantula.BP_Tarantula:' + name}


def fn(name, ins=(), outs=()):
    FNS.append(name)
    if not CREATE: return
    print(call(BT, 'add_function_graph', {'blueprint': BP, 'graph_name': name})[:120])
    for n, t in ins: call(BT, 'add_function_param', {'graph': G(name), 'param_name': n, 'param_type': t, 'input_param': True})
    for n, t in outs: call(BT, 'add_function_param', {'graph': G(name), 'param_name': n, 'param_type': t, 'input_param': False})


def var(name, t, arr=False):
    MEMBERS.append(name)
    if not CREATE: return
    a = {'blueprint': BP, 'name': name, 'type_name': t}
    if arr: a['container_type'] = 'ARRAY'
    print(name, call(BT, 'add_variable', a)[:200])


def xl(code):
    for m in MEMBERS: code = re.sub(r'(?<=[\s(])' + m + r'(?=[\s)])', '(Variables|Default|Get' + m + ')', code)
    for f in FNS: code = re.sub(r'\((' + f + r')(?=[\s)])', r'(CallFunction|\1', code)
    return code


def dsl(graph, code): PEND.append((graph, code))


def flush():
    while PEND:
        g, c = PEND.pop(0); print(g, '->', call(BT, 'write_graph_dsl', {'graph': G(g), 'code': xl(c)})[:3000])


def compile():
    flush(); print('compile ->', call(BT, 'compile_blueprint', {'blueprint': BP})[:3000])


if __name__ == '__main__':
    if '--names' in sys.argv: CREATE = False
    exec(open(sys.argv[1], encoding='utf-8').read())
