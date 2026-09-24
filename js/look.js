/* ลุคใหม่ — ชั้นปรับภาพวางทับเกมเดิม (ไม่แตะระบบเกม) โหลดหลัง game.js เฉพาะใน preview.html
   หลักดีไซน์: โทนเย็น (เขียวเซจ / เขียวอมฟ้า) + สีอุ่นเป็นจุดเด่นไม่เกิน 10%, ของจัดเป็นกลุ่ม เว้นดินว่าง,
   หน้า-กลาง-หลังขนาดต่างกัน, บึ้งต้องเด่นที่สุด ทุกอย่างสร้างครั้งเดียวตอนโหลด (InstancedMesh) ไม่สร้างของใหม่ทุกเฟรม */

// ---------- 0. บรรยากาศ: ยกเลิกโทนเขียวทั้งฉาก เหลือหมอกบาง ๆ ใส ๆ ----------
(() => {
  BG_DAY.set(0x1d262b).convertSRGBToLinear(); BG_NIGHT.set(0x06090d).convertSRGBToLinear();
  scene.fog.density = .005;
  hemi.color.set(0xd4e4ee); hemi.groundColor.set(0x33281e);
  led.color.set(0xeef6ff); LIGHT_BASE.rim = .7; rim.color.set(0xffc690);   // แสงขอบอุ่นช่วยแยกตัวบึ้งออกจากพื้น
  bloom.strength = .45; bloom.radius = .55; bloom.threshold = .8;
})();

// ตัวช่วย: ต่อโค้ด shader เพิ่มจากที่ bendable() / triplanar() ใส่ไว้แล้ว (ไม่ทับของเดิม)
function lookShader(mat, key, fn) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh); };
  mat.customProgramCacheKey = () => prevKey + '|' + key;
}
// ตัวช่วย: เอาพืชเดิมออกจากฉากและจากระบบแหวก
function dropFoliage(f) { scene.remove(f.mesh); const i = foliage.indexOf(f); if (i >= 0) foliage.splice(i, 1); }
const LR = seeded(2468), lr = (a, b) => a + LR() * (b - a), lg = () => (LR() + LR() + LR() - 1.5) / 1.5;
const okSpot = (x, z, pad) => clearSpot(x, z) && !onRock(x, z, pad == null ? .4 : pad);
// ระยะภาพ: ของด้านหลัง (z ติดลบ) ใหญ่ ด้านหน้า (z บวก) เล็ก
const depthScale = z => lerp(1.25, .7, clamp((z + TD / 2) / TD, 0, 1));

