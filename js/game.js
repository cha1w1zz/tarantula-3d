'use strict';
/* =====================================================================
   Game: care loop, behaviour, prey, post-processing, HUD
   ===================================================================== */
let S = null, spider = null, vibOn = true, follow = false, fast = false, TM = 1, quality = 'high';
let envLevel = -1;   // env-map level last applied (spider.js reads it for materials created later)
const SAVE_KEY = 'tarantula3d-v2';
const exuviae = [];
function newState(name, sp) { return { name, sp, span: 9, hunger: 40, growth: 0, molts: 0, temp: 25, hum: 70, hour: 17, lamp: true, led: true, phase: 'normal', phaseT: 0 }; }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
function log(msg, cls) { // stamped with the real clock of the keeper's device
  const p = document.createElement('p'); if (cls) p.className = cls === true ? 'sci' : cls;
  const d = new Date(), t = [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
  p.innerHTML = `<b class="num">${t}</b> ${msg}`;
  const L = $('log'); L.insertBefore(p, L.children[1] || null);
  while (L.children.length > 30) L.removeChild(L.lastChild);
}
/* the spider "talks": a speech bubble over it plus a line in the log. Events (pri) may interrupt after 3 s; mood talk waits its turn */
let sayCD = 6, sayGap = 0, sayBubbleT = 0, chatT = 12; const sayLast = {};
function say(cat, pri) {
  const L = VOICE[cat]; if (!L || previewing || (!pri && (sayGap > 0 || sayCD > 0))) return false;
  let i = Math.floor(Math.random() * L.length); if (L.length > 1 && i === sayLast[cat]) i = (i + 1) % L.length; sayLast[cat] = i;
  $('say').textContent = L[i]; sayBubbleT = 4.5; sayCD = rand(10, 16); sayGap = 3;
  log(`<i>${S.name}:</i> “${L[i]}”`, 'say');
  return true;
}
function moodTalk() { // what's on its mind right now, most pressing first
  const night = isNight();
  if (S.phase === 'molting') return say('molt');
  if (S.phase === 'premolt') return say('premolt');
  if (S.phase === 'soft') return say('soft');
  if (Math.random() < .3) return say('chatter');
  if (S.hunger > 70) return say('hungry');
  if (S.hum < 58) return say('dry');
  if (S.temp < 21) return say('cold');
  if (S.led && !night && Math.random() < .5) return say('bright');
  if (S.hunger < 25 && Math.random() < .5) return say('full');
  return say('chatter');
}

/* ---------- prey ---------- */
const prey = [];
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
    let x, z, k = 0; do { x = rand(-12, 22); z = rand(-6, 14); } while ((!clearSpot(x, z) || (spider && Math.hypot(x - spider.pos.x, z - spider.pos.z) < spider.span * 1.6)) && k++ < 60);
    this.pos = new V3(x, 0, z); this.yaw = rand(0, 6.3); this.face = this.yaw; this.v = 0; this.t = rand(0, 2); this.hop = 0; this.vy = 0; this.y = 0;
    this.crouch = 0; this.kick = 0; this.chirp = 0; this.pitch = 0; this.hindA = .1; this.tibA = 0; this.ph = rand(0, 6.3);
    const g = this.mesh = new THREE.Group(); g.rotation.order = 'YXZ'; this.legs = []; this.ant = []; this.hind = [];
    if (kind === 'cricket') {
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
      this.poseLegs(k, k * .8, false); this.poseAntennae(now, 1 + 5 * k, .4 * (1 - k)); return; }
    const tm = TM; this.t -= dt;
    const d = Math.hypot(sp.pos.x - this.pos.x, sp.pos.z - this.pos.z);
    const threatNear = d < sp.span * 1.1 && sp.flip < .5 && sp.hidden < .5;
    if (this.kind === 'dubia') {
      if (this.burrowed > 0) { // dubia roaches dig into the substrate to escape predators, and dig back out later
        if (this.rising) { this.burrowed -= dt * .7; if (this.burrowed <= 0) { this.burrowed = 0; this.rising = false; } }
        else { this.burrowed = Math.min(1, this.burrowed + dt * .8); if (this.t < 0 && !threatNear) { this.rising = true; this.t = rand(1, 3); log('แมลงสาบดูเบียโผล่ขึ้นจากดิน'); } }
        this.v = 0;
      } else if (threatNear && sp.mode === 'hunt') {
        this.yaw = Math.atan2(this.pos.x - sp.pos.x, this.pos.z - sp.pos.z) + rand(-.4, .4); this.v = this.speed * 1.6;
        if (Math.random() < dt * .35) { this.burrowed = .01; this.t = rand(8, 16); log('ดูเบียมุดลงดินหนีผู้ล่า แมงมุมจึงจับแรงสั่นไม่ได้', true); }
      } else if (this.t < 0) { this.t = rand(1, 4); this.v = Math.random() < .55 ? this.speed * rand(.4, 1) : 0; this.yaw += rand(-1.5, 1.5); }
    } else {
      if (this.hop > 0) this.hop -= dt;
      if (this.crouch > 0) { this.crouch -= dt * tm; if (this.crouch <= 0) { this.crouch = 0; this.v = this.jv; this.vy = this.jvy; this.hop = .5; this.kick = .14; } }
      else if (this.t < 0) { this.t = rand(.6, 2.5); if (Math.random() < .5) { this.yaw += rand(-1.5, 1.5); this.jump(this.speed * rand(1.2, 2), rand(5, 9)); } else { this.v = Math.random() < .5 ? this.speed * .4 : 0; this.yaw += rand(-1, 1); } }
      if (threatNear && sp.mode === 'hunt' && this.hop <= 0 && Math.random() < dt * .5) { this.yaw = this.face = Math.atan2(this.pos.x - sp.pos.x, this.pos.z - sp.pos.z); this.jump(this.speed * 2.2, 8); }
      // males chirp at night: forewings raised and rubbed together
      if (this.chirp > 0) this.chirp -= dt; else if (isNight() && this.v < .3 && this.y <= 0 && !threatNear && Math.random() < dt * .06) this.chirp = rand(1.2, 3);
    }
    // the body turns toward where it wants to go (fast while squatting to jump) instead of snapping round
    const air = this.y > .05, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    if (!air) { const tr = (this.crouch > 0 ? 14 : this.kind === 'cricket' ? 5 : 4) * dt * tm; this.face += clamp(wrap(this.yaw - this.face), -tr, tr); }
    const v = air ? this.v : this.crouch > 0 ? 0 : this.v * clamp(Math.cos(wrap(this.yaw - this.face)) * .85 + .15, .1, 1);
    this.pos.x += Math.sin(this.face) * v * dt * tm; this.pos.z += Math.cos(this.face) * v * dt * tm;
    if (!inTank(this.pos.x, this.pos.z, 2)) { this.yaw += Math.PI; this.pos.x = clamp(this.pos.x, -TW / 2 + 2, TW / 2 - 2); this.pos.z = clamp(this.pos.z, -TD / 2 + 2, TD / 2 - 2); }
    for (const o of preyObs) { const dx = this.pos.x - o.x, dz = this.pos.z - o.z, dd = Math.hypot(dx, dz) || 1, rr = o.r * 1.1 + .4;
      if (dd < rr && this.y < o.h) { this.pos.x = o.x + dx / dd * rr; this.pos.z = o.z + dz / dd * rr; this.yaw = Math.atan2(dx, dz) + rand(-1, 1); } }
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
    this.mesh.position.set(this.pos.x, gy + this.y - this.burrowed * 1.2 + bob - (this.crouch > 0 ? .08 : 0), this.pos.z);
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
    this.setOpacity(1 - this.burrowed * .95);
    this.moving = this.burrowed <= 0 && (v > .3 || this.y > .05);
    this.vibT -= dt;
    if (this.moving && this.vibT <= 0 && vibOn) { spawnRipple(this.pos, this.vib); this.vibT = .45; }
  }
  setOpacity(op) { // materials only go transparent while the roach is digging in, so normal rendering keeps depth sorting
    if (Math.abs(op - this.opacity) < .005) return; this.opacity = op;
    this.mats.forEach(m => { const tr = op < .999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; m.depthWrite = !tr; });
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = op > .5; });
  }
  remove() { this.eaten = true; this.held = false; scene.remove(this.mesh); this.mesh.traverse(o => o.geometry && o.geometry.dispose()); this.mats.forEach(m => { envMats.delete(m); m.dispose(); }); }
}

