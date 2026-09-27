# glTF binary -> ASCII FBX (one static mesh, one material slot per glTF material), because the MCP import tool only takes fbx/obj.
# python glb2fbx.py in.glb out.fbx [scale]  (scale: glTF units -> cm, default 100) -> also writes out.json: [{slot, color, rough, twoSided, vc}] for making the materials
# Keeps positions, normals, first UV set and vertex colours; axes stay glTF's (Y up; the FBX header says so), units become cm.
import sys, json, struct
TYPES = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
SIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def load(path):
    b = open(path, 'rb').read()
    n = struct.unpack_from('<I', b, 12)[0]
    g = json.loads(b[20:20 + n]); o = 20 + n
    ln = struct.unpack_from('<I', b, o)[0]; bin_ = b[o + 8:o + 8 + ln]

    def acc(i):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
        f, s = TYPES[a['componentType']]; k = SIZE[a['type']]; st = v.get('byteStride', s * k)
        base = v.get('byteOffset', 0) + a.get('byteOffset', 0); out = []
        for j in range(a['count']):
            t = struct.unpack_from('<' + f * k, bin_, base + j * st)
            if a.get('normalized'): t = tuple(x / (255.0 if f == 'B' else 65535.0) for x in t)
            out.append(t if k > 1 else t[0])
        return out
    return g, acc


def fmt(xs): return ','.join('%.6g' % x for x in xs)


def palette(C, PVI, MAT, info, n):
    """UE's FBX import (through MCP) drops vertex colours: split every vertex-coloured slot into n slots by triangle colour
    (k-means on the triangle mean colours); each new slot's colour = slot colour x cluster colour, vertex colours set white"""
    for si in [i for i, s in enumerate(info) if s['vc']]:
        tris = [t for t in range(len(MAT)) if MAT[t] == si]
        col = []
        for t in tris:
            vs = [PVI[3 * t], PVI[3 * t + 1], -PVI[3 * t + 2] - 1]
            col.append(tuple((sum(C[v][j] for v in vs) / 3) ** (1 / 2.2) for j in range(3)))   # cluster in gamma space (dark pelts)
        q = {}
        for c in col: key = tuple(round(x * 48) for x in c); q[key] = q.get(key, 0) + 1
        pts = [(tuple(x / 48 for x in k), w) for k, w in q.items()]
        pts.sort(key=lambda p: sum(p[0]))
        cen = [pts[int((i + 0.5) * len(pts) / n)][0] for i in range(min(n, len(pts)))]
        d2 = lambda a, b: sum((x - y) ** 2 for x, y in zip(a, b))
        for _ in range(10):
            acc = [[0.0, 0.0, 0.0, 0.0] for _ in cen]
            for p, w in pts:
                j = min(range(len(cen)), key=lambda j: d2(p, cen[j])); a = acc[j]
                a[0] += p[0] * w; a[1] += p[1] * w; a[2] += p[2] * w; a[3] += w
            cen = [(a[0] / a[3], a[1] / a[3], a[2] / a[3]) if a[3] else c for a, c in zip(acc, cen)]
        base = info[si]; ids = [si]
        for j in range(1, len(cen)):
            info.append(dict(base, slot='M%d' % len(info))); ids.append(len(info) - 1)
        for j, c in enumerate(cen):
            info[ids[j]]['color'] = [b * x ** 2.2 for b, x in zip(base['color'], c)]; info[ids[j]]['vc'] = False
        for t, c in zip(tris, col): MAT[t] = ids[min(range(len(cen)), key=lambda j: d2(c, cen[j]))]
    for i in range(len(C)): C[i] = (1.0, 1.0, 1.0, 1.0)


