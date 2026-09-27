# WBP_Bubble: speech bubble over a person's head (index.html #say / humanSay), shown by BP_Human.Talk. python bubble_ui.py
import sys, json; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
U = 'UMGToolSet.UMGToolSet'; O = 'editor_toolset.toolsets.object.ObjectTools'
WB = {'refPath': '/Game/Game/WBP_Bubble.WBP_Bubble'}
if call('editor_toolset.toolsets.asset.AssetTools', 'exists', {'path': '/Game/Game/WBP_Bubble'}).strip() != 'true':
    call(U, 'CreateWidgetBlueprint', {'folderPath': '/Game/Game', 'assetName': 'WBP_Bubble', 'parentClass': {'refPath': '/Script/UMG.UserWidget'}})
have = set()
for w in (json.loads(call(U, 'GetWidgets', {'widgetBlueprint': WB})).get('widgets') or []):
    ref = w['widget']['refPath'] if isinstance(w, dict) and 'widget' in w else w['refPath']
    have.add(ref.rsplit('.', 1)[-1])
W = lambda n: {'refPath': '/Game/Game/WBP_Bubble.WBP_Bubble:WidgetTree.' + n}
for name, cls, parent in (('Box', 'Border', None), ('Txt', 'TextBlock', 'Box')):
    if name not in have:
        a = {'widgetBlueprint': WB, 'widgetClass': {'refPath': '/Script/UMG.' + cls}, 'widgetDisplayName': name}
        if parent: a['parentWidget'] = W(parent)
        print(name, call(U, 'AddWidget', a)[:120])
call(U, 'ToggleWidgetAsVariable', {'widgetBlueprint': WB, 'widget': W('Txt'), 'bIsVariable': True})
for n, v in (('Box', {'BrushColor': {'r': 0.97, 'g': 0.95, 'b': 0.9, 'a': 0.92}, 'Padding': {'left': 10, 'top': 5, 'right': 10, 'bottom': 6}}),
             ('Txt', {'Text': '...', 'AutoWrapText': True, 'WrapTextAt': 260,
                      'Font': {'fontObject': {'refPath': '/Game/Game/Fonts/Sarabun-Regular_Font.Sarabun-Regular_Font'}, 'typefaceFontName': 'Bold', 'size': 15},
                      'ColorAndOpacity': {'specifiedColor': {'r': 0.05, 'g': 0.05, 'b': 0.06, 'a': 1}, 'colorUseRule': 'UseColor_Specified'}})):
    r = call(O, 'set_properties', {'instance': W(n), 'values': json.dumps(v, ensure_ascii=False)})
    if r.strip() != 'true': print('props', n, r[:300])
print(call(U, 'CompileWidgetBlueprint', {'widgetBlueprint': WB})[:300])