/* ---------- vibration ripples (what the spider feels through slit sensilla in its legs) ---------- */
const ripples = [], ringGeo = new THREE.RingGeometry(.92, 1, 64); ringGeo.rotateX(-Math.PI / 2);
function spawnRipple(p, s) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(p.x, groundY(p.x, p.z) + .1, p.z); m.userData = { t: 0, s }; scene.add(m); ripples.push(m);
}

/* ---------- navigation around the hollow log ----------
   The log is an oriented box in log-local space (al = along the axis, sd = sideways). Its hollow is an open
   channel (|sd| < ch) that can only be entered through the ends; the walls are solid. */
const LOG_HL = LOG.len / 2 + .3, LOG_HW = LOG.R + .6;
const navDims = L => ({ hl: LOG_HL + L * .22, hw: LOG_HW + L * .22, ch: Math.max(.5, LOG_RI - .4 - L * .16) });
function segHitsBox(a, b, hl, hw) {                 // slab test: segment a→b (log-local) vs |al| < hl, |sd| < hw
  let t0 = 0, t1 = 1; const d = [b.al - a.al, b.sd - a.sd], o = [a.al, a.sd], e = [hl, hw];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] <= -e[k] || o[k] >= e[k]) return false; }
    else { let ta = (-e[k] - o[k]) / d[k], tb = (e[k] - o[k]) / d[k]; if (ta > tb) { const q = ta; ta = tb; tb = q; } t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 >= t1) return false; }
  }
  return true;
}
const reachable = (p, L) => inTank(p.x, p.z, L * .45 + .3);
function planOutside(from, to, L) {                  // shortest path around the log via its (inflated) corners
  const D = navDims(L), A = logLocal(from.x, from.z), B = logLocal(to.x, to.z), hl = D.hl + .5, hw = D.hw + .5;
  const ok = (P, Q) => !segHitsBox(P, Q, D.hl - .05, D.hw - .05), dist = (P, Q) => Math.hypot(P.al - Q.al, P.sd - Q.sd);
  if (ok(A, B)) return [to.clone()];
  const C = [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([al, sd]) => { const w = logWorld(al, sd); return { al, sd, w, r: reachable(w, L) }; });
  let best = null, bestLen = Infinity;
  C.forEach((c, i) => { if (!c.r || !ok(A, c)) return;
    if (ok(c, B)) { const l = dist(A, c) + dist(c, B); if (l < bestLen) { bestLen = l; best = [c.w, to.clone()]; } }
    [C[(i + 1) % 4], C[(i + 3) % 4]].forEach(c2 => { if (!c2.r || !ok(c2, B)) return; const l = dist(A, c) + dist(c, c2) + dist(c2, B); if (l < bestLen) { bestLen = l; best = [c.w, c2.w, to.clone()]; } });
  });
  return best || [to.clone()];
}
function inChannel(p, L) { const q = logLocal(p.x, p.z), D = navDims(L); return Math.abs(q.sd) < D.ch + .3 && Math.abs(q.al) < D.hl; }
const logMouth = L => logWorld(navDims(L).hl + .8, 0);   // just outside the open end that faces the tank
function planRoute(from, to, L) {
  const fIn = inChannel(from, L), tIn = inChannel(to, L), mouth = logMouth(L);
  if (fIn && tIn) return [to.clone()];
  if (fIn) return [mouth].concat(planOutside(mouth, to, L));
  if (tIn) return planOutside(from, mouth, L).concat([to.clone()]);
  return planOutside(from, to, L);
}
// hard collision: keep a body out of the log walls (it may move freely inside the channel) — returns true on contact
function pushOutOfLog(pos, pad, prev, ch) {
  const hl = LOG_HL + pad, hw = LOG_HW + pad, q = logLocal(pos.x, pos.z);
  if (Math.abs(q.al) >= hl || Math.abs(q.sd) >= hw) return false;
  let al = q.al, sd = q.sd;
  if (prev && ch) {
    const p = logLocal(prev.x, prev.z), wasIn = Math.abs(p.sd) <= ch + .05 && Math.abs(p.al) < hl;
    if (Math.abs(sd) <= ch && (wasIn || Math.abs(p.al) >= hl - .05)) return false;          // travelling in the channel / entering an end
    if (wasIn) sd = clamp(sd, -ch, ch);
    else if (hw - Math.abs(sd) < hl - Math.abs(al)) sd = Math.sign(sd || 1) * hw; else al = Math.sign(al || 1) * hl;
  } else if (hw - Math.abs(sd) < hl - Math.abs(al)) sd = Math.sign(sd || 1) * hw;             // solid box: leave by the nearest face
  else al = Math.sign(al || 1) * hl;
  const w = logWorld(al, sd); pos.x = w.x; pos.z = w.z; return true;
}

