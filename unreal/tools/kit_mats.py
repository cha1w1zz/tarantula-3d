# master materials for the real spider parts (kit_import.py makes one instance per slot): python kit_mats.py
# base colour = vertex colour x Tint; Pale 0..1 blends to the new pale skin (molting/soft), Dark darkens slots with IsAbd = 1 (premolt).
# BP_Tarantula sets Pale/Dark per component with SetScalarParameterValueOnMaterials.
import sys; sys.stdout.reconfigure(encoding='utf-8')
from mat import material
for name, two in (('M_SpiderVC', False), ('M_SpiderVC2', True)):
    material('/Game/Spider/Kit/' + name, {
        'vc': ('VertexColor', None),
        'tint': ('VectorParameter', {'ParameterName': 'Tint', 'DefaultValue': {'R': 1, 'G': 1, 'B': 1, 'A': 1}}),
        'col': ('Multiply', None),
        'pale': ('ScalarParameter', {'ParameterName': 'Pale', 'DefaultValue': 0.0}),
        'palec': ('VectorParameter', {'ParameterName': 'PaleCol', 'DefaultValue': {'R': 0.13, 'G': 0.095, 'B': 0.06, 'A': 1}}),
        'mix': ('LinearInterpolate', None),
        'dark': ('ScalarParameter', {'ParameterName': 'Dark', 'DefaultValue': 0.0}),
        'isabd': ('ScalarParameter', {'ParameterName': 'IsAbd', 'DefaultValue': 0.0}),
        'dm': ('Multiply', None),
        'om': ('OneMinus', None),
        'out': ('Multiply', None),
        'rough': ('ScalarParameter', {'ParameterName': 'Rough', 'DefaultValue': 0.7}),
    }, [('vc', '', 'col', 'A'), ('tint', 'RGB', 'col', 'B'), ('col', '', 'mix', 'A'), ('palec', 'RGB', 'mix', 'B'), ('pale', '', 'mix', 'Alpha'),
        ('dark', '', 'dm', 'A'), ('isabd', '', 'dm', 'B'), ('dm', '', 'om', ''), ('mix', '', 'out', 'A'), ('om', '', 'out', 'B')],
       {'MP_BaseColor': ('out', ''), 'MP_Roughness': ('rough', '')}, {'TwoSided': two, 'bUsedWithInstancedStaticMeshes': True})
    print(name, 'ok')
