# screenshot helpers: python shot.py editor out.png  |  python shot.py view out.png x y z pitch yaw
import sys, re, base64
from ue import call
mode, out = sys.argv[1], sys.argv[2]
if mode == 'editor':
    r = call('EditorToolset.EditorAppToolset', 'CaptureEditorImage', {})
else:
    x, y, z, p, yw = map(float, sys.argv[3:8])
    r = call('EditorToolset.EditorAppToolset', 'CaptureViewport', {'captureTransform': {'location': {'x': x, 'y': y, 'z': z}, 'rotation': {'pitch': p, 'yaw': yw, 'roll': 0}},
             'annotations': {'gridSpacing': 0, 'gridExtent': 0, 'gridHeight': 0, 'maxLabelDistance': 0, 'maxLabels': 0}})
m = re.search(r'"data": "([^"]+)"', r)
if m: open(out, 'wb').write(base64.b64decode(m.group(1))); print('saved', out)
else: print(r[:400])