/* ---------- behaviour ---------- */
function metab() { return clamp((S.temp - 16) / 10, .25, 1.4); }                 // ectotherm: activity follows temperature
function isNight() { const h = S.hour % 24; return h < 6 || h >= 19; }
function daylight() { const h = S.hour % 24, ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }; return ss(5.3, 7, h) * (1 - ss(18.3, 19.8, h)); }
function setMode(m) {
  if (spider.prey && spider.prey.held && m !== 'eat') { spider.prey.held = false; spider.prey.heldT = 0; spider.prey.y = 0; }   // dropped the meal
  spider.mode = m; spider.modeT = 0; nav.stuckT = 0; nav.best = Infinity;
  if (m === 'idle') nav.idleFor = rand(2.5, 6);
}
const nav = { pauseT: 0, burstT: 2, stuckT: 0, best: Infinity, idleFor: 3, replanT: 0, lost: 0, mem: new V3(), prev: new V3() };
function accelerate(dt, des, acc) { const dv = des.clone().sub(spider.vel), m = acc * dt; if (dv.length() > m) dv.setLength(m); spider.vel.add(dv); }
function brake(dt) { accelerate(dt, new V3(), spider.span * 6 * TM); spider.yawRate = lerp(spider.yawRate, 0, clamp(dt * 5, 0, 1)); spider.yaw += spider.yawRate * dt; }
function faceTo(dt, x, z) { let dy = Math.atan2(x - spider.pos.x, z - spider.pos.z) - spider.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  spider.yawRate = lerp(spider.yawRate, clamp(dy * 4, -3, 3), clamp(dt * 6, 0, 1)); spider.yaw += spider.yawRate * dt; }
function drive(dt, target, maxSpeed) {
  const sp = spider, L = sp.span, dx = target.x - sp.pos.x, dz = target.z - sp.pos.z, d = Math.hypot(dx, dz);
  let dy = Math.atan2(dx, dz) - sp.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  sp.yawRate = lerp(sp.yawRate, clamp(dy * 3.5, -2.8, 2.8) * Math.min(TM, 3), clamp(dt * 5, 0, 1));
  sp.yaw += sp.yawRate * dt;
  const face = clamp((Math.cos(dy) - .2) / .8, 0, 1);        // pivot on the spot before walking off
  const fwd = new V3(Math.sin(sp.yaw), 0, Math.cos(sp.yaw));
  let v = maxSpeed * face * clamp(d / (L * .8), .2, 1);
  const ahead = groundY(sp.pos.x + fwd.x * L * .3, sp.pos.z + fwd.z * L * .3) - groundY(sp.pos.x, sp.pos.z);
  v *= clamp(1 - ahead / (L * .3) * .6, .4, 1.1);            // climbing a rock is slower than walking on soil
  const des = fwd.multiplyScalar(v);
  obstacles.forEach(o => { const ox = sp.pos.x - o.x, oz = sp.pos.z - o.z, od = Math.hypot(ox, oz) || 1, R = o.r + L * .35;
    if (od < R + L * .4) { const push = (R + L * .4 - od) / (L * .4), side = Math.sign(ox * dz - oz * dx) || 1;
      des.x += (ox / od - oz / od * side * .8) * maxSpeed * push * .9; des.z += (oz / od + ox / od * side * .8) * maxSpeed * push * .9; } });   // slide around, never stall head-on
  accelerate(dt, des, L * 5 * TM);
  return d;
}
function follow_route(dt, speed) {
  const sp = spider; if (!sp.route.length) return true;
  const tgt = sp.route[0], last = sp.route.length === 1;
  const d = drive(dt, tgt, speed);
  // progress watchdog: skip a waypoint that cannot be reached (blocked by a wall / rock face)
  if (d < nav.best - .3) { nav.best = d; nav.stuckT = 0; } else nav.stuckT += dt * Math.min(TM, 3);
  if (d < (last ? 1 : 1.6) || nav.stuckT > 4) { sp.route.shift(); nav.best = Infinity; nav.stuckT = 0; }
  return !sp.route.length;
}
function wanderSpot() {
  const L = spider.span, D = navDims(L);
  for (let k = 0; k < 40; k++) {
    const x = rand(-TW / 2 + 4, TW / 2 - 4), z = rand(-TD / 2 + 4, TD / 2 - 4), q = logLocal(x, z);
    if (!clearSpot(x, z) || !reachable({ x, z }, L)) continue;
    if (Math.abs(q.al) < D.hl + 1 && q.sd < D.hw + 1) continue;          // beside or behind the log
    if (Math.hypot(x - spider.pos.x, z - spider.pos.z) < L) continue;
    return new V3(x, 0, z);
  }
  return new V3(rand(-5, 5), 0, rand(0, 8));
}
function pickWander() {
  const hideP = S.phase === 'premolt' ? .8 : (isNight() ? .12 : .5) + (S.led ? .25 : 0);
  if (Math.random() < hideP) { goBurrow('toBurrow'); return; }
  spider.route = planRoute(spider.pos, wanderSpot(), spider.span);
  setMode('wander');
}
function goBurrow(mode) { spider.route = planRoute(spider.pos, BURROW, spider.span); setMode(mode); }
function sensePrey(p, senseR) { // slit sensilla feel substrate vibration; the legs also touch prey that sits very close
  const d = Math.hypot(p.pos.x - spider.pos.x, p.pos.z - spider.pos.z);
  return !p.eaten && !p.held && p.burrowed <= 0 && ((p.moving && d < senseR * p.vib) || d < spider.span * .55);
}