// ---------- 1. พืชใบกว้าง: ใบโค้งจริง (ตามยาว + ตามขวาง) มีเส้นกลางใบ โคนเข้ม ปลายสว่าง ----------
// รูปใบวาดบน canvas: v = 0 โคน → 1 ปลาย, ส่วนล่างเป็นก้านใบ (stem) แล้วค่อยเป็นแผ่นใบ
function leafTex(o) {
  return alphaShape(256, 512, (g, w, h) => {
    const y0 = h * (1 - o.stem), top = h * .02, bl = y0 - top, cx = w / 2;
    const Y = t => y0 - bl * t;                                                  // t: 0 โคนแผ่นใบ → 1 ปลาย
    g.lineCap = 'round';
    if (o.stem > 0) { g.strokeStyle = o.petiole; g.lineWidth = 10; g.beginPath(); g.moveTo(cx, h - 2); g.lineTo(cx, y0 + 4); g.stroke(); }
    g.beginPath();
    for (let k = 0; k <= 60; k++) { const t = k / 60; g.lineTo(cx - o.half(t) * w * .48, Y(t)); }
    for (let k = 60; k >= 0; k--) { const t = k / 60; g.lineTo(cx + o.half(t) * w * .48, Y(t)); }
    g.closePath();
    const gr = g.createLinearGradient(0, y0, 0, top);                           // โคนเข้ม → ปลายสว่าง
    o.grad.forEach(([s, c]) => gr.addColorStop(s, c)); g.fillStyle = gr; g.fill();
    g.save(); g.clip(); o.paint(g, w, h, cx, Y, bl);
    g.strokeStyle = o.rib; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, y0); g.quadraticCurveTo(cx + 3, Y(.5), cx, top); g.stroke();   // เส้นกลางใบ
    g.restore(); g.strokeStyle = 'rgba(12,24,16,.55)'; g.lineWidth = 2; g.stroke();
  });
}
// คาลาเทีย: เขียวเข้มอมฟ้า ลายขนนกเขียวอ่อนตามเส้นใบข้าง, ใต้ใบแดงอมม่วง (ใส่ใน shader)
const CALATHEA_TEX = leafTex({
  stem: .3, petiole: '#3d5a44', rib: 'rgba(170,205,180,.75)',
  half: t => Math.pow(Math.sin(Math.PI * Math.pow(t, .8)), .75) * .95,
  grad: [[0, '#10261a'], [.5, '#1f4230'], [1, '#3d6a50']],
  paint: (g, w, h, cx, Y) => {
    for (let k = 1; k < 13; k++) { const t = k / 13.5, y = Y(t), sp = Math.sin(Math.PI * Math.pow(t, .8)) * w * .44, big = k % 2;
      [-1, 1].forEach(s => {
        // ลายขนนก: ขีดเรียวสีเขียวอ่อนหม่น ยาวสลับสั้น ไม่เต็มใบ
        const L = sp * (big ? .62 : .38); g.fillStyle = `rgba(118,160,132,${big ? .5 : .38})`;
        g.beginPath(); g.moveTo(cx + s * 4, y + 5); g.quadraticCurveTo(cx + s * L * .5, y - 10, cx + s * L, y - 22); g.quadraticCurveTo(cx + s * L * .5, y + 2, cx + s * 4, y + 13); g.fill();
        g.strokeStyle = 'rgba(8,22,14,.45)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, y + 16); g.quadraticCurveTo(cx + s * sp * .5, y + 8, cx + s * sp, y - 12); g.stroke(); });   // เส้นใบข้าง
    }
    for (let i = 0; i < 60; i++) blob(g, Math.random() * w, Math.random() * h, rand(6, 16), 'rgba(8,22,14,1)', .1);
  },
});
// พลูด่าง: ใบรูปหัวใจ เขียวเซจ มีลายด่างครีมอมเขียวเป็นริ้ว ๆ (หม่น ไม่แย่งตาบึ้ง)
const POTHOS_TEX = leafTex({
  stem: .16, petiole: '#55704a', rib: 'rgba(215,225,190,.7)',
  half: t => Math.pow(Math.sin(Math.PI * Math.min(1, .12 + t * .92)), .9) * (1 - .5 * Math.pow(t, 3)) * .9 + (t < .08 ? .1 : 0),
  grad: [[0, '#233d25'], [.55, '#3f6b3f'], [1, '#6e9a64']],
  paint: (g, w, h, cx, Y, bl) => {
    for (let i = 0; i < 26; i++) { const t = Math.random(), s = Math.random() < .5 ? -1 : 1, x = cx + s * rand(4, 90) * Math.sin(Math.PI * t), y = Y(t);
      g.strokeStyle = `rgba(214,222,186,${rand(.25, .6)})`; g.lineWidth = rand(2, 9); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 18, y - 24, x + s * rand(20, 50), y - rand(30, 70)); g.stroke(); }
    g.strokeStyle = 'rgba(20,40,20,.35)'; g.lineWidth = 1.5;
    for (let k = 1; k < 7; k++) { const y = Y(k / 7.5); [-1, 1].forEach(s => { g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * 40, y - 20, cx + s * 80, y - bl * .16); g.stroke(); }); }
  },
});
// ฟิตโตเนียจิ๋ว (ด้านหน้า): ใบรีเล็ก เส้นใบแดงอมชมพูหม่น = สีอุ่นเป็นจุดเด่นเล็ก ๆ
const FITTONIA_TEX = leafTex({
  stem: .12, petiole: '#46604a', rib: 'rgba(205,95,105,.95)',
  half: t => Math.pow(Math.sin(Math.PI * Math.pow(t, .9)), .6) * .95,
  grad: [[0, '#1c3326'], [.6, '#2f5540'], [1, '#4c7658']],
  paint: (g, w, h, cx, Y, bl) => {
    g.strokeStyle = 'rgba(196,84,96,.9)'; g.lineWidth = 4;
    for (let k = 1; k < 7; k++) { const t = k / 7.5, y = Y(t), sp = Math.pow(Math.sin(Math.PI * t), .6) * w * .44;
      [-1, 1].forEach(s => { g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * sp * .5, y - 8, cx + s * sp * .92, y - bl * .1); g.stroke(); }); }
    for (let i = 0; i < 40; i++) { const y = Y(Math.random()), x = cx + (Math.random() - .5) * w * .7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-14, 14), y - rand(8, 18)); g.stroke(); }   // ลายตาข่าย
  },
});
// รูปทรงใบ 3D: arch = โค้งตามยาว (ปลายห้อย), vee = พับเป็นร่องกลางใบตามขวาง, curl = ขอบใบม้วนลงช่วงปลาย, wave = ขอบหยัก
function curvedLeaf(o) {
  const disp = (x, y) => {
    const blade = sstep(o.stem, o.stem + .15, y), ax = Math.abs(x);
    return [y - o.arch * .45 * y * y * y, o.arch * y * y - ax * o.vee * blade * (1.2 - y) + x * x * o.curl * y * blade + Math.sin(y * 19) * o.wave * ax * blade];
  };
  const g = new THREE.PlaneGeometry(1, 1, 8, 18); g.translate(0, .5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), [y, z] = disp(x, p.getY(i)); p.setY(i, y); p.setZ(i, z); }
  g.computeVertexNormals();
  const pt = y => { const [yy, zz] = disp(0, y); return new V3(0, yy, zz); };
  return { geo: g, tip: pt(1), mid: pt(.6), low: pt(.35) };
}
// ใต้ใบ (ด้านหน้าของ plane หันลงดินเมื่อใบเอนออก) ใส่สีแดงอมม่วง
function undersideTint(mat, key, col, amt) {
  lookShader(mat, key, sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${col}) * (.35 + 1.6 * dot(diffuseColor.rgb, vec3(.3, .6, .1))), ${amt});`);
  });
}
const leafMat = (tex, key, emi) => track(new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: .55, emissive: emi || 0x030805 }), .45);
{
  // ของเดิม: กอใบยาว + กอใบกลม (สีเขียวมะนาวสด) เอาออก
  const oldStrap = foliage[1], oldOval = foliage[2]; dropFoliage(oldStrap); dropFoliage(oldOval);

  // plant(): กอเดียว = ใบหลายใบบานออกจากโคน ใบในสั้นตั้งตรง ใบนอกยาวเอนออก
  const plant = (list, cx, cz, n, size, tiltIn, tiltOut, g) => {
    const s = size * depthScale(cz);
    for (let i = 0; i < n; i++) {
      const out = Math.sqrt((i + LR() * .5) / n), yaw = i * 2.39996 + lr(-.3, .3);   // หมุนแบบวงก้นหอย (golden angle) ใบไม่ทับกัน
      const x = cx + Math.sin(yaw) * out * .35 * s, z = cz + Math.cos(yaw) * out * .35 * s;
      if (!okSpot(x, z, .2)) continue;
      const len = s * lerp(.6, 1, out) * lr(.85, 1.1);
      dummy.position.set(x, groundY(x, z) - .05, z); dummy.rotation.set(lerp(tiltIn, tiltOut, out) + lr(-.12, .12), yaw, lr(-.2, .2));
      dummy.scale.set(len * lr(.5, .6), len, len); dummy.updateMatrix();
      list.push({ m: dummy.matrix.clone(), c: new THREE.Color().setScalar(lr(.68, .95)), g });
    }
  };
  const cal = [], pot = [], fit = [];
  let g = 0;
  // คาลาเทีย: กลุ่มใหญ่ด้านหลัง (กรอบฉาก) + กลุ่มกลางข้างขอน
  [[-3, -15.5, 4.6, 16], [1.5, -16.5, 3.6, 11], [15.5, -16.2, 4.2, 14], [28, -16, 3.4, 10], [-27.5, -15.5, 3.2, 9]]
    .forEach(([x, z, s, n]) => plant(cal, x, z, n, s, .25, 1.05, g++));
  // พลูด่าง: กลุ่มระดับกลาง ใบห้อยต่ำ
  [[-27.5, 3, 2.4, 14], [26.5, 1.5, 2.3, 13], [-11.5, -1.5, 1.9, 9], [5, 7.5, 1.7, 9]]
    .forEach(([x, z, s, n]) => plant(pot, x, z, n, s, .6, 1.35, g++));
  // ฟิตโตเนีย: กอเล็กด้านหน้า
  [[-21, 17.3, 2.6, 14], [9.5, 17.4, 2.3, 12], [-6.5, 18, 2, 9]]
    .forEach(([x, z, s, n]) => plant(fit, x, z, n, s, .7, 1.4, g++));
  const add = (list, tex, shape, k, key, under) => {
    if (!list.length) return;
    const L = curvedLeaf(shape), m = leafMat(tex, key);
    addFoliage(L.geo, m, cutoutDepth(tex, .5), list, { tip: L.tip, mid: L.mid, low: L.low, k, c: 8, wind: .025 });
    if (under) undersideTint(m, key, under[0], under[1]);
  };
  add(cal, CALATHEA_TEX, { stem: .3, arch: .42, vee: .22, curl: .25, wave: .05 }, 30, 'cal', ['.42, .08, .2', .85]);
  add(pot, POTHOS_TEX, { stem: .16, arch: .55, vee: .18, curl: .5, wave: 0 }, 36, 'pot', ['.3, .38, .26', .35]);
  add(fit, FITTONIA_TEX, { stem: .12, arch: .35, vee: .25, curl: .3, wave: 0 }, 50, 'fit', ['.3, .2, .22', .5]);
}

// ---------- 2. หญ้า: กอเล็ก ๆ ใบโค้งพลิ้ว จำนวนเหลือ ~35% ของเดิม เห็นดินระหว่างกอ โคนมืด ปลายสว่าง ----------
const GRASS_TEX = alphaShape(16, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, '#132319'); gr.addColorStop(.3, '#35603f'); gr.addColorStop(.8, '#7eaa86'); gr.addColorStop(1, '#b2d2ac'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
let GRASS = null;
{
  MEADOW.mesh.visible = false; dropFoliage(MEADOW);                    // ทุ่งหญ้าพรมเดิม (~21k ใบ) ปิดไป
  // ใบหญ้า: เรียวแหลม โค้งพลิ้วเป็นรูปตัว S เล็กน้อย
  const bg = new THREE.PlaneGeometry(.13, 1, 1, 6); bg.translate(0, .5, 0);
  { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * .88)); p.setZ(i, y * y * .55 + Math.sin(y * 3.2) * .05); }
    const n = bg.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }   // แสงแบบสนามหญ้า ไม่เป็นแผ่นการ์ด
  const list = [], cell = 2.5;
  // จุดกอ: ตารางสุ่มห่าง ~1.1 แล้วคัดด้วย noise ให้เป็นหย่อม ๆ (แน่นบางที่ โล่งบางที่)
  for (let x = -TW / 2 + 1.5; x < TW / 2 - 1.5; x += 1.1) for (let z = -TD / 2 + 1.5; z < TD / 2 - 1.5; z += 1.1) {
    const cx = x + lr(-.45, .45), cz = z + lr(-.45, .45);
    const m = fbm(cx * .07, 3.3, cz * .07) * 2.4 + fbm(cx * .25, 5.1, cz * .25) * .6;
    if (m < .02 || LR() > sstep(.02, .35, m) || !okSpot(cx, cz, .5)) continue;
    const n = 12 + (LR() * 10 | 0) + (m > .35 ? 6 : 0), size = lr(.9, 1.5) * (.65 + .5 * sstep(.02, .5, m)) * lerp(1.2, .8, clamp((cz + TD / 2) / TD, 0, 1));
    const hue = .36 + fbm(cx * .1, 9.7, cz * .1) * .1, gid = Math.floor((cx + TW / 2) / cell) * 100 + Math.floor((cz + TD / 2) / cell);
    for (let b = 0; b < n; b++) {
      const a = LR() * 6.283, r = Math.sqrt(LR()) * .28, px = cx + Math.sin(a) * r, pz = cz + Math.cos(a) * r, h = size * lr(.7, 1.35) * (1 - r * 1.2);
      dummy.position.set(px, groundY(px, pz) - .04, pz); dummy.rotation.set(lr(.05, .3) + r * 1.4, a + lr(-.5, .5), lr(-.2, .2));   // ใบเอนออกจากกลางกอ
      dummy.scale.set(lr(.8, 1.2), h, h); dummy.updateMatrix();
      const dry = LR() < .05;
      list.push({ m: dummy.matrix.clone(), c: new THREE.Color().setHSL(dry ? .1 : hue + lr(-.015, .015), dry ? .25 : lr(.2, .34), dry ? lr(.5, .6) : lr(.4, .55)).convertSRGBToLinear(), g: gid });
    }
  }
  list.sort((a, b) => a.g - b.g);
  addFoliage(bg, track(new THREE.MeshStandardMaterial({ map: GRASS_TEX, side: THREE.DoubleSide, roughness: .75 }), .3),
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), list, { tip: new V3(0, 1, .55), mid: new V3(0, .6, .24), low: new V3(0, .35, .1), k: 60, c: 10, gpuWind: true });
  GRASS = foliage[foliage.length - 1]; GRASS.mesh.castShadow = false;
  // ปุ่มคุณภาพภาพ: ลดความหนาแน่นหญ้าชุดใหม่แทน
  const M = []; { const m = new THREE.Matrix4(); for (let i = 0; i < GRASS.mesh.count; i++) { GRASS.mesh.getMatrixAt(i, m); M.push(m.clone()); } }
  window.setMeadowDensity = keep => { const zero = new THREE.Matrix4().makeScale(0, 0, 0), k = Math.min(1, keep * 1.4);
    M.forEach((m, i) => GRASS.mesh.setMatrixAt(i, frac(i * .618034) < k ? m : zero)); GRASS.mesh.instanceMatrix.needsUpdate = true; };
  setMeadowDensity(quality === 'high' ? 1 : quality === 'min' ? .35 : .6);
}
// เฟิร์นและกกเดิม: เปลี่ยนจากเขียวมะนาวสด เป็นเขียวเซจอมฟ้าเข้มขึ้น (เก็บรูปทรงและการแหวกไว้)
{
  const c = new THREE.Color();
  scene.children.forEach(o => { if (o.isInstancedMesh && o.material.map === PINNA_TEX) {
    for (let i = 0; i < o.count; i++) { o.getColorAt(i, c); const hsl = {}; c.convertLinearToSRGB().getHSL(hsl);
      o.setColorAt(i, c.setHSL(.37 + (hsl.h - .25) * .5, hsl.s * .45, hsl.l * .62).convertSRGBToLinear()); }
    o.instanceColor.needsUpdate = true; } });
  const sedge = foliage[0];
  for (let i = 0; i < sedge.mesh.count; i++) sedge.mesh.setColorAt(i, c.setHSL(lr(.36, .44), lr(.1, .2), lr(.3, .4)).convertSRGBToLinear());
  sedge.mesh.instanceColor.needsUpdate = true;
}

// ---------- 3. มอสปุยนุ่มเกาะบนหินและขอน: ก้อนกลมเล็ก ๆ (instanced) ขอบเรืองนิด ๆ ให้ดูนุ่มเหมือนกำมะหยี่ ----------
{
  const geo = new THREE.IcosahedronGeometry(1, 1), p = geo.attributes.position;   // ปุยเล็กมาก ใช้โพลิกอนน้อยพอ (~7k ปุย × 80 สามเหลี่ยม)
  for (let i = 0; i < p.count; i++) { const v = new V3().fromBufferAttribute(p, i); v.multiplyScalar(1 + PERLIN.noise(v.x * 2.5, v.y * 2.5, v.z * 2.5) * .22); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const mat = track(new THREE.MeshStandardMaterial({ map: MOSS.map, roughness: 1, color: 0xffffff }), .2);
  lookShader(mat, 'mossfuzz', sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    { float fz = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))); totalEmissiveRadiance += diffuseColor.rgb * (fz * fz * 1.2 + .12); }`); });   // ขอบปุยสว่าง = ดูนุ่ม
  const list = [], q = new THREE.Quaternion(), c = new THREE.Color();
  const puff = (x, y, z, n, s) => {                                  // n = ทิศผิวที่เกาะ
    q.setFromUnitVectors(UP, n); dummy.position.set(x, y, z); dummy.quaternion.copy(q); dummy.rotateY(LR() * 6.283);
    dummy.scale.set(s * lr(.9, 1.3), s * lr(.4, .6), s * lr(.9, 1.3)); dummy.updateMatrix();
    const warm = LR() < .08;                                         // ปลายมอสเหลืองอุ่นแซมนิดหน่อย
    list.push([dummy.matrix.clone(), c.setHSL(warm ? .19 : lr(.27, .36), warm ? .4 : lr(.28, .42), warm ? lr(.45, .52) : lr(.36, .5)).convertSRGBToLinear().clone()]);
  };
  // หิน: เกาะเป็นหย่อมบนส่วนที่หันขึ้น (ด้านบน/ไหล่หิน) ไม่คลุมทั้งก้อน
  ROCKS.forEach((k, ki) => {
    const tries = Math.round(k.r * k.r * 140);
    for (let t = 0; t < tries; t++) {
      const a = LR() * 6.283, r = Math.sqrt(LR()) * k.r, x = k.x + Math.sin(a) * r, z = k.z + Math.cos(a) * r, y = groundY(x, z);
      if (y < soilY(x, z) + .12) continue;
      const n = groundN(x, z); if (n.y < .55) continue;
      const patch = fbm(x * .35, ki * 3.1, z * .35) + (n.y - .8) * .6;
      if (patch < .08) continue;
      puff(x, y - .02, z, n, lr(.06, .13) * (.7 + patch * 1.5));
    }
  });
  // ขอน: ด้านบนของเปลือก เป็นแถบ ๆ ตามแนวยาว
  const yc = soilY(LOG.c.x, LOG.c.z) - 1.05;
  for (let t = 0; t < 9000; t++) {
    const al = lr(-LOG.len / 2 + .4, LOG.len / 2 - .4), ph = lg() * 1.1, patch = fbm(al * .18, ph * 1.5, 7.7) * 1.4 + .15 - Math.abs(ph) * .3;
    if (patch < .12) continue;
    const R = LOG.R + .35, w = logWorld(al, Math.sin(ph) * R), n = new V3(-LOG.a.z * Math.sin(ph), Math.cos(ph), LOG.a.x * Math.sin(ph)).normalize();
    puff(w.x, yc + Math.cos(ph) * R - .08, w.z, n, lr(.08, .17) * (.8 + patch));
  }
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach(([mm, cc], i) => { m.setMatrixAt(i, mm); m.setColorAt(i, cc); }); m.receiveShadow = true; scene.add(m);
}

