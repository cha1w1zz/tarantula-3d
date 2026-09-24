/* ลุคใหม่ "ป่าชื้นใต้หมอก" — ชั้นปรับภาพวางทับเกมเดิม (ไม่แตะระบบเกม)
   โหลดหลัง game.js เฉพาะใน preview.html */
(() => {
  // ฉากหลังและหมอก: เขียวอมฟ้าเข้ม กลางคืนฟ้าเข้ม
  BG_DAY.set(0x0e3a40); BG_NIGHT.set(0x04121c);
  scene.fog.density = .011;
  // ไฟ: ท้องฟ้าเขียวฟ้า พื้นสะท้อนอุ่น, LED เย็นขึ้นและแรงขึ้น, แสงขอบช่วยให้ตัวบึ้งเด่น
  hemi.color.set(0x7fd6d0); hemi.groundColor.set(0x4a2a18);
  led.color.set(0xcff4ff); LIGHT_BASE.led = 2.8; LIGHT_BASE.rim = .9; rim.color.set(0xffb070);
  // แสงฟุ้งแรงขึ้น
  bloom.strength = .75; bloom.radius = .7; bloom.threshold = .7;
  // ลำแสง: เกมตั้งค่าใหม่ทุกเฟรม เลยคูณเพิ่มตอนตั้งค่า
  const boost = (u, m) => { let v = u.value; Object.defineProperty(u, 'value', { get: () => v, set: x => { v = x * m; } }); };
  boost(ledBeamMat.uniforms.uI, 3.5); boost(lampBeamMat.uniforms.uI, 2.5);
  ledBeamMat.uniforms.uI.value = 0;
  // ฝุ่นลอย: เม็ดใหญ่ขึ้น สีฟ้าอ่อน
  dust.material.size *= 1.8; dust.material.color && dust.material.color.set(0xbff6ff);
  renderer.toneMappingExposure = 1.2;
})();
// หญ้า: บางลง สีโทนเดียวกัน (เขียวเซจอมฟ้า ปลายสว่าง) มีใบอุ่นแซมนิดหน่อย
(() => {
  const m = MEADOW.mesh, c = new THREE.Color();
  for (let i = 0; i < m.count; i++) {
    const r = frac(i * .7548776);
    if (r < .04) c.setHSL(.07, .55, .55);                 // ใบสีส้มอุ่นแซม
    else c.setHSL(.40 + r * .06, .28 + r * .12, .55 + r * .12);
    m.setColorAt(i, c.convertSRGBToLinear());
  }
  m.instanceColor.needsUpdate = true;
  setMeadowDensity(.5);
  const k = setMeadowDensity; window.setMeadowDensity = v => k(Math.min(v, .5));  // ปุ่มคุณภาพห้ามทำให้แน่นกลับ
})();