function tick(dt) {
  TM = fast ? 6 : 1;
  const hrs = dt * .5 * TM; S.hour += hrs;
  factT -= hrs; if (factT <= 0) { factT = rand(5, 9); log('รู้ไหม: ' + FACTS[factI++ % FACTS.length], true); }
  const night = isNight();
  if (night && S.wasNight === false) say('night', true);
  S.wasNight = night;
  sayCD -= dt; sayGap -= dt; if ((chatT -= dt) <= 0) { chatT = rand(20, 32); moodTalk(); }
  // care on autopilot, once per crisis: very hungry → drop in one prey; very dry → one misting (re-arms after it recovers)
  if (!previewing && S.phase === 'normal' && S.hunger >= 85 && !S.autoFed && !prey.some(p => !p.eaten)) {
    S.autoFed = true; say('starving', true); feed(Math.random() < .5 ? 'cricket' : 'dubia', true); }
  if (S.hunger < 60) S.autoFed = false;
  if (!previewing && S.hum < 55 && !S.autoMist) { S.autoMist = true; say('autoMist', true); mist(true); }
  if (S.hum > 75) S.autoMist = false;
  const tTarget = (S.lamp ? 28.5 : 24) - (night ? 1.5 : 0) + (S.led ? .5 : 0);
  S.temp = lerp(S.temp, tTarget, clamp(hrs * .15, 0, 1));
  S.hum = clamp(lerp(S.hum, 62, clamp(hrs * .03, 0, 1)) - (S.lamp ? hrs * .25 : 0), 30, 98);
  const M = metab();
  if (S.phase !== 'molting') S.hunger = clamp(S.hunger + hrs * 1.3 * M, 0, 100);
  S.phaseT += hrs;
  if (S.phase === 'normal' && S.growth >= 100) { S.phase = 'premolt'; S.phaseT = 0; log(`${S.name} หยุดกินอาหาร ท้องเริ่มคล้ำ เป็นสัญญาณว่าใกล้ลอกคราบ`, true); say('premolt', true); }
  if (S.phase === 'premolt' && S.phaseT > 30) { S.phase = 'molting'; S.phaseT = 0; setMode('molt'); log(`${S.name} นอนหงายเพื่อลอกคราบ อย่ารบกวน`, true); say('molt', true);
    if (S.hum < 60) log('ความชื้นต่ำไป คราบอาจลอกยาก ลองพ่นน้ำ', true);
    if (prey.some(p => !p.eaten)) log('ระวัง เหยื่อที่ยังมีชีวิตอาจกัดแมงมุมที่กำลังลอกคราบได้', true); }
  if (S.phase === 'molting' && S.phaseT > 6) finishMolt();
  if (S.phase === 'soft' && S.phaseT > 48) { S.phase = 'normal'; S.phaseT = 0; spider.soft = 0; log('เปลือกแข็งตัวแล้ว เขี้ยวกลับเป็นสีดำ พร้อมกินอาหาร', true); }
  if (S.phase === 'soft') spider.soft = clamp(1 - S.phaseT / 48, 0, 1);

  const sp = spider, L = sp.span, speed = L * .6 * sp.sp.speed * M * TM;
  sp.modeT += dt;
  const w = sp.want; for (const k in w) w[k] = 0;
  const hungry = S.hunger > 30 && S.phase === 'normal';
  const senseR = L * 2.8 * (night ? 1.3 : 1);
  if (hungry && ['wander', 'idle', 'toBurrow', 'hide'].includes(sp.mode)) {
    const p = prey.find(p => sensePrey(p, senseR));
    if (p) { sp.prey = p; nav.mem.copy(p.pos); nav.lost = 0; nav.replanT = 0; sp.route = []; setMode('hunt');
      log(`${S.name} รู้สึกถึงแรงสั่นของ${p.kind === 'cricket' ? 'จิ้งหรีด' : 'ดูเบีย'} จึงย่องเข้าหา`, true); say('hunt', true); }
  }
  switch (sp.mode) {
    case 'idle': brake(dt); if (sp.modeT > nav.idleFor / M) pickWander(); break;
    case 'wander': // tarantulas walk in short bursts, freezing to feel the ground in between
      if (nav.pauseT > 0) { nav.pauseT -= dt * TM; brake(dt); if (sp.modeT > 18) setMode('idle'); break; }
      if ((nav.burstT -= dt * TM) <= 0) { nav.burstT = rand(1.5, 4); if (Math.random() < .55) nav.pauseT = rand(.5, 1.8) / M; }
      if (follow_route(dt, speed * .45) || sp.modeT > 18) setMode('idle'); break;
    case 'toBurrow': if (follow_route(dt, speed * .55)) setMode('hide'); if (sp.modeT > 40) setMode('idle'); break;
    case 'hide': brake(dt); w.hidden = 1; if ((night && sp.modeT > 3 && S.phase !== 'premolt') || sp.modeT > 25 / M) pickWander(); break;
    case 'hunt': {
      const p = sp.prey; w.stalk = 1;
      if (!p || p.eaten || p.burrowed > 0) { setMode('idle'); log('เหยื่อหายไป แมงมุมหยุดล่า'); break; }
      const d = Math.hypot(p.pos.x - sp.pos.x, p.pos.z - sp.pos.z), felt = sensePrey(p, senseR * 1.3);
      if (felt) { nav.mem.copy(p.pos); nav.lost = 0; } else nav.lost += dt;
      if (d < L * .9 && (felt || d < L * .6)) { setMode('strike'); break; }
      if (nav.lost > 10 / M || sp.modeT > 45) { setMode('idle'); log('เหยื่ออยู่นิ่ง แมงมุมจับแรงสั่นไม่ได้ จึงเลิกล่า', true); break; }
      if ((nav.replanT -= dt) <= 0 || !sp.route.length) { const old = sp.route[0]; sp.route = planRoute(sp.pos, nav.mem, L); nav.replanT = .5;
        if (!old || old.distanceTo(sp.route[0]) > .5) { nav.best = Infinity; nav.stuckT = 0; } }
      const dm = Math.hypot(nav.mem.x - sp.pos.x, nav.mem.z - sp.pos.z);
      if (!felt && dm < L * .6) { brake(dt); faceTo(dt, nav.mem.x, nav.mem.z); }   // lost the trail at its last position: freeze and wait
      else if (sp.route.length > 1) follow_route(dt, speed * .45);
      else drive(dt, nav.mem, speed * (felt ? .38 : .28));
      break;
    }
    case 'strike': {
      const p = sp.prey; w.fang = 1; w.stalk = .5;
      if (!p || p.eaten) { setMode('idle'); break; }
      const fwd = new V3(Math.sin(sp.yaw), 0, Math.cos(sp.yaw)), mouth = sp.pos.clone().addScaledVector(fwd, L * .2);
      const dm = Math.hypot(p.pos.x - mouth.x, p.pos.z - mouth.z);
      if (sp.modeT < .2) { w.rear = 1; brake(dt); faceTo(dt, p.pos.x, p.pos.z); }       // rear up, then a short lunge (≈ half a leg span, not time-scaled)
      else { w.rear = .3; faceTo(dt, p.pos.x, p.pos.z); sp.vel.copy(fwd).multiplyScalar(dm > L * .12 && sp.modeT < .45 ? L * 2.4 : 0); }
      if (sp.modeT > .2 && dm < L * .3) { setMode('eat'); sp.vel.set(0, 0, 0); p.held = true; p.v = 0; p.burrowed = 0; p.setOpacity(1); log(`${S.name} พุ่งกัดด้วยเขี้ยวแล้วปล่อยพิษ จับได้แล้ว`); say('catch', true); }
      else if (sp.modeT > .55) { sp.vel.multiplyScalar(.2); setMode('hunt'); log('พลาด เหยื่อหลบได้'); say('miss', true); }
      break;
    }
    case 'eat': {
      const p = sp.prey; w.eat = 1; w.fang = 1; brake(dt);
      if (!p || p.eaten) { setMode('idle'); break; }
      const mouth = sp.worldOf(new V3(0, -L * .045, L * .17));
      p.pos.set(mouth.x, 0, mouth.z); p.v = 0; p.moving = false;
      p.mesh.position.copy(mouth); p.mesh.rotation.set(.5, sp.yaw + Math.PI / 2, 0);
      if (sp.modeT > 9 / TM) {
        leaveBolus(mouth, p.kind);
        p.remove(); S.autoFed = false; S.hunger = clamp(S.hunger - p.value * 1.4, 0, 100); S.growth = clamp(S.growth + p.value * (12 / L), 0, 100);
        log('ย่อยนอกร่างกายเสร็จ เหลือแต่ซาก (น้ำย่อยละลายเนื้อเหยื่อก่อนดูดกิน)', true); say('eat', true); setMode('idle'); save();
      }
      break;
    }
    case 'threat': w.threat = 1; w.fang = 1; brake(dt); faceTo(dt, camera.position.x, camera.position.z); if (sp.modeT > 2.6) setMode('idle'); break;
    case 'flee': if (follow_route(dt, speed * 2.2) || sp.modeT > 12) setMode('hide'); break;
    case 'molt': w.flip = 1; brake(dt); break;
  }
  if (S.phase !== 'normal' && (sp.mode === 'hunt' || sp.mode === 'strike')) setMode('idle');
  nav.prev.copy(sp.pos);
  sp.pos.addScaledVector(sp.vel, dt);
  sp.pos.x = clamp(sp.pos.x, -TW / 2 + L * .45, TW / 2 - L * .45); sp.pos.z = clamp(sp.pos.z, -TD / 2 + L * .45, TD / 2 - L * .45);
  // solid log walls: the spider only gets under the log through the open end (its route), never through the bark
  if (pushOutOfLog(sp.pos, L * .22, nav.prev, navDims(L).ch)) { sp.vel.multiplyScalar(.5); }
  obstacles.forEach(o => { const dx = sp.pos.x - o.x, dz = sp.pos.z - o.z, d = Math.hypot(dx, dz) || 1, R = o.r - .3 + L * .18;
    if (d < R) { sp.pos.x = o.x + dx / d * R; sp.pos.z = o.z + dz / d * R; } });
  sp.update(dt);
  prey.forEach(p => p.update(dt, sp));
  for (let i = prey.length - 1; i >= 0; i--) if (prey[i].eaten) prey.splice(i, 1);
  for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.userData.t += dt; const k = r.userData.t;
    r.scale.setScalar(1 + k * 9 * r.userData.s); r.material.opacity = .45 * (1 - k / 1.2); if (k > 1.2) { scene.remove(r); r.material.dispose(); ripples.splice(i, 1); } }
  for (let i = boluses.length - 1; i >= 0; i--) { const b = boluses[i]; b.userData.t -= hrs; if (b.userData.t < 0) { scene.remove(b); boluses.splice(i, 1); } }
  if (humWarnT > 0) humWarnT -= hrs;
  if (humWarnT <= 0 && S.hum > 88) { log('ความชื้นสูงเกิน เสี่ยงเชื้อราในตู้ ควรหยุดพ่นน้ำสักพัก', true); humWarnT = 24; }
  if (humWarnT <= 0 && S.temp < 20) { log('อากาศเย็นไป แมงมุมเป็นสัตว์เลือดเย็น จึงเคลื่อนไหวช้าลง', true); humWarnT = 24; }
}
// the chewed, dried-out food bolus a tarantula drops after feeding
const boluses = [], bolusGeo = (() => { const g = new THREE.SphereGeometry(1, 12, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(1 + PERLIN.noise(v.x * 2.5, v.y * 2.5, v.z * 2.5) * .35); p.setXYZ(i, v.x, v.y * .6, v.z); }
  g.computeVertexNormals(); return g; })();