def convert(src, dst, k=100.0, pal=10):
    g, acc = load(src)
    V, N, UV, C, PVI, MAT, slots, info = [], [], [], [], [], [], [], []
    for node in g['nodes']:
        if 'mesh' not in node: continue
        assert 'matrix' not in node and 'translation' not in node and 'scale' not in node and 'rotation' not in node, 'node transforms not handled'
        for pr in g['meshes'][node['mesh']]['primitives']:
            at = pr['attributes']; mi = pr.get('material', 0); m = g['materials'][mi] if 'materials' in g else {}
            key = mi
            if key not in slots:
                slots.append(key); pbr = m.get('pbrMetallicRoughness', {})
                info.append({'slot': 'M%d' % len(info), 'color': pbr.get('baseColorFactor', [1, 1, 1, 1])[:3], 'rough': pbr.get('roughnessFactor', 1.0),
                             'twoSided': bool(m.get('doubleSided')), 'vc': 'COLOR_0' in at, 'name': m.get('name', '')})
            si = slots.index(key)
            P = acc(at['POSITION']); Nn = acc(at['NORMAL']) if 'NORMAL' in at else [(0, 1, 0)] * len(P)
            T = acc(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else [(0, 0)] * len(P)
            Cc = acc(at['COLOR_0']) if 'COLOR_0' in at else [(1, 1, 1)] * len(P)
            I = acc(pr['indices']) if 'indices' in pr else list(range(len(P)))
            b = len(V)
            V += [(x * k, y * k, z * k) for x, y, z in P]
            for c in Cc: C.append(tuple(c[:3]) + (1.0,))
            UV += [(t[0], 1 - t[1]) for t in T]
            for j in range(0, len(I), 3):
                a, bb, c = I[j] + b, I[j + 1] + b, I[j + 2] + b
                PVI += [a, bb, -c - 1]; MAT.append(si)
                for q in (I[j], I[j + 1], I[j + 2]): N.append(Nn[q])
    if pal: palette(C, PVI, MAT, info, pal)
    # per-polygon-vertex normals direct; uv + colour indexed by vertex
    pvx = [i if i >= 0 else -i - 1 for i in PVI]
    flat = lambda L: [x for t in L for x in t]
    o = []
    w = o.append
    w('; FBX 7.4.0 project file\nFBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n\tCreator: "glb2fbx"\n}\n')
    w('GlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n')
    for k, v in [('UpAxis', 1), ('UpAxisSign', 1), ('FrontAxis', 2), ('FrontAxisSign', 1), ('CoordAxis', 0), ('CoordAxisSign', 1),
                 ('OriginalUpAxis', 1), ('OriginalUpAxisSign', 1)]:
        w('\t\tP: "%s", "int", "Integer", "",%d\n' % (k, v))
    w('\t\tP: "UnitScaleFactor", "double", "Number", "",1\n\t\tP: "OriginalUnitScaleFactor", "double", "Number", "",1\n\t}\n}\n')
    w('Definitions:  {\n\tVersion: 100\n\tCount: %d\n' % (3 + len(info)))
    for t, n in (('GlobalSettings', 1), ('Model', 1), ('Geometry', 1), ('Material', len(info))):
        w('\tObjectType: "%s" {\n\t\tCount: %d\n\t}\n' % (t, n))
    w('}\n')
    w('Objects:  {\n\tGeometry: 1000, "Geometry::Mesh", "Mesh" {\n')
    w('\t\tVertices: *%d {\n\t\t\ta: %s\n\t\t}\n' % (len(V) * 3, fmt(flat(V))))
    w('\t\tPolygonVertexIndex: *%d {\n\t\t\ta: %s\n\t\t}\n\t\tGeometryVersion: 124\n' % (len(PVI), ','.join(map(str, PVI))))
    w('\t\tLayerElementNormal: 0 {\n\t\t\tVersion: 101\n\t\t\tName: ""\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "Direct"\n')
    w('\t\t\tNormals: *%d {\n\t\t\t\ta: %s\n\t\t\t}\n\t\t}\n' % (len(N) * 3, fmt(flat(N))))
    w('\t\tLayerElementColor: 0 {\n\t\t\tVersion: 101\n\t\t\tName: "col"\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "IndexToDirect"\n')
    w('\t\t\tColors: *%d {\n\t\t\t\ta: %s\n\t\t\t}\n\t\t\tColorIndex: *%d {\n\t\t\t\ta: %s\n\t\t\t}\n\t\t}\n' % (len(C) * 4, fmt(flat(C)), len(pvx), ','.join(map(str, pvx))))
    w('\t\tLayerElementUV: 0 {\n\t\t\tVersion: 101\n\t\t\tName: "map1"\n\t\t\tMappingInformationType: "ByPolygonVertex"\n\t\t\tReferenceInformationType: "IndexToDirect"\n')
    w('\t\t\tUV: *%d {\n\t\t\t\ta: %s\n\t\t\t}\n\t\t\tUVIndex: *%d {\n\t\t\t\ta: %s\n\t\t\t}\n\t\t}\n' % (len(UV) * 2, fmt(flat(UV)), len(pvx), ','.join(map(str, pvx))))
    w('\t\tLayerElementMaterial: 0 {\n\t\t\tVersion: 101\n\t\t\tName: ""\n\t\t\tMappingInformationType: "ByPolygon"\n\t\t\tReferenceInformationType: "IndexToDirect"\n')
    w('\t\t\tMaterials: *%d {\n\t\t\t\ta: %s\n\t\t\t}\n\t\t}\n' % (len(MAT), ','.join(map(str, MAT))))
    w('\t\tLayer: 0 {\n\t\t\tVersion: 100\n')
    for t in ('LayerElementNormal', 'LayerElementColor', 'LayerElementUV', 'LayerElementMaterial'):
        w('\t\t\tLayerElement:  {\n\t\t\t\tType: "%s"\n\t\t\t\tTypedIndex: 0\n\t\t\t}\n' % t)
    w('\t\t}\n\t}\n')
    w('\tModel: 2000, "Model::Mesh", "Mesh" {\n\t\tVersion: 232\n\t\tProperties70:  {\n\t\t}\n\t\tShading: T\n\t\tCulling: "CullingOff"\n\t}\n')
    for i, s in enumerate(info):
        c = s['color']
        w('\tMaterial: %d, "Material::%s", "" {\n\t\tVersion: 102\n\t\tShadingModel: "phong"\n\t\tMultiLayer: 0\n\t\tProperties70:  {\n' % (3000 + i, s['slot']))
        w('\t\t\tP: "DiffuseColor", "Color", "", "A",%s\n\t\t}\n\t}\n' % fmt(c))
    w('}\nConnections:  {\n\tC: "OO",2000,0\n\tC: "OO",1000,2000\n')
    for i in range(len(info)): w('\tC: "OO",%d,2000\n' % (3000 + i))
    w('}\n')
    open(dst, 'w').write(''.join(o))
    json.dump(info, open(dst[:-4] + '.json', 'w'), indent=1)
    return len(V), len(MAT), info


if __name__ == '__main__':
    print(convert(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 100.0))
