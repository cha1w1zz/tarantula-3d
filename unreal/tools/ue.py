# tiny Unreal MCP client: python ue.py <toolset|-> <tool> ['<json args>' | @file.json]
import json, sys, os, urllib.request
U = 'http://127.0.0.1:8000/mcp'
SF = os.path.join(os.path.dirname(__file__), 'sid.txt')


def post(body, sid=None):
    h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
    if sid: h['Mcp-Session-Id'] = sid
    r = urllib.request.urlopen(urllib.request.Request(U, json.dumps(body).encode(), h), timeout=600)
    return r.headers.get('Mcp-Session-Id'), r.read().decode('utf-8')


def session():
    if os.path.exists(SF):
        return open(SF).read().strip()
    sid, _ = post({'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2025-06-18', 'capabilities': {}, 'clientInfo': {'name': 'cc', 'version': '1'}}})
    post({'jsonrpc': '2.0', 'method': 'notifications/initialized'}, sid)
    open(SF, 'w').write(sid)
    return sid


def call(toolset, tool, args=None):
    a = {'tool_name': tool, 'arguments': args or {}}
    if toolset and toolset != '-': a['toolset_name'] = toolset
    name = 'call_tool'
    if tool in ('list_toolsets', 'describe_toolset'): name, a = tool, (args or {})
    body = {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/call', 'params': {'name': name, 'arguments': a}}
    try:
        _, t = post(body, session())
    except urllib.error.HTTPError:
        os.remove(SF); _, t = post(body, session())
    d = json.loads(t)
    if 'error' in d: return 'RPC ERROR: ' + json.dumps(d['error'])
    res = d['result']; parts = []
    for i, c in enumerate(res.get('content', [])):
        if c.get('type') == 'image':
            import base64; p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shot%d.png' % i)
            open(p, 'wb').write(base64.b64decode(c['data'])); parts.append('IMAGE ' + p)
        else: parts.append(c.get('text', ''))
    out = '\n'.join(parts)
    try:
        v = json.loads(out)
        if isinstance(v, dict) and set(v) == {'returnValue'}: v = v['returnValue']
        out = v if isinstance(v, str) else json.dumps(v, indent=1, ensure_ascii=False)
    except Exception: pass
    return ('ERROR: ' if res.get('isError') else '') + out


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    ts, tool = sys.argv[1], sys.argv[2]
    raw = sys.argv[3] if len(sys.argv) > 3 else '{}'
    if raw.startswith('@'): raw = open(raw[1:], encoding='utf-8').read()
    print(call(ts, tool, json.loads(raw)))