const bolusMat = track(new THREE.MeshStandardMaterial({ color: lin(0x2a1d12), roughness: .85 }), .3);
function leaveBolus(p, kind) {
  const m = new THREE.Mesh(bolusGeo, bolusMat), s = kind === 'dubia' ? .42 : .32; m.scale.setScalar(s);
  m.position.set(p.x, groundY(p.x, p.z) + s * .3, p.z); m.rotation.y = rand(0, 6.3); m.castShadow = true; m.userData.t = 36; scene.add(m); boluses.push(m);
}
let humWarnT = 0, factT = 3, factI = Math.floor(Math.random() * 21);
function finishMolt() {
  const ex = spider.exuvia(); scene.add(ex); exuviae.push(ex); if (exuviae.length > 2) scene.remove(exuviae.shift());
  const old = spider.span; S.molts++; S.span = Math.min(spider.sp.maxSpan, +(old * 1.18).toFixed(1));
  const pos = spider.pos.clone(), yaw = spider.yaw; spider.dispose();
  spider = new Spider(S.sp, S.span); spider.yaw = yaw; spider.pos.copy(pos).add(new V3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(old * .6)); spider.placeFeet();
  S.phase = 'soft'; S.phaseT = 0; S.growth = 0; spider.soft = 1; setMode('idle');
  sayGap = 0; say('soft', true);
  log(`ลอกคราบครั้งที่ ${S.molts} สำเร็จ ขนาดขา ${old} → ${S.span} ซม. เปลือกใหม่ยังนิ่ม ห้ามให้อาหารราว 1–2 สัปดาห์`, true);
  save();
}