// ---------- 4. ของตกแต่งพื้นจัดเป็นกลุ่ม: ใบไม้แห้งหลายสี กิ่งไม้เล็ก ก้อนกรวด เห็ดจิ๋วข้างขอน ----------
{
  // ของเดิมที่โรยสุ่มทั่วพื้น: เอาออก (เก็บ geometry ไว้ใช้ต่อ)
  let leafGeo = null, pebGeo = null;
  scene.children.slice().forEach(o => {
    if (o.isInstancedMesh && o.material.map === LEAF_TEX) { leafGeo = o.geometry; scene.remove(o); }
    else if (o.isInstancedMesh && o.material.normalMap === ROCK.normalMap && !o.material.map) { pebGeo = o.geometry; scene.remove(o); }
    else if (o.isMesh && !o.isInstancedMesh && o.material.map === BARK.map && o.geometry.type === 'CylinderGeometry') scene.remove(o);
  });
  const c = new THREE.Color(), inst = (geo, mat, list, shadow) => { const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([mm, cc], i) => { m.setMatrixAt(i, mm); m.setColorAt(i, cc); }); m.castShadow = shadow !== false; m.receiveShadow = true; scene.add(m); return m; };
  const logSide = (x, z) => { const q = logLocal(x, z); return Math.abs(q.al) < LOG.len / 2 + 1 && Math.abs(q.sd) < LOG.R + 1; };
  // ใบไม้แห้ง: น้ำตาล/แทน/เทาอมเขียว เป็นหลัก, ส้มแดง ~8%
  const leaves = [];
  [[-12, 6.5, 12, 1.4], [1.5, -3.5, 9, 1.1], [-25, -1, 10, 1.3], [14.5, 4, 8, 1], [-1.5, 17.5, 7, 1], [22, -4.5, 9, 1.1], [-19, 4, 6, .8]].forEach(([cx, cz, n, sp]) => {
    for (let i = 0; i < n; i++) { const x = cx + lg() * sp, z = cz + lg() * sp; if (!okSpot(x, z, .3) || logSide(x, z)) continue;
      dummy.position.set(x, groundY(x, z) + .05 + i * .006, z); dummy.rotation.set(lr(-.15, .15), LR() * 6.3, lr(-.15, .15)); dummy.scale.setScalar(lr(1.3, 2.4) * depthScale(z)); dummy.updateMatrix();
      const r = LR();
      if (r < .08) c.setHSL(lr(.02, .06), lr(.5, .62), lr(.34, .42));          // ส้มแดง (จุดเด่นอุ่น)
      else if (r < .3) c.setHSL(lr(.14, .2), lr(.12, .22), lr(.3, .38));        // เทาอมเขียว (ใบเพิ่งร่วง)
      else c.setHSL(lr(.06, .09), lr(.2, .38), lr(.18, .32));                   // น้ำตาล
      leaves.push([dummy.matrix.clone(), c.convertSRGBToLinear().clone()]); } });
  if (leafGeo) { const lm = inst(leafGeo, track(new THREE.MeshStandardMaterial({ map: LEAF_TEX, alphaTest: .5, side: THREE.DoubleSide, roughness: .8 }), .25), leaves); lm.customDepthMaterial = cutoutDepth(LEAF_TEX, .5); }
  // กิ่งไม้เล็ก: กองละ 3–5 กิ่งวางไขว้กัน
  const tg = new THREE.CylinderGeometry(.55, 1, 1, 7, 8); tg.rotateZ(Math.PI / 2);
  { const p = tg.attributes.position; for (let j = 0; j < p.count; j++) p.setY(j, p.getY(j) + Math.sin(p.getX(j) * 2.4) * .35); tg.computeVertexNormals(); }
  const twigs = [];
  [[-13.5, 8, 4], [3, -2.5, 3], [21, -3, 4], [-24, 1.5, 3], [7.5, 15.5, 3]].forEach(([cx, cz, n]) => {
    const base = LR() * 3.14;
    for (let i = 0; i < n; i++) { const x = cx + lg() * .8, z = cz + lg() * .8; if (!okSpot(x, z, .8)) continue;
      const len = lr(2.5, 6) * (i ? .7 : 1), r = lr(.09, .18);
      dummy.position.set(x, groundY(x, z) + r * .7 + i * .05, z); dummy.rotation.set(0, base + lr(-.9, .9), lr(-.05, .05)); dummy.scale.set(len, r, r); dummy.updateMatrix();
      twigs.push([dummy.matrix.clone(), c.setHSL(lr(.06, .09), lr(.15, .3), lr(.22, .38)).convertSRGBToLinear().clone()]); } });
  inst(tg, track(new THREE.MeshStandardMaterial({ map: BARK.map, normalMap: BARK.normalMap, roughness: .9 }), .3), twigs);
  // กรวด: เกาะกลุ่มที่โคนหิน (ด้านหน้า) และรอบจานน้ำ ไม่โรยทั่ว
  const pebs = [];
  ROCKS.slice(0, 6).forEach(k => { const a0 = lr(-1, 1);
    for (let i = 0; i < 14; i++) { const a = a0 + lg() * 1.1, d = k.r + lr(.2, 1.4) * (1 + Math.abs(lg())), x = k.x + Math.sin(a) * d, z = k.z + Math.cos(a) * d;
      if (!okSpot(x, z, .1)) continue; const s = Math.pow(LR(), 2) * .35 + .07;
      dummy.position.set(x, groundY(x, z) + s * .1, z); dummy.rotation.set(LR() * 6, LR() * 6, LR() * 6); dummy.scale.set(s, s * lr(.5, .8), s * lr(.8, 1.2)); dummy.updateMatrix();
      pebs.push([dummy.matrix.clone(), c.setHSL(lr(.08, .6), lr(.03, .08), lr(.22, .4)).convertSRGBToLinear().clone()]); } });
  if (pebGeo) inst(pebGeo, track(new THREE.MeshStandardMaterial({ normalMap: ROCK.normalMap, roughness: .6 }), .6), pebs);
  // เห็ดจิ๋วข้างขอน 2 กลุ่ม: หมวกสีแทนหม่น ก้านครีม (ไม่สดแย่งตาบึ้ง)
  const capG = new THREE.SphereGeometry(1, 16, 8, 0, 6.283, 0, 1.35); capG.scale(1, .55, 1);
  { const p = capG.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + (p.getY(i) < .15 ? -.05 : 0)); capG.computeVertexNormals(); }
  const stemG = new THREE.CylinderGeometry(.18, .26, 1, 8); stemG.translate(0, .5, 0);
  const caps = [], stems = [];
  [[-3, LOG.R + .9, 7], [-LOG.len / 2 + .6, LOG.R + .8, 5]].forEach(([al0, sd0, n]) => {
    for (let i = 0; i < n; i++) { const w = logWorld(al0 + lg() * 1.1, sd0 + Math.abs(lg()) * .9), x = w.x, z = w.z, y = groundY(x, z);
      const h = lr(.35, .9) * (i < 2 ? 1.3 : 1), cs = h * lr(.45, .7), lean = lr(-.25, .25), yaw = LR() * 6.3;
      dummy.position.set(x, y - .05, z); dummy.rotation.set(lean, yaw, 0); dummy.scale.set(cs * .5, h, cs * .5); dummy.updateMatrix();
      stems.push([dummy.matrix.clone(), c.setHSL(.1, .15, lr(.5, .6)).convertSRGBToLinear().clone()]);
      const top = new V3(0, h, 0).applyEuler(new THREE.Euler(lean, yaw, 0, 'YXZ'));
      dummy.position.set(x + top.x, y - .05 + top.y, z + top.z); dummy.scale.set(cs, cs, cs); dummy.updateMatrix();
      caps.push([dummy.matrix.clone(), c.setHSL(lr(.06, .09), lr(.3, .42), lr(.26, .38)).convertSRGBToLinear().clone()]); } });
  inst(stemG, track(new THREE.MeshStandardMaterial({ roughness: .7 }), .3), stems);
  inst(capG, track(new THREE.MeshStandardMaterial({ roughness: .45, side: THREE.DoubleSide }), .4), caps);
}

