'use strict';
/* =====================================================================
   Prey models (loaded after spider.js, before game.js). game.js's class Prey keeps behaviour, gait and physics;
   a kind listed in PREY_KINDS builds its own look here: PREY_KINDS[kind](p, g) fills the group g and sets
   p.legs ([{ j: [hipJoint, kneeJoint], s: ±1, i: 0..2 }], posed by Prey.poseLegs), p.ant ([{ pv, s }]) and
   optionally p.limbs (a LimbBatch, re-posed after every pose).
   ===================================================================== */
// one mesh for all of a critter's jointed parts: each segment hangs on an invisible joint (Group) that the gait code
// rotates as before; every frame the segments are re-posed on the CPU into a single geometry (1 draw call, not ~20)
class LimbBatch {
  constructor(root, mat) {
    this.root = root; this.parts = []; this.mat = mat; this.mesh = null; this._m = new THREE.Matrix4(); this._n = new THREE.Matrix3(); this._v = new V3();
  }
  // geo: non-indexed or indexed BufferGeometry in the joint's local space (position + normal [+ color])
  add(joint, geo) { this.parts.push({ joint, geo }); return this; }
  build() {
    let nv = 0, ni = 0; const col = this.parts.some(p => p.geo.attributes.color);
    this.parts.forEach(p => { p.v0 = nv; nv += p.geo.attributes.position.count; ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; });
    const G = new THREE.BufferGeometry(), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    G.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    G.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    if (col) { const c = new Float32Array(nv * 3).fill(1); this.parts.forEach(p => { const a = p.geo.attributes.color; if (a) for (let i = 0; i < a.count; i++) c.set([a.getX(i), a.getY(i), a.getZ(i)], (p.v0 + i) * 3); });
      G.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    let o = 0; this.parts.forEach(p => { const n = p.geo.attributes.position.count; if (p.geo.index) p.geo.index.array.forEach(i => idx[o++] = i + p.v0); else for (let i = 0; i < n; i++) idx[o++] = i + p.v0; });
    G.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(G, this.mat); this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.root.add(this.mesh);
    this.update(); return this.mesh;
  }
  update() {
    if (!this.mesh) return;
    this.root.updateMatrixWorld(true);
    const inv = this._m.copy(this.root.matrixWorld).invert(), P = this.mesh.geometry.attributes.position, N = this.mesh.geometry.attributes.normal, M = new THREE.Matrix4(), v = this._v;
    for (const p of this.parts) {
      M.multiplyMatrices(inv, p.joint.matrixWorld); this._n.getNormalMatrix(M);
      const gp = p.geo.attributes.position, gn = p.geo.attributes.normal;
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(M); P.setXYZ(p.v0 + i, v.x, v.y, v.z);
        v.fromBufferAttribute(gn, i).applyMatrix3(this._n).normalize(); N.setXYZ(p.v0 + i, v.x, v.y, v.z);
      }
    }
    P.needsUpdate = N.needsUpdate = true; this.mesh.geometry.computeBoundingSphere();
  }
}
// a jointed chain without meshes (the LimbBatch draws it): same frame convention as game.js limb(); segment geometry
// comes from seg(len, k) (k = segment index), built along +y from the joint and rotated toward the segment direction
function limbJoints(parent, from, dirs, batch, seg) {
  let par = parent, p = from.clone(); const joints = [];
  dirs.forEach(([dx, dy, dz, len], k) => { const d = new V3(dx, dy, dz).normalize(), j = new THREE.Group(); j.position.copy(p); par.add(j);
    const geo = seg(len, k).clone(); geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d)); batch.add(j, geo);
    joints.push(j); par = j; p = d.multiplyScalar(len); });
  return joints;
}
const PREY_KINDS = {};