/* ---------- post-processing ----------
   RenderPass (ACES tone-mapped, linear, half-float) → BokehPass (macro depth of field) → UnrealBloom →
   grade (split-tone, sRGB encode, contrast, vignette, grain) → FXAA (on sRGB, as it expects) */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new V2(1, 1) }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uNight; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(.2126,.7152,.0722));
      col = mix(col, col * vec3(.92,.98,1.08), (1.0 - smoothstep(0.0,.18,l)) * (.3 + uNight * .4));   // cool shadows (bluer at night)
      col = mix(col, col * vec3(1.06,1.0,.92), smoothstep(.25,.9,l) * .3);                          // warm highlights
      col = mix(vec3(l), col, 1.06 - uNight * .2);                                                   // gentle saturation, less at night
      col = LinearTosRGB(vec4(max(col, 0.0), 1.0)).rgb;
      col = col * col * (3.0 - 2.0 * col) * .12 + col * .88;                                         // soft S-curve
      vec2 q = vUv - .5; float v = smoothstep(.9, .28, length(q * vec2(uRes.x / uRes.y * .62, 1.0)));
      col *= mix(.62, 1.0, v);
      col += (hash(vUv * uRes + fract(uTime * 7.1) * 91.0) - .5) * .018;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
const composer = new THREE.EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType }));
composer.addPass(new THREE.RenderPass(scene, camera));
const bokeh = new THREE.BokehPass(scene, camera, { focus: 50, aperture: .0002, maxblur: .008, width: 2, height: 2 });
{ // depth for DOF: skip glass, dust and additive FX so they don't punch sharp holes in the blur
  const orig = bokeh.render.bind(bokeh), hide = () => [glassGroup, dust, roomBokeh, ...ripples, ...drops];
  bokeh.render = function (...a) { const h = hide(), vis = h.map(o => o.visible); h.forEach(o => o.visible = false); orig(...a); h.forEach((o, i) => o.visible = vis[i]); };
}
composer.addPass(bokeh);
const bloom = new THREE.UnrealBloomPass(new V2(2, 2), .38, .5, .86); composer.addPass(bloom);
const grade = new THREE.ShaderPass(GradeShader); composer.addPass(grade);
const fxaa = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaa);
renderer.shadowMap.autoUpdate = false;              // shadows once per frame, not again for the DOF depth pass
function setShadowRes(n) { [[led, n], [lamp, n / 2]].forEach(([l, s]) => { if (l.shadow.mapSize.x !== s) { l.shadow.mapSize.set(s, s); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } }); }
function resize() {
  const hi = quality === 'high', w = innerWidth, h = innerHeight, pr = hi ? Math.min(devicePixelRatio, 1.75) : Math.min(devicePixelRatio, 1);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); composer.setPixelRatio(pr); composer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = clamp(2 * Math.atan(Math.tan(26 * Math.PI / 180) / camera.aspect) * 180 / Math.PI, 36, 64);   // portrait phones: widen so the tank still fits
  camera.updateProjectionMatrix();
  fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); grade.uniforms.uRes.value.set(w * pr, h * pr);
  bokeh.uniforms.aspect.value = camera.aspect;       // BokehPass only reads the aspect once, at construction
  bokeh.enabled = hi; bloom.enabled = hi;
  setShadowRes(hi ? 2048 : 1024);
}
addEventListener('resize', resize);

