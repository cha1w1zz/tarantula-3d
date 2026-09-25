'use strict';
/* =====================================================================
   ชัยภัทร: a person-sized prey (town scale: a storey ≈ 3, a person ≈ 1.7) + his speech bubble, and the blood / silk FX.
   Loaded after prey.js, before game.js. API used by prey.js / game.js:
     PREY_KINDS.human(p, g)   build the model into g; sets p.rig(p, dt, v) (poses limbs each frame), p.limbs, speed/value/vib
     humanSay(p, cat)         line over his head ('panic' | 'calm' | 'caught')
     preyTalk(dt)             moves the bubbles (called from game.js loop)
     BLOOD.splash(pos, n) / BLOOD.drip(pos) / BLOOD.stain(pos, size) / BLOOD.cocoon(p) → mesh / BLOOD.update(dt)
   (placeholder look — the art pass replaces the model and FX, keeping this API)
   ===================================================================== */
PREY_KINDS.human = (p, g) => {
  const skin = track(new THREE.MeshStandardMaterial({ color: lin(0xc98f6a), roughness: .7 }), .4);
  const shirt = track(new THREE.MeshStandardMaterial({ color: lin(0xe8452c), roughness: .8 }), .4), pants = track(new THREE.MeshStandardMaterial({ color: lin(0x2d4a7a), roughness: .85 }), .4);
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  part(new THREE.CylinderGeometry(.2, .18, .6, 8), shirt, 0, 1.2, 0);
  part(new THREE.SphereGeometry(.14, 12, 8), skin, 0, 1.6, 0);
  const limbJ = (x, y, len, mat) => { const j = new THREE.Group(); j.position.set(x, y, 0); g.add(j); const m = new THREE.Mesh(new THREE.CylinderGeometry(.06, .05, len, 6), mat); m.position.y = -len / 2; m.castShadow = true; j.add(m); return j; };
  p.hum = { legL: limbJ(-.1, .9, .88, pants), legR: limbJ(.1, .9, .88, pants), armL: limbJ(-.27, 1.42, .62, shirt), armR: limbJ(.27, 1.42, .62, shirt), ph: 0 };
  p.rig = (p, dt, v) => { const H = p.hum, run = clamp(v / (p.speed * 2.4), 0, 1), held = p.held ? 1 : 0;
    H.ph += dt * (held ? 14 : 2 + v * 2.2); const s = Math.sin(H.ph) * (held ? .9 : .35 + .6 * run);
    H.legL.rotation.x = s; H.legR.rotation.x = -s; H.armL.rotation.x = -s * 1.2; H.armR.rotation.x = s * 1.2;
    H.armL.rotation.z = -.1 - held * .8; H.armR.rotation.z = .1 + held * .8; };
  p.speed = 1.4; p.run = 7.5; p.value = 55; p.vib = 1.5;   // walk ≈ 1.4, sprint ≈ 7.5 (faster than crickets)
};
// speech bubbles over his head (the same style as the spider's)
const humanSay = (() => {
  const LINES = { panic: ['ช่วยด้วย!', 'แมงมุมยักษ์!!', 'อย่ากินผมนะ!', 'หนีเร็ว!', 'แม่จ๋าาา!', 'ใครก็ได้ช่วยที!'], calm: ['เงียบจัง…', 'เมืองนี้ร้างจริง ๆ', 'ได้ยินเสียงอะไรไหม?'], caught: ['อ๊ากกก!!', 'ปล่อยผมนะ!'] };
  return (p, cat) => { const L = LINES[cat]; if (!L || (p.sayCD > 0 && cat !== 'caught')) return; p.sayCD = 2.5;
    const t = L[Math.random() * L.length | 0]; p.sayTxt = `ชัยภัทร: ${t}`; p.sayT = 2.6; if (cat !== 'calm') log(`<i>ชัยภัทร:</i> “${t}”`, 'say'); };
})();
function preyTalk(dt) {
  prey.forEach(p => { if (p.kind !== 'human') return; p.sayCD = (p.sayCD || 0) - dt; p.sayT = (p.sayT || 0) - dt;
    let el = p.bubble; if (!el) { el = p.bubble = document.createElement('div'); el.className = 'say'; el.style.background = 'rgba(214,236,255,.95)'; document.body.appendChild(el); }
    if (p.eaten) { el.remove(); return; }
    const q = p.mesh.position.clone(); q.y += 2.1; q.project(camera);
    const on = p.sayT > .2 && q.z < 1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1 && !document.body.classList.contains('noui');
    el.classList.toggle('on', on); if (on) { el.textContent = p.sayTxt; el.style.left = clamp((q.x * .5 + .5) * innerWidth, 110, innerWidth - 110) + 'px'; el.style.top = Math.max(50, (-q.y * .5 + .5) * innerHeight) + 'px'; }
  });
}
// blood: splash droplets (one Points), drips from the fangs, stains on the ground that fade in ~45 s; silk cocoon
const BLOOD = (() => {
  const N = 160, P = new Float32Array(N * 3), V = [], geo = new THREE.BufferGeometry(); let head = 0;
  for (let i = 0; i < N; i++) { P[i * 3 + 1] = -1e4; V.push({ v: new V3(), t: 0 }); }
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(0x5a0405), size: .14 })); pts.frustumCulled = false; scene.add(pts);
  const shoot = (pos, dir, sp) => { const i = head++ % N; P.set([pos.x, pos.y, pos.z], i * 3); V[i].v.copy(dir).multiplyScalar(sp); V[i].t = 3; };
  const SN = 24, stains = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a0203, roughness: .3, transparent: true, opacity: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SN);
  const S = []; for (let i = 0; i < SN; i++) S.push({ t: 0, s: 0, x: 0, y: -1e4, z: 0 }); let sHead = 0; stains.frustumCulled = false; scene.add(stains);
  const m4 = new THREE.Matrix4();
  const api = {
    splash(pos, n) { for (let i = 0; i < (n || 40); i++) shoot(pos, new V3(rand(-1, 1), rand(.3, 1.4), rand(-1, 1)).normalize(), rand(2, 6)); },
    drip(pos) { shoot(pos, new V3(rand(-.1, .1), -1, rand(-.1, .1)), rand(.2, .8)); },
    stain(pos, size) { const s = S[sHead++ % SN]; s.x = pos.x; s.z = pos.z; s.y = groundY(pos.x, pos.z) + .03; s.s = size; s.t = 45; },
    cocoon(p) { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(.45, 1.05, .45); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xece6da, roughness: .9 })); m.castShadow = true; m.position.y = .9; p.mesh.add(m); return m; },
    update(dt) {
      for (let i = 0; i < N; i++) { const q = V[i]; if (q.t <= 0) continue; q.t -= dt; q.v.y -= 20 * dt; P[i * 3] += q.v.x * dt; P[i * 3 + 1] += q.v.y * dt; P[i * 3 + 2] += q.v.z * dt;
        const gy = groundY(P[i * 3], P[i * 3 + 2]); if (P[i * 3 + 1] < gy) { if (Math.random() < .15) api.stain({ x: P[i * 3], z: P[i * 3 + 2] }, rand(.1, .25)); q.t = 0; } if (q.t <= 0) P[i * 3 + 1] = -1e4; }
      geo.attributes.position.needsUpdate = true;
      S.forEach((s, i) => { s.t -= dt; const k = s.t > 0 ? s.s * Math.min(1, s.t / 8) : 0; m4.makeScale(k || 1e-4, 1, k || 1e-4).setPosition(s.x, s.t > 0 ? s.y : -1e4, s.z); stains.setMatrixAt(i, m4); });
      stains.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
})();