/* ---------- prey: behaviour, gait, physics (moved here from game.js; uses game.js globals at run time) ---------- */
function limb(parent, from, dirs, r, mat) { // jointed chain: each segment hangs from the previous joint, so turning a joint carries the rest of the leg
  let par = parent, p = from.clone(); const joints = [];
  dirs.forEach(([dx, dy, dz, len]) => { const d = new V3(dx, dy, dz).normalize(), g = new THREE.CylinderGeometry(r * .7, r, len, 6); g.translate(0, len / 2, 0);
    const j = new THREE.Group(); j.position.copy(p); par.add(j);
    const m = new THREE.Mesh(g, mat); m.quaternion.setFromUnitVectors(UP, d); m.castShadow = true; j.add(m);
    joints.push(j); par = j; p = d.multiplyScalar(len); });
  return joints;
}
function antenna(parent, from, dir, len, mat) { // pivots in its socket so it can sweep
  const pv = new THREE.Group(); pv.position.copy(from); parent.add(pv);
  const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(dir.clone().multiplyScalar(len * t).add(new V3(0, Math.sin(t * 2) * len * .15, 0))); }
  pv.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, .012, 4), mat));
  return pv;
}
class Prey {
  constructor(kind) {
    this.kind = kind; this.burrowed = 0; this.rising = false; this.vibT = 0; this.eaten = false; this.held = false; this.heldT = 0; this.walk = 0; this.gaitK = 0;
    let x, z, k = 0; do { x = rand(-TW / 2 + 3, TW / 2 - 3); z = rand(-TD / 2 + 3, TD / 2 - 3); } while ((!clearSpot(x, z) || (spider && Math.hypot(x - spider.pos.x, z - spider.pos.z) < spider.span * 1.6)) && k++ < 60);
    this.pos = new V3(x, 0, z); this.yaw = rand(0, 6.3); this.face = this.yaw; this.v = 0; this.t = rand(0, 2); this.hop = 0; this.vy = 0; this.y = 0;
    this.crouch = 0; this.kick = 0; this.chirp = 0; this.pitch = 0; this.hindA = .1; this.tibA = 0; this.ph = rand(0, 6.3);
    const g = this.mesh = new THREE.Group(); g.rotation.order = 'YXZ'; this.legs = []; this.ant = []; this.hind = [];
    if (PREY_KINDS[kind]) PREY_KINDS[kind](this, g);
    else if (kind === 'cricket') {
      const body = track(new THREE.MeshPhysicalMaterial({ color: lin(0x5e401f), roughness: .38, clearcoat: .7 }), .7), dark = track(new THREE.MeshPhysicalMaterial({ color: lin(0x22160b), roughness: .3, clearcoat: .8 }), .7);
      const e = (sx, sy, sz, x, y, z, m) => { const q = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m); q.scale.set(sx, sy, sz); q.position.set(x, y, z); q.castShadow = true; g.add(q); return q; };
      e(.27, .26, .27, 0, .34, .95, body); e(.07, .07, .07, .18, .42, 1.04, dark); e(.07, .07, .07, -.18, .42, 1.04, dark);
      e(.32, .25, .3, 0, .36, .62, dark); e(.34, .28, .78, 0, .3, -.1, body); this.wing = e(.37, .07, .64, 0, .52, -.05, dark);
      [-1, 1].forEach(s => { this.ant.push({ pv: antenna(g, new V3(s * .1, .45, 1.15), new V3(s * .35, .25, 1).normalize(), 2.6, dark), s });
        limb(g, new V3(s * .08, .3, -.85), [[s * .2, .2, -1, .6]], .025, dark);
        this.legs.push({ j: limb(g, new V3(s * .22, .3, .7), [[s, -.3, .5, .35], [s * .3, -1, .3, .4]], .035, body), s, i: 0 });
        this.legs.push({ j: limb(g, new V3(s * .25, .28, .35), [[s, -.2, -.1, .38], [s * .3, -1, -.3, .45]], .035, body), s, i: 1 });
        const hind = new THREE.Group(); hind.position.set(s * .27, .32, 0); g.add(hind);
        const fem = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), body); fem.scale.set(.1, .12, .48); fem.position.set(s * .1, .12, -.35); fem.rotation.x = -.35; hind.add(fem); fem.castShadow = true;
        this.hind.push({ g: hind, tib: limb(hind, new V3(s * .12, .28, -.78), [[s * .15, -1, .35, .85]], .03, dark)[0], s }); });
      this.value = 22; this.speed = 5; this.vib = 1.3;
    } else {
      const shell = track(new THREE.MeshPhysicalMaterial({ color: lin(0x3a2515), roughness: .3, clearcoat: 1, clearcoatRoughness: .2 }), .8), under = track(new THREE.MeshStandardMaterial({ color: lin(0x5a3a1f), roughness: .6 }), .5);
      for (let k = 0; k < 8; k++) { const t = k / 7, w = .85 * Math.sin(Math.PI * (t * .82 + .12)) + .12;
        const q = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell); q.scale.set(w, .24 - Math.abs(t - .45) * .1, .19);
        q.position.set(0, .1, .95 - t * 1.9); q.castShadow = true; g.add(q); }
      const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), under); belly.scale.set(.8, .08, 1.05); belly.position.y = .1; g.add(belly);
      [-1, 1].forEach(s => { this.ant.push({ pv: antenna(g, new V3(s * .1, .12, 1.05), new V3(s * .5, .1, 1).normalize(), 1, under), s });
        [.5, 0, -.5].forEach((z, i) => this.legs.push({ j: limb(g, new V3(s * .5, .08, z), [[s, -.2, z * .5, .4], [s * .4, -1, z * .3, .3]], .03, under), s, i })); });
      g.scale.setScalar(1.3);                       // adult-sized roach (≈ 3 cm), a proper meal for a tarantula
      this.value = 35; this.speed = 3.2; this.vib = .9;
    }
    // a kaiju-sized spider gets proportionally bigger prey (same look, scaled): bigger, faster, more filling
    this.k = kind === 'human' ? 1 : spider ? clamp(spider.span / 12, 1, 3.5) : 1; g.scale.multiplyScalar(this.k);   // a person stays person-sized (town scale) this.speed *= this.k; this.value *= this.k;
    this.mats = [];
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; if (!this.mats.includes(o.material)) this.mats.push(o.material); } });
    this.mats.forEach(m => { if (m.userData.env != null) m.envMapIntensity = m.userData.env * Math.max(envLevel, 0); });
    this.opacity = 1;
    scene.add(g);
  }
  // crickets squat on their hind legs for a moment, then kick off
  jump(v, vy) { if (this.crouch > 0 || this.y > .05) return; this.crouch = .14; this.jv = v; this.jvy = vy; this.chirp = 0; }
  // alternating tripods (front + hind of one side with the middle leg of the other) swing forward while the other tripod pushes
  poseLegs(amp, lift, air) {
    for (const L of this.legs) {
      const ph = this.walk + ((L.i + (L.s > 0 ? 1 : 0)) % 2) * Math.PI, sw = -Math.cos(ph) * .38 * amp, up = Math.max(0, Math.sin(ph)) * .45 * lift;
      L.j[0].rotation.set(0, -L.s * (sw + (air ? .3 : 0)), L.s * (up + (air ? .3 : 0)));
      L.j[1].rotation.z = L.s * (up * .5 + (air ? .25 : 0));
    }
  }
  poseAntennae(now, speed, droop) { this.ant.forEach(({ pv, s }) => pv.rotation.set(Math.sin(now * speed * .7 + this.ph + s) * .15 + droop,
    s * (.1 + Math.sin(now * speed + this.ph * 1.7 + s * 1.3) * .28), 0)); }
  update(dt, sp) {
    if (this.eaten) return;
    const now = performance.now() / 1000;
    if (this.held) { // bitten: legs kick and antennae flick, fading as the venom works (the spider's 'eat' state poses the body)
      this.heldT += dt; const k = Math.exp(-this.heldT * .7); this.walk += dt * 24 * k;
      this.poseLegs(k, k * .8, false); this.poseAntennae(now, 1 + 5 * k, .4 * (1 - k)); if (this.rig) this.rig(this, dt, 0); if (this.limbs) this.limbs.update(); return; }
    const tm = TM; this.t -= dt;
    const d = Math.hypot(sp.pos.x - this.pos.x, sp.pos.z - this.pos.z);
    const threatNear = d < sp.span * 1.1 && sp.flip < .5 && sp.hidden < .5;
    if (this.kind === 'human') this.human(dt, sp, d);
    else if (this.kind === 'dubia') {
      if (this.burrowed > 0) { // dubia roaches dig into the substrate to escape predators, and dig back out later
        if (this.rising) { this.burrowed -= dt * .7; if (this.burrowed <= 0) { this.burrowed = 0; this.rising = false; } }
        else { this.burrowed = Math.min(1, this.burrowed + dt * .8); if (this.t < 0 && !threatNear) { this.rising = true; this.t = rand(1, 3); log('แมลงสาบดูเบียโผล่ขึ้นจากดิน'); } }
        this.v = 0;
      } else if (threatNear && sp.mode === 'hunt' && !(this.flushT > 0)) {
        this.yaw = Math.atan2(this.pos.x - sp.pos.x, this.pos.z - sp.pos.z) + rand(-.4, .4); this.v = this.speed * 1.6;
        if (Math.random() < dt * .35) { this.burrowed = .01; this.t = rand(8, 16); log('ดูเบียมุดลงดินหนีผู้ล่า แมงมุมจึงจับแรงสั่นไม่ได้', true); }
      } else if (this.t < 0) { this.t = rand(1, 4); this.v = Math.random() < .55 ? this.speed * rand(.4, 1) : 0; this.yaw += rand(-1.5, 1.5); }
    } else {
      if (this.hop > 0) this.hop -= dt;
      if (this.crouch > 0) { this.crouch -= dt * tm; if (this.crouch <= 0) { this.crouch = 0; this.v = this.jv; this.vy = this.jvy; this.hop = .5; this.kick = .14; } }
      else if (this.t < 0) { this.t = rand(.6, 2.5); if (Math.random() < .5) { this.yaw += rand(-1.5, 1.5); this.jump(this.speed * rand(1.2, 2), rand(5, 9)); } else { this.v = Math.random() < .5 ? this.speed * .4 : 0; this.yaw += rand(-1, 1); } }
      if (threatNear && sp.mode === 'hunt' && !(this.flushT > 0) && this.hop <= 0 && Math.random() < dt * .5) { this.yaw = this.face = Math.atan2(this.pos.x - sp.pos.x, this.pos.z - sp.pos.z); this.jump(this.speed * 2.2, 8); }
      // males chirp at night: forewings raised and rubbed together
      if (this.chirp > 0) this.chirp -= dt; else if (isNight() && this.v < .3 && this.y <= 0 && !threatNear && Math.random() < dt * .06) this.chirp = rand(1.2, 3);
    }
    // the body turns toward where it wants to go (fast while squatting to jump) instead of snapping round
    if (this.flushT > 0) this.flushT -= dt;
    const air = this.y > .05, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    if (!air) { const tr = (this.crouch > 0 ? 14 : this.kind === 'cricket' ? 5 : this.kind === 'human' ? 7 : 4) * dt * tm; this.face += clamp(wrap(this.yaw - this.face), -tr, tr); }
    const v = air ? this.v : this.crouch > 0 ? 0 : this.v * clamp(Math.cos(wrap(this.yaw - this.face)) * .85 + .15, .1, 1);
    this.pos.x += Math.sin(this.face) * v * dt * tm; this.pos.z += Math.cos(this.face) * v * dt * tm;
    if (!inTank(this.pos.x, this.pos.z, 2)) { this.yaw += Math.PI; this.pos.x = clamp(this.pos.x, -TW / 2 + 2, TW / 2 - 2); this.pos.z = clamp(this.pos.z, -TD / 2 + 2, TD / 2 - 2); }
    for (const o of preyObs) { const dx = this.pos.x - o.x, dz = this.pos.z - o.z, dd = Math.hypot(dx, dz) || 1, rr = o.r * 1.1 + .4;
      if (dd < rr && this.y < o.h) { this.pos.x = o.x + dx / dd * rr; this.pos.z = o.z + dz / dd * rr; this.yaw = Math.atan2(dx, dz) + rand(-1, 1); } }
    for (const k of SOLIDS) { const n = solidNear(k, this.pos.x, this.pos.z), rr = .5 * this.k;      // building walls
      if (n.d < rr && this.y < k.h) { this.pos.x += n.nx * (rr - n.d); this.pos.z += n.nz * (rr - n.d); this.yaw = Math.atan2(n.nx, n.nz) + rand(-1, 1); } }
    if (pushOutOfLog(this.pos, .6)) this.yaw += Math.PI * rand(.6, 1.4);
    const vy0 = this.vy;
    this.y += this.vy * dt; this.vy -= 30 * dt; if (this.y <= 0) { this.y = 0; this.vy = 0; if (this.kind === 'cricket' && this.v > this.speed) this.v *= .5; }
    // body follows the slope, noses up on take-off / down on the fall, squats before a jump, tips in or out while digging
    const gy = groundY(this.pos.x, this.pos.z), fx = Math.sin(this.face), fz = Math.cos(this.face);
    let pitch = -Math.atan((groundY(this.pos.x + fx * .9, this.pos.z + fz * .9) - groundY(this.pos.x - fx * .9, this.pos.z - fz * .9)) / 1.8);
    if (air) pitch += clamp(-vy0 * .045, -.45, .45);
    if (this.crouch > 0) pitch -= .2;
    const digging = this.burrowed > 0 && (this.rising || this.burrowed < 1);
    if (this.burrowed > 0) pitch += this.rising ? -.3 : .35;
    this.pitch = lerp(this.pitch, pitch, clamp(dt * 10, 0, 1));
    const gait = v > .1 && !air;
    this.gaitK = lerp(this.gaitK, gait || digging ? 1 : 0, clamp(dt * 8, 0, 1));
    if (gait || digging) this.walk += dt * tm * (digging ? 26 : 3 + v * 4.5);
    const bob = Math.abs(Math.sin(this.walk)) * .03 * this.gaitK, roll = Math.sin(this.walk) * .05 * this.gaitK;
    this.mesh.position.set(this.pos.x, gy + this.y - this.burrowed * 1.2 * this.k + bob - (this.crouch > 0 ? .08 : 0), this.pos.z);
    this.mesh.rotation.set(this.pitch, this.face, roll);
    this.poseLegs(this.gaitK, this.gaitK, air);
    this.poseAntennae(now, threatNear || digging ? 5 : this.v > .1 ? 2.4 : 1.3, air ? -.15 : 0);
    if (this.hind.length) { // big jumping legs: fold for the squat, kick straight at take-off, trail in the air
      this.kick -= dt;
      const [ha, ta] = this.crouch > 0 ? [.45, -.45] : this.kick > 0 ? [-.5, 1] : air ? [-.3, .6] : [.1, 0];
      const k = clamp(dt * (this.kick > 0 ? 40 : 12), 0, 1); this.hindA = lerp(this.hindA, ha, k); this.tibA = lerp(this.tibA, ta, k);
      this.hind.forEach(h => { h.g.rotation.x = this.hindA + Math.sin(this.walk + (h.s > 0 ? 0 : Math.PI)) * .12 * this.gaitK; h.tib.rotation.x = this.tibA; });
    }
    if (this.wing) { const c = this.chirp > 0 ? 1 : 0; this.wing.rotation.x = c * (-.2 + Math.sin(now * 75) * .05); this.wing.position.y = .52 + c * .05; }
    if (this.rig) this.rig(this, dt, v);
    if (this.limbs) this.limbs.update();
    this.setOpacity(1 - this.burrowed * .95);
    this.moving = this.burrowed <= 0 && (v > .3 || this.y > .05);
    this.vibT -= dt;
    if (this.moving && this.vibT <= 0 && vibOn) { spawnRipple(this.pos, this.vib); this.vibT = .45; }
  }
  // ชัยภัทร (a person, town scale ≈ 1.7): strolls about; feels the ground shake / sees the spider close by → sprints away,
  // often to hide behind the nearest building (the building between him and the spider); tires after a few seconds
  human(dt, sp, d) {
    const L = sp.span, near = d < L * 2.4 || (sp.mode === 'hunt' && sp.prey === this && d < L * 3.5);
    this.stam = clamp((this.stam == null ? 6 : this.stam) + (this.panic > .5 && this.v > this.run * .6 ? -dt : dt * .7), 0, 6);
    if (near && sp.flip < .5) {
      if (!(this.panic > .5)) humanSay(this, 'panic');
      this.panic = 1; this.calmT = 4;
      if ((this.fleeT = (this.fleeT || 0) - dt) <= 0) { this.fleeT = .7;
        const ax = this.pos.x - sp.pos.x, az = this.pos.z - sp.pos.z, al = Math.hypot(ax, az) || 1; let tx = this.pos.x + ax / al * 14, tz = this.pos.z + az / al * 14, best = 1e9;
        for (const k of SOLIDS) { const bx = k.x - this.pos.x, bz = k.z - this.pos.z, bd = Math.hypot(bx, bz);   // a building roughly away from the spider, not too far
          if (bd > 22 || (bx * ax + bz * az) / (bd * al || 1) < .2) continue;
          const sx = k.x - sp.pos.x, sz = k.z - sp.pos.z, sl = Math.hypot(sx, sz) || 1, r = Math.max(k.hw, k.hd) + 1.6, hx = k.x + sx / sl * r, hz = k.z + sz / sl * r;
          if (bd < best && inTank(hx, hz, 2)) { best = bd; tx = hx; tz = hz; } }
        this.yaw = Math.atan2(tx - this.pos.x, tz - this.pos.z) + rand(-.15, .15); }
      this.v = this.stam > .5 ? this.run : this.run * .45;             // sprints faster than any insect, then tires
      if (Math.random() < dt * .25) humanSay(this, 'panic');
    } else {
      this.calmT = (this.calmT || 0) - dt; if (this.calmT < 0) this.panic = Math.max(0, (this.panic || 0) - dt * .3);
      if (this.panic > .3) this.v = this.speed * .9;                      // still hurrying, looking back
      else if (this.t < 0) { this.t = rand(2, 5); this.v = Math.random() < .7 ? this.speed * rand(.8, 1.1) : 0; this.yaw += rand(-1.2, 1.2); if (Math.random() < .15) humanSay(this, 'calm'); }
    }
  }
  setOpacity(op) { // materials only go transparent while the roach is digging in, so normal rendering keeps depth sorting
    if (Math.abs(op - this.opacity) < .005) return; this.opacity = op;
    this.mats.forEach(m => { const tr = op < .999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; m.depthWrite = !tr; });
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = op > .5; });
  }
  remove() { this.eaten = true; this.held = false; scene.remove(this.mesh); this.mesh.traverse(o => o.geometry && o.geometry.dispose()); this.mats.forEach(m => { envMats.delete(m); m.dispose(); }); }
}