/* ---------- input ---------- */
const ray = new THREE.Raycaster(), mouse = new V2(); let downAt = null;
canvas.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
canvas.addEventListener('pointerup', e => {
  if (!downAt || !spider || previewing || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = canvas.getBoundingClientRect(); mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  if (!ray.intersectObjects(spider.picks || (spider.picks = spider.pickables())).length) return;
  if (S.phase === 'molting') { log('อย่าจิ้มระหว่างลอกคราบ อาจทำให้ขาหลุดหรือคราบติด', true); return; }
  if (Math.random() < spider.sp.aggro) { setMode('threat'); say('poke', true); log(`${S.name} ยกขาหน้าและกางเขี้ยวขู่ บึ้งไทยไม่มีขนพิษ จึงป้องกันตัวด้วยการขู่และกัด`, true); }
  else { goBurrow('flee'); log(`${S.name} ตกใจ วิ่งกลับเข้าโพรงใต้ขอนไม้`); say('flee', true); }
});
function feed(kind, auto) {
  if (prey.filter(p => !p.eaten).length >= 4) { log('ในตู้มีเหยื่อเยอะแล้ว เหยื่อที่เหลือค้างอาจทำร้ายแมงมุมได้'); return; }
  prey.push(new Prey(kind));
  if (auto) log(`🤖 ให้อาหารอัตโนมัติ: ${S.name} หิวจัด จึงปล่อย${kind === 'cricket' ? 'จิ้งหรีด' : 'แมลงสาบดูเบีย'} 1 ตัว`);
  else if (S.phase === 'premolt') log('แมงมุมที่ใกล้ลอกคราบจะไม่กิน ควรเอาเหยื่อออก', true);
  else if (S.phase === 'soft') log('เขี้ยวยังนิ่มหลังลอกคราบ ยังไม่ควรให้อาหาร', true);
  else log(kind === 'cricket' ? 'ปล่อยจิ้งหรีด 1 ตัว (กระโดดเก่ง สร้างแรงสั่นมาก)' : 'ปล่อยแมลงสาบดูเบีย 1 ตัว (โปรตีนสูง ชอบมุดดิน)');
}
$('tCricket').onclick = () => feed('cricket');
$('tDubia').onclick = () => feed('dubia');
function mist(auto) { if (!auto) S.autoMist = false; S.hum = clamp(S.hum + 14, 0, 98); mistFx();
  if (auto) log(`🤖 พ่นน้ำอัตโนมัติ: ความชื้นต่ำมาก จึงพ่นละอองน้ำให้ 1 ครั้ง`); else { log('พ่นละอองน้ำ ความชื้นเพิ่มขึ้น'); say('misted', true); } }
$('tMist').onclick = () => mist(false);
$('tLed').onclick = e => { S.led = !S.led; e.currentTarget.classList.toggle('on', S.led); log(S.led ? 'เปิดไฟตู้' : 'ปิดไฟตู้');
  if (S.led) { say('bright', true); log('ทารันทูลาไม่ชอบแสงจ้า ถ้าเปิดไฟตู้นานๆ มันจะหลบในโพรงบ่อยขึ้น', true); if (spider.mode === 'wander' && Math.random() < .5) goBurrow('toBurrow'); } };
$('tLamp').onclick = e => { S.lamp = !S.lamp; e.currentTarget.classList.toggle('on', S.lamp); log(S.lamp ? 'เปิดไฟอุ่น' : 'ปิดไฟอุ่น'); };
$('tVib').onclick = e => { vibOn = !vibOn; e.currentTarget.classList.toggle('on', vibOn); };
$('tFollow').onclick = e => { follow = !follow; e.currentTarget.classList.toggle('on', follow); };
$('tFast').onclick = e => { fast = !fast; e.currentTarget.classList.toggle('on', fast); };
$('tQual').onclick = e => { quality = quality === 'high' ? 'low' : 'high'; e.currentTarget.textContent = quality === 'high' ? '✨ ภาพ: สูง' : '⚡ ภาพ: เร็ว'; resize(); };
const drops = [], dropGeo = new THREE.SphereGeometry(.07, 6, 4), dropMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: .45, depthWrite: false });
function mistFx() {
  for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(dropGeo, dropMat); m.scale.set(1, 2.2, 1);
    m.position.set(rand(-TW / 2 + 2, TW / 2 - 2), rand(TH * .7, TH), rand(-TD / 2 + 2, TD / 2 - 2)); m.userData.v = rand(8, 16); scene.add(m); drops.push(m); }
}

/* ---------- HUD ---------- */
const STATE_TH = { idle: 'พัก', wander: 'สำรวจ', toBurrow: 'กลับโพรง', hide: 'หลบในโพรง', hunt: 'ย่องล่าเหยื่อ', strike: 'พุ่งจู่โจม', eat: 'กำลังกิน', threat: 'ท่าขู่', flee: 'หนี', molt: 'ลอกคราบ' };
function bar(id, pct, cls) { const b = $(id); b.className = 'bar ' + (cls || ''); b.firstElementChild.style.width = clamp(pct, 0, 100) + '%'; }
function hud() {
  const sp = SPECIES[S.sp];
  $('hName').textContent = S.name; $('hSp').textContent = `${sp.th} · ${sp.sci}`;
  const ph = { premolt: 'ก่อนลอกคราบ (ไม่กิน)', soft: 'หลังลอกคราบ (เปลือกนิ่ม)', molting: 'กำลังลอกคราบ' }[S.phase];
  const st = $('hState'); st.textContent = ph ? `${STATE_TH[spider.mode] || ''} · ${ph}` : STATE_TH[spider.mode] || spider.mode; st.classList.toggle('warn', !!ph || spider.mode === 'threat');
  bar('bHunger', S.hunger, S.hunger > 75 ? 'bad' : S.hunger < 40 ? 'ok' : ''); $('vHunger').textContent = Math.round(S.hunger) + '%';
  bar('bTemp', (S.temp - 15) / 20 * 100, S.temp >= 24 && S.temp <= 28 ? 'ok' : 'bad'); $('vTemp').textContent = S.temp.toFixed(1) + '°C';
  bar('bHum', S.hum, S.hum >= 65 && S.hum <= 85 ? 'ok' : 'bad'); $('vHum').textContent = Math.round(S.hum) + '%';
  bar('bGrow', S.growth, S.growth >= 100 ? 'bad' : ''); $('vGrow').textContent = Math.round(S.growth) + '%';
  $('vSpan').textContent = S.span + ' ซม.'; $('vMolt').textContent = 'ลอก ' + S.molts + ' ครั้ง';
  const h = Math.floor(S.hour % 24); $('vTime').textContent = `วัน ${Math.floor(S.hour / 24) + 1} · ${String(h).padStart(2, '0')}:00`; $('vDay').textContent = isNight() ? '🌙 กลางคืน' : '☀️ กลางวัน';
}