// ---------- 5. หิน: ร่องมืดนิด ๆ ขอบสว่าง ด้านล่างเงาทึบ ด้านบนมีคราบไลเคนเซจจาง ๆ (shader อย่างเดียว รูปทรง/ทางเดินเหมือนเดิม) ----------
rockMat.extensions = Object.assign(rockMat.extensions || {}, { derivatives: true });
lookShader(rockMat, 'rockdetail', sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
    { float lum = dot(sRGBToLinear(triA).rgb, vec3(.3, .59, .11));
      diffuseColor.rgb *= mix(.8, 1.06, smoothstep(.02, .2, lum));                         // ร่องในลายหิน มืดลงนิดเดียว (ไม่ให้เป็นเส้นหมึก)
      float curv = length(fwidth(triN)) / max(length(fwidth(vTriP)), 1e-4);
      diffuseColor.rgb *= 1.0 + clamp((curv - .25) * .35, 0.0, .3);                        // สันและขอบคม = สว่างขึ้นนิด ๆ (หินสึก)
      diffuseColor.rgb *= mix(.5, 1.0, smoothstep(-.35, .45, triN.y));                      // ใต้ท้องหินทึบ ช่วยให้หินนั่งบนดิน
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.85, 1.02, .95), smoothstep(.6, .95, triN.y)); }`);   // ด้านบนอมเขียวเทานิด ๆ
});

// ---------- 6. ผิวใหม่: หินจริง + กำแพงเปลือกไม้ก๊อก (วาดครั้งเดียวตอนโหลด, รูปทรงเหมือนเดิม) ----------
// เซลล์ Worley แบบต่อลายไร้รอยต่อ: คืน [ระยะใกล้สุด, ระยะที่สอง, รหัสเซลล์]  sy < 1 = เซลล์ยืดตามแนวตั้ง
function tileWorley(nx, ny, sy) {
  const P = new Float32Array(nx * ny * 2); for (let i = 0; i < P.length; i++) P[i] = LR();
  return (u, v) => { const x = u * nx, y = v * ny, xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, k = ((((cy % ny) + ny) % ny) * nx + (((cx % nx) + nx) % nx)) * 2;
      const dx = cx + P[k] - x, dy = (cy + P[k + 1] - y) * sy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d; }
    return [f1, f2, id]; };
}
function pixTex(w, h, fn, nStrength, post) {   // fn(u, v) → [r, g, b, height 0..1]
  const a = cnv(w, h), hh = cnv(w, h), ga = a.getContext('2d'), gh = hh.getContext('2d'), A = ga.createImageData(w, h), H = gh.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, c = fn(x / w, y / h);
    A.data[o] = c[0]; A.data[o + 1] = c[1]; A.data[o + 2] = c[2]; A.data[o + 3] = 255; H.data[o] = H.data[o + 1] = H.data[o + 2] = clamp(c[3], 0, 1) * 255; H.data[o + 3] = 255; }
  ga.putImageData(A, 0, 0); gh.putImageData(H, 0, 0); if (post) post(ga, gh, w, h);
  return { map: mkTex(a, true), normalMap: mkTex(heightToNormal(hh, nStrength), false) };
}
const mix3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
// หิน: เนื้อหินเทาอมเย็น สีไม่เรียบ (ก้อนใหญ่-กลาง-เล็ก), เกล็ดแร่ละเอียด, หลุมสึกนุ่ม ๆ, คราบไลเคนเทาเขียวจาง ๆ เป็นหย่อม
// รอยแตก = ร่องบางคดเคี้ยว มีแค่บางช่วง ความลึกมาจาก normal map (ร่องมืด + ขอบรับแสง) สีเข้มขึ้นแค่นิดเดียว ไม่ใช่เส้นหมึก
const STONE = (() => {
  const big = tileFbm(3, 4), mid = tileFbm(9, 3), fine = tileFbm(40, 2), tint = tileFbm(2, 3), lich = tileFbm(6, 3), fmask = tileFbm(3, 3), crk = tileFbm(4, 4), pits = tileWorley(30, 30, 1);
  const dark = [60, 59, 56], light = [136, 131, 122], warm = [114, 99, 83], lichen = [148, 156, 140];
  return pixTex(512, 512, (u, v) => {
    const b = big(u, v), m = mid(u, v), f = fine(u, v), [p1, , pid] = pits(u, v);
    const cn = Math.abs(crk(u + m * .03, v + b * .03));                                 // เส้นศูนย์ของ noise ที่บิดแล้ว = แนวรอยแตกคดเคี้ยวแบบธรรมชาติ
    const crack = (1 - sstep(0, .022, cn)) * sstep(.22, .45, fmask(u, v));              // บาง + ขอบนุ่ม + เฉพาะบางหย่อม (ไม่เป็นตาข่าย)
    const near = (1 - sstep(0, .09, cn)) * sstep(.22, .45, fmask(u, v));                // เงาจาง ๆ รอบร่อง (สิ่งสกปรกสะสม)
    let t = clamp(.5 + b * .9 + m * .5 + f * .35, 0, 1), c = mix3(dark, light, t);
    c = mix3(c, warm, clamp(tint(u, v) * 2 + .1, 0, .45));                          // คราบสนิมอุ่นจาง ๆ
    const sp = Math.random(); if (sp < .06) c = mix3(c, [196, 192, 182], .3); else if (sp < .12) c = mix3(c, [30, 30, 30], .3);   // เกล็ดแร่ (จาง)
    const L = clamp((lich(u, v) - .1) * 5, 0, 1) * sstep(.3, .6, t); c = mix3(c, lichen, L * .55);   // ไลเคน
    const pit = p1 < .1 && (pid * 7 % 10) < 4 ? sstep(0, 1, (.1 - p1) * 10) * sstep(.1, .3, -f) : 0;   // หลุมสึกเล็ก ๆ ก้นมน
    c = c.map(x => x * (1 - crack * .28) * (1 - near * .08) * (1 - pit * .2));
    return [c[0], c[1], c[2], .5 + b * .45 + m * .35 + f * .2 - crack * .14 - near * .03 - pit * .12 + L * .04];
  }, 4);
})();
// กำแพงหลัง: เปลือกไม้ก๊อกจริง = ผิวขรุขระเป็นปุ่มนูน มีร่องกว้างก้นมนตามแนวตั้ง, สันสว่างอมเทา, ร่องสีน้ำตาลแดงเข้ม, รูพรุนนุ่ม ๆ
// ทำจาก noise ล้วน (ไม่วาดเส้น) ทั้งสีและความสูง → ไม่มีเส้นขอบดำแบบการ์ตูน
const CORKWALL = (() => {
  const wA = tileFbm(3, 3), wB = tileFbm(3, 3), furrow = tileFbm(3, 4), lump = tileFbm(5, 4), det = tileFbm(24, 3), col = tileFbm(4, 3), lich = tileFbm(6, 3), pore = tileWorley(56, 56, 1);
  const deep = [40, 25, 17], mid = [82, 60, 43], top = [120, 98, 78], grey = [116, 108, 98], lichen = [104, 112, 94];
  return pixTex(1024, 1024, (u, v) => {
    const qu = u + wA(u, v) * .07, qv = v + wB(u, v) * .1, d = det(u, v), l = lump(u, v);
    const fr = sstep(0, .4, Math.abs(furrow(qu * 3, qv) + d * .04));                    // ร่องเปลือก: 0 ก้นร่อง (กว้าง มน) → 1 บนแผ่น, ยืดตามแนวตั้ง
    const hgt = clamp(fr * .62 + l * .35 + .22 + d * .14, 0, 1);                        // ความสูงรวม: ร่อง + ปุ่มนูน + ผิวหยาบ
    const [p1, , pid] = pore(u + d * .006, v);
    const pr = (pid * 13 % 10) < 4 ? (1 - sstep(.04, .2, p1)) * fr : 0;              // รูพรุน/ช่องอากาศ บางช่องเท่านั้น ขอบนุ่ม
    let c = mix3(deep, mid, sstep(.05, .55, hgt));
    c = mix3(c, top, sstep(.5, .95, hgt));                                               // สันนูนสว่าง
    c = mix3(c, grey, clamp(col(u, v) * 1.5 + .15, 0, .45) * sstep(.45, .85, hgt));      // สันที่แห้งตากลมออกเทา
    const L = clamp((lich(u, v) - .15) * 4, 0, 1) * sstep(.6, .9, hgt); c = mix3(c, lichen, L * .45);
    c = c.map(x => x * (.9 + d * .22) * (1 - pr * .3));                                // ผิวหยาบละเอียด + รูพรุน
    return [c[0], c[1], c[2], hgt - pr * .12];
  }, 3.5);
})();
{
  // สลับผิวหิน (เฉพาะก้อนหินที่เดินได้; จานน้ำและกรวดยังใช้ของเดิม)
  const prev = rockMat.onBeforeCompile;
  rockMat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.uniforms.tTriA.value = STONE.map; sh.uniforms.tTriN.value = STONE.normalMap; };
  rockMat.needsUpdate = true;
  // สลับผิวกำแพงหลัง: ขนาดลายเท่ากันทั้งแนวนอนและแนวตั้ง (1 ลาย ≈ 22 หน่วย) และหรี่ลงให้ฉากหลังถอยไป
  scene.children.forEach(o => { if (o.isMesh && o.material.map === CORK.map) {
    CORKWALL.map.repeat.set(TW / 22, (TH + 2) / 22); CORKWALL.normalMap.repeat.copy(CORKWALL.map.repeat);
    Object.assign(o.material, { map: CORKWALL.map, normalMap: CORKWALL.normalMap, roughness: .95 }); o.material.color.setScalar(.72); o.material.normalScale.set(1.2, 1.2); o.material.needsUpdate = true; } });
}
