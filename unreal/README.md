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
| 3 | แมงมุมเดินได้: เดิน ขาหาที่เหยียบ (IK) หิว ลอกคราบ | ⏳ |
| 4 | เหยื่อ, คน 2 คน, โหมดเอาชีวิตรอด 30 วัน, เฮลิคอปเตอร์ | ⏳ |
| 5 | UI ภาษาไทย, เซฟ, เสียง, น้ำ/หญ้า/ใยแมงมุม แบบ Unreal | ⏳ |

ของต้นฉบับอยู่ในโฟลเดอร์ `js/` (อธิบายทุกไฟล์ใน `CLAUDE.md`) ใช้เป็นสเปกตอนสร้างใหม่ใน Blueprint

## ถ้าเจอปัญหา
- **Unreal ถามเรื่องเวอร์ชัน/แปลงโปรเจกต์** → กด Yes/Convert ได้เลย (โปรเจกต์ยังว่าง ไม่มีอะไรเสีย)
- **Claude บอกไม่เจอ unreal-mcp** → ดูว่า Unreal เปิดเสร็จแล้ว แล้วปิด/เปิด `claude` ใหม่
- **เปิด Claude รอบหน้า** → เปิด PowerShell → `cd ~\tarantula-3d` → `claude`
- อื่น ๆ → ก๊อปข้อความสีแดงให้ Claude ดู