/* ---------- start ---------- */
let chosen = null, previewing = true;
Object.entries(SPECIES).forEach(([k, v]) => {
  const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `${v.th}<br><span class="hint">${v.en}</span>`;
  b.onclick = () => { chosen = chosen === k ? null : k; [...$('spPick').children].forEach(c => c.classList.remove('on')); if (chosen) b.classList.add('on');
    $('goBtn').textContent = chosen ? `เริ่มเลี้ยง${v.th}` : 'เริ่มเลี้ยง (สุ่มพันธุ์)'; };
  $('spPick').appendChild(b);
});
function begin(state, fresh) {
  if (previewing) { spider.dispose(); previewing = false; }
  S = state; if (S.led === undefined) S.led = true;
  $('start').hidden = true; ['hud', 'log', 'tools'].forEach(id => $(id).hidden = false);
  $('tLamp').classList.toggle('on', S.lamp); $('tLed').classList.toggle('on', S.led);
  spider = new Spider(S.sp, S.span); pickWander();
  if (S.phase === 'molting') { S.phase = 'premolt'; S.phaseT = 29; }
  if (S.phase === 'soft') spider.soft = 1 - S.phaseT / 48;
  const sp = SPECIES[S.sp];
  if (fresh) { log(`ยินดีต้อนรับ ${S.name} (${sp.th})`); log(sp.fact, true); log('แมงมุมตาไม่ดี มันรับรู้เหยื่อจากแรงสั่นผ่านขนและอวัยวะรับแรงที่ขา (วงสีส้มคือแรงสั่น)', true); }
  else log(`กลับมาดู ${S.name} อีกครั้ง`);
  save();
}
$('goBtn').onclick = () => { const keys = Object.keys(SPECIES), sp = chosen || keys[Math.floor(Math.random() * keys.length)]; begin(newState(($('nameIn').value || 'ปีเตอร์').trim(), sp), true); };
{ const saved = load();
  if (saved && SPECIES[saved.sp]) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = `เลี้ยง ${saved.name} ต่อ (${SPECIES[saved.sp].th})`; b.onclick = () => begin(saved, false); $('goBtn').after(b); } }
if (matchMedia('(pointer: coarse)').matches) { quality = 'low'; $('tQual').textContent = '⚡ ภาพ: เร็ว'; }

/* ---------- loop ---------- */
S = newState('', 'lividus'); spider = new Spider('lividus', 10); pickWander();
resize();
const clock = new THREE.Clock(); let hudT = 0, saveT = 0;
// background & fog are shaded in linear space, so convert the sRGB picks (otherwise the room turns milky grey)
const BG_DAY = new THREE.Color(0x1a1512).convertSRGBToLinear(), BG_NIGHT = new THREE.Color(0x07080d).convertSRGBToLinear(), camPrev = new V3();
function loop() {
  const dt = Math.min(clock.getDelta(), .05), now = clock.elapsedTime;
  HAIR_U.uTime.value = now; grade.uniforms.uTime.value = now;
  tick(dt);
  // foliage is shoved by the spider's body and legs and by prey, then springs back
  const cols = spider && spider.legs[0].J ? spider.colliders([]) : [];
  prey.forEach(p => { if (!p.eaten && p.burrowed < .5) cols.push(p.mesh.position.x, p.mesh.position.y + .3, p.mesh.position.z, p.kind === 'cricket' ? .5 : .85); });
  updateFoliage(dt, cols);
  // lighting: room daylight follows the clock; LED bar and heat lamp follow their switches
  const day = daylight(), k = clamp(dt * 3, 0, 1), B = LIGHT_BASE;
  led.intensity = lerp(led.intensity, S.led ? B.led : 0, k);
  lamp.intensity = lerp(lamp.intensity, S.lamp ? B.lamp : 0, k);
  const ledK = led.intensity / B.led, lampK = lamp.intensity / B.lamp;
  lampGlow.intensity = lampK * 1.3;
  hemi.intensity = lerp(.035, B.hemi, day) * (.55 + .45 * ledK);
  moon.intensity = (1 - day) * B.moon * (1 - .6 * ledK);
  rim.intensity = lerp(.03, B.rim, day);
  scene.background.copy(BG_NIGHT).lerp(BG_DAY, day); scene.fog.color.copy(scene.background);
  grade.uniforms.uNight.value = (1 - day) * (1 - .7 * ledK);
  ledBar.userData.strip.material.color.setRGB(3, 3.05, 3.2).multiplyScalar(ledK + .02);
  bulb.material.color.setRGB(4, 1.9, .7).multiplyScalar(lampK + .01);
  const env = (.07 + .38 * day) * (.5 + .5 * ledK) + .06 * lampK;
  if (Math.abs(env - envLevel) > .005) { envLevel = env; applyEnv(env); }
  water.material.normalMap.offset.set(now * .01, now * .007);
  const da = dust.geometry.attributes.position;
  for (let i = 0; i < dustN; i++) { da.array[i * 3 + 1] += Math.sin(now * .3 + i) * dt * .15; da.array[i * 3] += Math.cos(now * .21 + i * 1.3) * dt * .12; }
  da.needsUpdate = true; dust.material.opacity = .02 + ledK * .12 + lampK * .04;
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.position.y -= d.userData.v * dt; if (d.position.y < groundY(d.position.x, d.position.z)) { scene.remove(d); drops.splice(i, 1); } }
  if (follow && spider) { camPrev.copy(controls.target); controls.target.lerp(spider.root.position, clamp(dt * 2.5, 0, 1)); camera.position.add(camPrev.sub(controls.target).negate()); }
  controls.update();
  // focus on the orbit target (the spider when following); shallower DOF the closer the camera, like a macro lens
  const fd = camera.position.distanceTo(controls.target);
  bokeh.uniforms.focus.value = fd; bokeh.uniforms.aperture.value = clamp(.0065 / fd, .00005, .0006);
  renderer.shadowMap.needsUpdate = true;
  composer.render();
  // speech bubble floats above the spider
  const sb = $('say'); sayBubbleT -= dt;
  if (sayBubbleT > 0 && spider && !previewing) { const q = spider.root.position.clone(); q.y += spider.span * .22; q.project(camera);
    const on = q.z < 1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1; sb.classList.toggle('on', on && sayBubbleT > .3);
    if (on) { sb.style.left = clamp((q.x * .5 + .5) * innerWidth, 130, innerWidth - 130) + 'px'; sb.style.top = Math.max(60, (-q.y * .5 + .5) * innerHeight) + 'px'; } }
  else sb.classList.remove('on');
  if (!previewing) { hudT -= dt; if (hudT < 0) { hud(); hudT = .2; } saveT -= dt; if (saveT < 0) { save(); saveT = 5; } }
  requestAnimationFrame(loop);
}
loop();
