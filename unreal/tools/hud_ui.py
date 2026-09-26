# WBP_HUD widget tree (dark glass like index.html): stats card top-left, log top-right, notice top-centre,
# bottom bar with the main buttons, help panel. python hud_ui.py  (re-run safe: existing widgets are kept, props re-applied)
import sys, json; sys.stdout.reconfigure(encoding='utf-8')
from ue import call
U = 'UMGToolSet.UMGToolSet'; O = 'editor_toolset.toolsets.object.ObjectTools'
WB = {'refPath': '/Game/Game/WBP_HUD.WBP_HUD'}
if call('editor_toolset.toolsets.asset.AssetTools', 'exists', {'path': '/Game/Game/WBP_HUD'}).strip() != 'true':
    call(U, 'CreateWidgetBlueprint', {'folderPath': '/Game/Game', 'assetName': 'WBP_HUD', 'parentClass': {'refPath': '/Script/UMG.UserWidget'}})
have = {}
for w in (json.loads(call(U, 'GetWidgets', {'widgetBlueprint': WB})).get('widgets') or []):
    ref = w['widget']['refPath'] if isinstance(w, dict) and 'widget' in w else w['refPath']
    have[ref.rsplit('.', 1)[-1]] = w
SLOT = {}


def add(name, cls, parent=None, var=False):
    ref = {'refPath': '/Game/Game/WBP_HUD.WBP_HUD:WidgetTree.' + name}
    if name not in have:
        a = {'widgetBlueprint': WB, 'widgetClass': {'refPath': '/Script/UMG.' + cls}, 'widgetDisplayName': name}
        if parent: a['parentWidget'] = {'refPath': '/Game/Game/WBP_HUD.WBP_HUD:WidgetTree.' + parent}
        r = json.loads(call(U, 'AddWidget', a)); SLOT[name] = r.get('slot')
    else:
        w = have[name]; SLOT[name] = w.get('slot') if isinstance(w, dict) else None
    if var: call(U, 'ToggleWidgetAsVariable', {'widgetBlueprint': WB, 'widget': ref, 'bIsVariable': True})
    return ref


def props(name, **v):
    r = call(O, 'set_properties', {'instance': {'refPath': '/Game/Game/WBP_HUD.WBP_HUD:WidgetTree.' + name}, 'values': json.dumps(v, ensure_ascii=False)})
    if r.strip() != 'true': print('props', name, r[:300])


def slot(name, **v):
    s = SLOT.get(name)
    if not s or s == 'None': print('no slot', name); return
    r = call(O, 'set_properties', {'instance': s, 'values': json.dumps(v)})
    if r.strip() != 'true': print('slot', name, r[:300])


def font(size, bold=False):
    return {'fontObject': {'refPath': '/Game/Game/Fonts/Sarabun-Regular_Font.Sarabun-Regular_Font'}, 'typefaceFontName': 'Bold' if bold else 'Regular', 'size': size}


def text(name, parent, s, size=14, bold=False, color=(0.92, 0.9, 0.85, 1), var=False):
    add(name, 'TextBlock', parent, var)
    props(name, Text=s, Font=font(size, bold), ColorAndOpacity={'specifiedColor': dict(zip('rgba', color)), 'colorUseRule': 'UseColor_Specified'},
          ShadowOffset={'x': 1, 'y': 1}, ShadowColorAndOpacity={'r': 0, 'g': 0, 'b': 0, 'a': 0.6})


GLASS = {'r': 0.02, 'g': 0.025, 'b': 0.03, 'a': 0.62}


def canvas(name, anchor, align, left, top, w=0, h=0, auto=True):
    slot(name, LayoutData={'offsets': {'left': left, 'top': top, 'right': w, 'bottom': h},
                           'anchors': {'minimum': {'x': anchor[0], 'y': anchor[1]}, 'maximum': {'x': anchor[0], 'y': anchor[1]}},
                           'alignment': {'x': align[0], 'y': align[1]}}, bAutoSize=auto)


