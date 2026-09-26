# บึ้งไทย 3D → Unreal Engine 5: นำเข้าไฟล์ tarantula-scene.glb (จากปุ่ม 📦 ในเกม) แล้ววางลงฉากที่เปิดอยู่ พร้อมแสง ท้องฟ้า หมอก และกล้อง
# วิธีใช้: Unreal → Tools → Execute Python Script... → เลือกไฟล์นี้ (ต้องเปิดปลั๊กอิน "Python Editor Script Plugin")
# หาไฟล์ .glb จาก: โฟลเดอร์เดียวกับสคริปต์นี้ → โฟลเดอร์ Downloads
import os
import unreal

DEST = "/Game/Tarantula"
NAME = "tarantula-scene.glb"


def find_glb():
    here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else ""
    for d in (here, os.path.join(os.path.expanduser("~"), "Downloads")):
        p = os.path.join(d, NAME)
        if d and os.path.isfile(p):
            return p
    return None


def spawn(cls, loc=(0, 0, 0), rot=(0, 0, 0), label=None):
    sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    a = sub.spawn_actor_from_class(cls, unreal.Vector(*loc), unreal.Rotator(pitch=rot[0], yaw=rot[1], roll=rot[2]))
    if label:
        a.set_actor_label(label)
    return a


def has(cls):
    sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    return any(isinstance(a, cls) for a in sub.get_all_level_actors())


def main():
    glb = find_glb()
    if not glb:
        unreal.log_error("ไม่เจอ %s — วางไฟล์ไว้ข้างสคริปต์นี้ หรือในโฟลเดอร์ Downloads" % NAME)
        return

    # 1) นำเข้า: ได้ Static Mesh + Material ใน Content/Tarantula (ทุกชิ้นถูกอบตำแหน่งไว้แล้ว จุดหมุนอยู่ที่ 0,0,0)
    task = unreal.AssetImportTask()
    task.filename = glb
    task.destination_path = DEST
    task.automated = True
    task.replace_existing = True
    task.save = True
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    paths = list(task.imported_object_paths or [])
    if not paths:  # บางเวอร์ชันไม่คืนรายการ: หาเองจากโฟลเดอร์
        paths = unreal.EditorAssetLibrary.list_assets(DEST, recursive=True)

    # 2) วางทุก Static Mesh ที่จุด 0,0,0 แยกโฟลเดอร์ใน Outliner (World / Spider / Human / Prey)
    n, lo, hi = 0, None, None
    for p in paths:
        asset = unreal.EditorAssetLibrary.load_asset(p)
        if not isinstance(asset, unreal.StaticMesh):
            continue
        name = asset.get_name()
        a = spawn(unreal.StaticMeshActor, label=name)
        a.static_mesh_component.set_static_mesh(asset)
        folder = "Tarantula/World"
        for key in ("Spider", "Human", "Prey"):
            if key in name:
                folder = "Tarantula/" + key
        a.set_folder_path(folder)
        o, e = a.get_actor_bounds(False)
        lo = o - e if lo is None else unreal.Vector(min(lo.x, o.x - e.x), min(lo.y, o.y - e.y), min(lo.z, o.z - e.z))
        hi = o + e if hi is None else unreal.Vector(max(hi.x, o.x + e.x), max(hi.y, o.y + e.y), max(hi.z, o.z + e.z))
        n += 1
    unreal.log("วางโมเดล %d ชิ้นแล้ว" % n)

    # 3) แสง ท้องฟ้า หมอก (ถ้าฉากยังไม่มี) — ตู้กว้าง 120 ม. ในหน่วย Unreal = 12000 ซม.
    if not has(unreal.DirectionalLight):
        sun = spawn(unreal.DirectionalLight, (0, 0, 8000), (-50, 30, 0), "Tarantula_Sun")
        sun.light_component.set_intensity(6)
        sun.light_component.set_atmosphere_sun_light(True)
    if not has(unreal.SkyLight):
        sky = spawn(unreal.SkyLight, (0, 0, 6000), label="Tarantula_SkyLight")
        sky.light_component.set_editor_property("real_time_capture", True)
    if not has(unreal.SkyAtmosphere):
        spawn(unreal.SkyAtmosphere, label="Tarantula_Sky")
    if not has(unreal.ExponentialHeightFog):
        fog = spawn(unreal.ExponentialHeightFog, label="Tarantula_Fog")
        fog.component.set_fog_density(0.01)

    # 4) กล้องมองเฉียงลงมาที่กลางตู้ (คำนวณจากขนาดโมเดลจริง)
    if lo is not None:
        c = (lo + hi) * 0.5
        size = max(hi.x - lo.x, hi.y - lo.y)
        at = unreal.Vector(c.x - size * 0.7, c.y - size * 0.7, hi.z + size * 0.35)
        rot = unreal.MathLibrary.find_look_at_rotation(at, c)
        cam = spawn(unreal.CameraActor, (at.x, at.y, at.z), (rot.pitch, rot.yaw, rot.roll), "Tarantula_Camera")
        cam.set_folder_path("Tarantula")
    unreal.log("เสร็จแล้ว: กด G ดูแบบไม่มีเส้นช่วย หรือคลิกขวาที่ Tarantula_Camera → Pilot")


main()
