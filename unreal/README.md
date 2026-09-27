# บึ้งไทย 3D → Unreal Engine 5

## สิ่งที่คุณต้องทำเอง (แค่ 3 อย่าง)
1. **เปิด PowerShell** (กดปุ่ม Windows → พิมพ์ PowerShell → Enter) แล้ววางบรรทัดนี้ → Enter
   ```
   irm https://raw.githubusercontent.com/cha1w1zz/tarantula-3d/claude/affectionate-allen-nu113x/unreal/setup.ps1 -OutFile $env:TEMP\t3d.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\t3d.ps1
   ```
   ถ้ามีหน้าต่างถาม "อนุญาตไหม" กด **Yes** · ถ้า Claude ให้ล็อกอิน ล็อกอินบัญชี Claude
2. **ในเกมที่เปิดขึ้นมา** กด ⚙ตั้งค่า → **📦 ส่งออกไป Unreal** (ได้ไฟล์ฉากไว้ใน Downloads)
3. **คุยกับ Claude** ในหน้าต่าง PowerShell (มันเริ่มทำงานให้เองแล้ว) — ถ้าถามอะไรก็ตอบ

ต้องมี Unreal Engine **5.8 ขึ้นไป** (ตัวที่มีปลั๊กอิน Unreal MCP ของ Epic) · ไม่ต้องลง Visual Studio

## สคริปต์ทำอะไรให้บ้าง (อัตโนมัติ)
| ขั้น | ทำอะไร |
|---|---|
| 1 | ลง Git (ถ้ายังไม่มี) |
| 2 | ลง Claude Code (ถ้ายังไม่มี) |
| 3 | โหลดเกมนี้ไว้ที่ `C:\Users\<ชื่อคุณ>\tarantula-3d` |
| 4 | ลงปลั๊กอิน Unreal MCP ให้ Claude (ตัวทางการของ Epic) |
| 5 | เปิดโปรเจกต์ Unreal `TarantulaUE` + เปิดเกม + เปิด Claude พร้อมคำสั่งงาน |

โปรเจกต์ `TarantulaUE` เปิดปลั๊กอินที่ต้องใช้ไว้แล้ว (Python, Unreal MCP, All Toolsets) และทุกครั้งที่เปิด
จะ **เปิดเซิร์ฟเวอร์ MCP ให้เอง** (`Content/Python/init_unreal.py`) · ครั้งแรกถ้าเจอ `tarantula-scene.glb` ใน Downloads จะนำเข้าฉากให้เอง
(หรือสั่ง Tools → Execute Python Script → `unreal/import_tarantula.py` ก็ได้)

## แผนย้ายเกม
| ขั้น | ทำอะไร | สถานะ |
|---|---|---|
| 1 | ปุ่ม 📦 ส่งออกฉากเป็น .glb | ✅ |
| 2 | นำเข้าฉาก + แสง ท้องฟ้า หมอก กล้อง | ✅ (สคริปต์) |
| 3 | แมงมุมเดินได้: เดิน ขาหาที่เหยียบ (IK) หิว ลอกคราบ | ✅ รอบแรก (`BP_Tarantula`, ขารูปทรงง่าย) |
| 4 | เหยื่อ, คน 2 คน, โหมดเอาชีวิตรอด 30 วัน, เฮลิคอปเตอร์ | ✅ (Blueprint รูปทรงง่าย) |
| 5 | UI ภาษาไทย, เซฟ, เสียง, ไฟล์เกม .exe | ✅ |
| 6 | แมงมุมโมเดลจริง 3 สายพันธุ์, น้ำ/หญ้าไหวลม/ใยแมงมุม, หน้าเลือกสายพันธุ์+ตั้งชื่อ, ฉากเปิด, คราบลอก, ฟองคำพูด | ✅ |

## เล่นเกม
- **ใน Unreal**: เปิดโปรเจกต์ → กด ▶ Play (ฉาก `SpiderTest` ตั้งเป็นฉากเริ่มต้นแล้ว)
- **ไฟล์เกม .exe (ไม่ต้องเปิด Unreal)**: `powershell -ExecutionPolicy Bypass -File unreal\tools\package.ps1` → ได้ `unreal\Build\Windows\TarantulaUE.exe` (~520 MB, ก๊อปทั้งโฟลเดอร์ `Windows` ไปเครื่องอื่นได้)

เปิดเกมจะมีฉากเปิด 10 วินาที (กด ข้าม ได้) แล้วหน้าเลือกสายพันธุ์ (บึ้งดำ / บึ้งน้ำตาล / บึ้งน้ำเงิน) + ตั้งชื่อ → เริ่มเล่น

| ปุ่ม | ทำอะไร |
|---|---|
| คลิกขวาค้าง + ลาก / ล้อเมาส์ / W A S D | หมุน / ซูม / เลื่อนกล้อง |
| 1 · 2 | ปล่อยจิ้งหรีด · แมลงสาบดูเบีย (สูงสุด 4 ตัว) |
| M · F · T · H | พ่นน้ำ · กล้องติดตามแมงมุม · เร่งเวลา 1×/10×/60× · วิธีเล่น |
| P | ปล่อยชัยภัทรกับตุ้ย (แมงมุมต้องขาใหญ่ถึง 12 ซม.) ต้องรอด 30 วัน แล้วเฮลิคอปเตอร์มารับ |

เกมเซฟเองทุก 15 วินาที (ช่องเซฟ `tarantula3d`) · ดูแลอัตโนมัติเมื่อหิวมาก/ตู้แห้ง

## แก้ Blueprint ด้วยสคริปต์ (ขณะ Unreal เปิดอยู่)
`cd unreal\tools` แล้ว `python bp.py <ไฟล์>`: `spider_bp.py` (แมงมุม) · `prey_bp.py` (เหยื่อ) · `human_bp.py` (คน) · `heli_bp.py` (เฮลิคอปเตอร์)
· `keeper_bp.py` (ผู้เล่น/กล้อง/เวลา/รอบเอาชีวิตรอด) · `hud_ui.py` + `hud_bp.py` (หน้าจอ UI) · `sg_bp.py` (เซฟ)
· `exu_bp.py` (คราบลอก) · `bubble_ui.py` (ฟองคำพูด)
· `mats.py` (สี) · `gen_sounds.py` (เสียง) · `level_setup.py` (จัดฉากหลังนำเข้า .glb ใหม่)
· แมงมุมโมเดลจริง: `node spider_kit.js` → `python kit_mats.py` → `python kit_import.py lividus minax huahini` · น้ำ/ลม/ใย: `python fx_mats.py` → `python webs_import.py` → `python level_setup.py`

ของต้นฉบับอยู่ในโฟลเดอร์ `js/` (อธิบายทุกไฟล์ใน `CLAUDE.md`) ใช้เป็นสเปกตอนสร้างใหม่ใน Blueprint

## ถ้าเจอปัญหา
- **Unreal ถามเรื่องเวอร์ชัน/แปลงโปรเจกต์** → กด Yes/Convert ได้เลย (โปรเจกต์ยังว่าง ไม่มีอะไรเสีย)
- **Claude บอกไม่เจอ unreal-mcp** → ดูว่า Unreal เปิดเสร็จแล้ว แล้วปิด/เปิด `claude` ใหม่
- **เปิด Claude รอบหน้า** → เปิด PowerShell → `cd ~\tarantula-3d` → `claude`
- อื่น ๆ → ก๊อปข้อความสีแดงให้ Claude ดู