add('Root', 'CanvasPanel')
# stats card
add('StatsBox', 'Border', 'Root'); props('StatsBox', BrushColor=GLASS, Padding={'left': 14, 'top': 10, 'right': 14, 'bottom': 12})
canvas('StatsBox', (0, 0), (0, 0), 16, 16)
add('StatsCol', 'VerticalBox', 'StatsBox')
text('TxtTitle', 'StatsCol', 'บึ้งไทย 3D', 20, True, (1, 0.85, 0.55, 1))
text('TxtStats', 'StatsCol', '...', 15, var=True)
# log (right)
add('LogBox', 'Border', 'Root'); props('LogBox', BrushColor=GLASS, Padding={'left': 12, 'top': 8, 'right': 12, 'bottom': 10})
canvas('LogBox', (1, 0), (1, 0), -16, 16)
text('TxtLog', 'LogBox', 'บันทึก', 13, var=True); props('TxtLog', AutoWrapText=True, WrapTextAt=330)
# notice (top centre)
text('TxtNotice', 'Root', '', 20, True, (1, 0.9, 0.5, 1), var=True)
canvas('TxtNotice', (0.5, 0), (0.5, 0), 0, 22)
# help panel (centre, hidden until H / button)
add('HelpBox', 'Border', 'Root', var=True); props('HelpBox', BrushColor={'r': 0.02, 'g': 0.025, 'b': 0.03, 'a': 0.85},
                                                   Padding={'left': 22, 'top': 16, 'right': 22, 'bottom': 18}, Visibility='Collapsed')
canvas('HelpBox', (0.5, 0.5), (0.5, 0.5), 0, 0)
text('TxtHelp', 'HelpBox', '\n'.join([
    'วิธีเล่น',
    '• คลิกขวาค้างแล้วลาก = หมุนกล้อง · ล้อเมาส์ = ซูม · W A S D = เลื่อนกล้อง',
    '• 1 = ปล่อยจิ้งหรีด · 2 = ปล่อยแมลงสาบดูเบีย (สูงสุด 4 ตัว)',
    '• M = พ่นน้ำ (ความชื้นต่ำ = ลอกคราบยาก) · F = กล้องติดตามแมงมุม',
    '• T = เร่งเวลา 1× / 10× / 60× · H = เปิด/ปิดหน้านี้',
    '• P = ปล่อยชัยภัทรกับตุ้ยเข้าเมือง (แมงมุมต้องขาใหญ่ถึง 12 ซม.) — ต้องรอด 30 วัน แล้วเฮลิคอปเตอร์จะมารับ',
    '',
    'แมงมุมรับรู้เหยื่อจากแรงสั่น ไม่ใช่สายตา — เหยื่อที่วิ่งจะถูกจับได้ไกลกว่า',
    'กินพอ → โตเต็ม → งดอาหาร (ก่อนลอกคราบ) → ลอกคราบ → ตัวนิ่ม ห้ามให้อาหาร → ใหญ่ขึ้น ×1.35',
]), 15)
# bottom bar
add('Bar', 'HorizontalBox', 'Root')
canvas('Bar', (0.5, 1), (0.5, 1), 0, -18)
for b, label in [('BtnCricket', 'จิ้งหรีด [1]'), ('BtnDubia', 'ดูเบีย [2]'), ('BtnMist', 'พ่นน้ำ [M]'), ('BtnFollow', 'ติดตาม [F]'),
                 ('BtnSpeed', 'เร่งเวลา [T]'), ('BtnHuman', 'ปล่อยคน [P]'), ('BtnHelp', 'วิธีเล่น [H]')]:
    add(b, 'Button', 'Bar', var=True)
    props(b, BackgroundColor={'r': 0.12, 'g': 0.13, 'b': 0.15, 'a': 0.85})
    slot(b, Padding={'left': 4, 'top': 0, 'right': 4, 'bottom': 0})
    text('L' + b, b, label, 15, True)
print(call(U, 'CompileWidgetBlueprint', {'widgetBlueprint': WB})[:500])
