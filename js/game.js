'use strict';
/* =====================================================================
   Game: care loop, behaviour, prey, post-processing, HUD
   ===================================================================== */
let view = null, viewT = 0, haze = 0, cine = false, eyes = false, tankView = false, saverOn = false, saverT = 0, saverShot = { az: 0, el: .5, r: 20 };
/* ---------- city: buildings are walkable like ROCKS (height grid from their solid shell). A building is a wall the spider
   walks around until it is big enough to step up onto the roof (roof lower than CLIMB × leg span) ---------- */
const CLIMB = .35, KAIJU = 2.4;                                // kaiju growth: span 5 → ×1.35 per molt up to maxSpan × KAIJU (31–38, 6–7 molts)
const LOG_FIT = 22;                                            // bigger than this the spider no longer fits in the log hide
if (typeof CITY !== 'undefined') {
  cityInside = CITY.inside;                                     // grass, prey and wander spots stay out of the buildings
  CITY.buildings.forEach(b => { if (!b.solid) return;
    const g = b.solid, p = g.attributes.position, idx = g.index ? g.index.array : Array.from({ length: p.count }, (_, i) => i);
    const k = { b, x: b.x, z: b.z, c: Math.cos(b.rot || 0), s: Math.sin(b.rot || 0), hw: b.w / 2, hd: b.d / 2, h: b.h, r: Math.hypot(b.w, b.d) / 2,
      grid: heightGrid(p, idx, () => true) }, G = k.grid;
    // eaves, awnings and signboards hang out over the street: only the footprint itself is walkable (no floors in mid-air)
    for (let gj = 0; gj < G.d; gj++) for (let gi = 0; gi < G.w; gi++) { const x = G.x0 + gi * G.cs, z = G.z0 + gj * G.cs;
      if (solidNear(k, x, z).d > .05) G.H[gj * G.w + gi] = soilY(x, z); }
    SOLIDS.push(k); });
}
const walls = L => SOLIDS.filter(k => k.h > L * CLIMB);        // too tall to step onto at this size
// street props (poles, vending machines, rubble): in the way of a small spider and of prey; a kaiju just steps past them
const PROPS = typeof CITY !== 'undefined' && CITY.props ? CITY.props : [];
PROPS.forEach(p => preyObs.push({ x: p.x, z: p.z, r: p.r, h: 20 }));
const obstaclesFor = L => L < 14 ? obstacles.concat(PROPS) : obstacles;
let S = null, spider = null, vibOn = true, follow = false, fast = false, TM = 1, quality = 'high';
let envLevel = -1;   // env-map level last applied (spider.js reads it for materials created later)
const SAVE_KEY = 'tarantula3d-v2';
const exuviae = [], EXU_LIFE = 180;
function dropExuvia(e) { scene.remove(e); const ms = new Set(); e.traverse(q => { if (q.isMesh) { q.geometry.dispose(); ms.add(q.material); } }); ms.forEach(m => m.dispose()); }
function newState(name, sp) { return { name, sp, span: 5, hunger: 40, growth: 0, molts: 0, temp: 25, hum: 70, hour: 17, lamp: true, led: true, phase: 'normal', phaseT: 0 }; }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
function log(msg, cls) { // stamped with the real clock of the keeper's device
  const p = document.createElement('p'); if (cls) p.className = cls === true ? 'sci' : cls;
  const d = new Date(), t = [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
  p.innerHTML = `<b class="num">${t}</b> ${msg}`;
  const L = $('log'); L.insertBefore(p, L.children[1] || null);
  while (L.children.length > 30) L.removeChild(L.lastChild);
  if (!document.body.classList.contains('logOpen')) { logUnread++; const b = $('logBadge'); b.textContent = logUnread > 9 ? '9+' : logUnread; b.hidden = false; }   // จุดแจ้งเตือนบนปุ่ม 📓
}
let logUnread = 0;
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
/* ---------- vibration ripples (what the spider feels through slit sensilla in its legs) ---------- */
const ripples = [], ringGeo = new THREE.RingGeometry(.92, 1, 64); ringGeo.rotateX(-Math.PI / 2);
function spawnRipple(p, s, wet) { // wet: a ring on the water surface (a foot or prey touching the water hole)
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: wet ? 0xcfe6ff : 0xffb35c, transparent: true, opacity: wet ? .3 : .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.set(p.x, wet ? WATER_Y + .03 : groundY(p.x, p.z) + .1, p.z); m.userData = { t: 0, s, wet }; m.renderOrder = 3; scene.add(m); ripples.push(m);
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
  if (m !== 'hunt' && m !== 'strike') { if (nav.chaseT) ROUND.chaseOff(m === 'eat'); nav.chaseT = 0; nav.chaseMax = rand(CHASE.tMin, CHASE.tMax); }
  spider.mode = m; spider.modeT = 0; nav.stuckT = 0; nav.stuckN = 0; nav.backT = 0; nav.best = Infinity; nav.huntBest = Infinity; nav.huntT = 0;
  if (m === 'idle') nav.idleFor = rand(2.5, 6);
}
const nav = { pauseT: 0, burstT: 2, stuckT: 0, stuckN: 0, backT: 0, back: new V3(), restT: 0, chaseT: 0, chaseMax: 12, starving: false, cRT: 0, cR: null, best: Infinity, idleFor: 3, replanT: 0, lost: 0, mem: new V3(), prev: new V3() };
function accelerate(dt, des, acc) { const dv = des.clone().sub(spider.vel), m = acc * dt; if (dv.length() > m) dv.setLength(m); spider.vel.add(dv); }
function brake(dt) { accelerate(dt, new V3(), spider.span * 6 * TM); spider.yawRate = lerp(spider.yawRate, 0, clamp(dt * 5, 0, 1)); spider.yaw += spider.yawRate * dt; }
function faceTo(dt, x, z, k) { let dy = Math.atan2(x - spider.pos.x, z - spider.pos.z) - spider.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  spider.yawRate = lerp(spider.yawRate, clamp(dy * 4, -3, 3) * (k || 1), clamp(dt * 6, 0, 1)); spider.yaw += spider.yawRate * dt; }
// opt (the chase): acc = acceleration, turn = max turn rate, noSlow = no easing off near the target
function drive(dt, target, maxSpeed, opt) {
  const sp = spider, L = sp.span, dx = target.x - sp.pos.x, dz = target.z - sp.pos.z, d = Math.hypot(dx, dz);
  let dy = Math.atan2(dx, dz) - sp.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const tc = opt ? opt.turn : 2.8; sp.yawRate = lerp(sp.yawRate, clamp(dy * 3.5, -tc, tc) * Math.min(TM, 3), clamp(dt * 5, 0, 1));
  sp.yaw += sp.yawRate * dt;
  const face = clamp((Math.cos(dy) - .2) / .8, 0, 1);        // pivot on the spot before walking off
  const fwd = new V3(Math.sin(sp.yaw), 0, Math.cos(sp.yaw));
  let v = maxSpeed * face * (opt && opt.noSlow ? 1 : clamp(d / (L * .8), .2, 1));
  const ahead = groundY(sp.pos.x + fwd.x * L * .3, sp.pos.z + fwd.z * L * .3) - groundY(sp.pos.x, sp.pos.z);
  v *= clamp(1 - ahead / (L * .3) * .6, .4, 1.1);            // climbing a rock is slower than walking on soil
  v *= clamp(1 - (sp.climbLag || 0) * 7, .15, 1);           // stepping up onto a roof: wait for the body to rise with the legs
  if (inPond(sp.pos.x, sp.pos.z)) v *= .6;                    // wading through the water hole
  const des = fwd.multiplyScalar(v);
  obstaclesFor(L).forEach(o => { const ox = sp.pos.x - o.x, oz = sp.pos.z - o.z, od = Math.hypot(ox, oz) || 1, R = o.r + L * .35;
    if (od < R + L * .4) { const push = (R + L * .4 - od) / (L * .4), side = Math.sign(ox * dz - oz * dx) || 1;
      des.x += (ox / od - oz / od * side * .8) * maxSpeed * push * .9; des.z += (oz / od + ox / od * side * .8) * maxSpeed * push * .9; } });   // slide around, never stall head-on
  for (const k of walls(L)) { const n = solidNear(k, sp.pos.x, sp.pos.z), R = L * .35;           // buildings: slide along the wall
    if (n.d < R + L * .4) { const push = clamp((R + L * .4 - n.d) / (L * .4), 0, 2), side = Math.sign(n.nx * dz - n.nz * dx) || 1;
      des.x += (n.nx - n.nz * side * .8) * maxSpeed * push * .9; des.z += (n.nz + n.nx * side * .8) * maxSpeed * push * .9; } }
  const dl = Math.hypot(des.x, des.z), cap = maxSpeed * 1.15; if (dl > cap) des.multiplyScalar(cap / dl);   // wall sliding never adds speed
  accelerate(dt, des, opt ? opt.acc : L * 5 * TM);
  return d;
}
/* ---------- town navigation (per spider size): a 1-unit grid of the cells a spider of span L can stand in (tall buildings
   = walls inflated by the push radius, the log box, the tank edge), its connected areas, and A* routes around the footprints.
   planRoute() still handles the log; cityRoute() replaces any leg that runs into a wall with an A* path (string-pulled). ---------- */
const NAVG = { L: -1 }, N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function navGrid(L) {
  if (NAVG.L === L) return NAVG;
  const nx = TW + 1, nz = TD + 1, free = new Uint8Array(nx * nz), comp = new Int32Array(nx * nz).fill(-1), W = walls(L), cl = L * .32, ed = L * .45, D = navDims(L);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = i - TW / 2, z = j - TD / 2;
    let ok = Math.abs(x) <= TW / 2 - ed && Math.abs(z) <= TD / 2 - ed;
    if (ok) { const q = logLocal(x, z); if (Math.abs(q.al) < D.hl && Math.abs(q.sd) < D.hw) ok = false; }
    if (ok) for (const k of W) if (solidNear(k, x, z).d < cl) { ok = false; break; }
    free[j * nx + i] = ok ? 1 : 0; }
  let c = 0; const st = [];
  for (let s = 0; s < free.length; s++) if (free[s] && comp[s] < 0) { comp[s] = c; st.push(s);
    while (st.length) { const k = st.pop(), i = k % nx, j = k / nx | 0;
      for (const [di, dj] of N8) { const a = i + di, b = j + dj, q = b * nx + a; if (a >= 0 && b >= 0 && a < nx && b < nz && free[q] && comp[q] < 0) { comp[q] = c; st.push(q); } } }
    c++; }
  return Object.assign(NAVG, { L, nx, nz, free, comp });
}
const navCell = (G, x, z) => clamp(Math.round(z + TD / 2), 0, G.nz - 1) * G.nx + clamp(Math.round(x + TW / 2), 0, G.nx - 1);
function navNear(G, x, z) {                                      // nearest free cell (spiral out a little)
  const c = navCell(G, x, z); if (G.free[c]) return c;
  const i0 = c % G.nx, j0 = c / G.nx | 0;
  for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < G.nx && j < G.nz && G.free[j * G.nx + i]) return j * G.nx + i; }
  return -1;
}
function navNearComp(G, x, z, c) {                              // nearest free cell of area c (to get as close as it can to an unreachable spot)
  const c0 = navCell(G, x, z), i0 = c0 % G.nx, j0 = c0 / G.nx | 0;
  for (let r = 0; r < 40; r++) { let best = -1, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = i0 + di, j = j0 + dj, q = j * G.nx + i;
      if (i >= 0 && j >= 0 && i < G.nx && j < G.nz && G.free[q] && G.comp[q] === c && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = q; } }
    if (best >= 0) return best; }
  return -1;
}
function navSegFree(G, a, b) { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .5);
  for (let k = 1; k < n; k++) { const t = k / n; if (!G.free[navCell(G, lerp(a.x, b.x, t), lerp(a.z, b.z, t))]) return false; } return true; }
function astar(G, from, to) {                                    // 8-neighbour A*, octile heuristic → string-pulled waypoints (last = `to`)
  const s = navNear(G, from.x, from.z); let e = navNear(G, to.x, to.z); if (s < 0 || e < 0) return null;
  if (G.comp[s] !== G.comp[e]) { e = navNearComp(G, to.x, to.z, G.comp[s]); if (e < 0) return null; to = new V3(e % G.nx - TW / 2, 0, (e / G.nx | 0) - TD / 2); }   // out of reach: as close as it gets
  const nx = G.nx, g = new Float32Array(G.free.length).fill(1e9), par = new Int32Array(G.free.length).fill(-1), done = new Uint8Array(G.free.length);
  const ei = e % nx, ej = e / nx | 0, h = k => { const dx = Math.abs(k % nx - ei), dz = Math.abs((k / nx | 0) - ej); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
  const heap = [[h(s), s]]; g[s] = 0;
  const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) { const [, k] = pop(); if (done[k]) continue; done[k] = 1; if (k === e) break;
    const i = k % nx, j = k / nx | 0;
    for (const [di, dj] of N8) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= G.nz) continue; const q = b * nx + a;
      if (!G.free[q] || done[q] || (di && dj && (!G.free[j * nx + a] || !G.free[b * nx + i]))) continue;
      const ng = g[k] + (di && dj ? 1.414 : 1); if (ng < g[q]) { g[q] = ng; par[q] = k; push([ng + h(q), q]); } } }
  if (par[e] < 0 && e !== s) return null;
  const cells = []; for (let k = e; k >= 0; k = par[k]) cells.push(k); cells.reverse();
  const P = cells.map(k => new V3(k % nx - TW / 2, 0, (k / nx | 0) - TD / 2)), out = []; let a = from;
  for (let i = 1; i < P.length; i++) if (i === P.length - 1 || !navSegFree(G, a, P[i + 1])) { out.push(P[i]); a = P[i]; }
  out.push(to.clone()); return out;
}
function cityRoute(pts, from, L, force) {                        // legs that hit a wall → A* around it (log legs are left to planRoute)
  const G = navGrid(L), out = []; let a = from;
  for (const b of pts) { if (!inChannel(a, L) && !inChannel(b, L) && (force || !navSegFree(G, a, b))) { const p = astar(G, a, b); if (p) { out.push(...p.slice(0, -1)); } }
    out.push(b); a = b; }
  return out;
}
const routeTo = (to, force) => cityRoute(planRoute(spider.pos, to, spider.span), spider.pos, spider.span, force);
function follow_route(dt, speed) {
  const sp = spider; if (!sp.route.length) return true;
  if (nav.backT > 0) { nav.backT -= dt * Math.min(TM, 3); accelerate(dt, nav.back.clone().multiplyScalar(speed * .5), sp.span * 5 * TM); sp.yawRate *= .9; return false; }   // backing off a wall
  const tgt = sp.route[0], last = sp.route.length === 1;
  const d = drive(dt, tgt, speed);
  // progress watchdog: no progress for ~1.3 s → back off from the wall, then re-route around it (A*); stuck again → skip / give up
  if (d < nav.best - .3) { nav.best = d; nav.stuckT = 0; } else nav.stuckT += dt * Math.min(TM, 3);
  if (d < (last ? Math.max(1, sp.span * .12) : Math.max(1.6, sp.span * .2))) { sp.route.shift(); nav.best = Infinity; nav.stuckT = 0; nav.stuckN = 0; }   // arrival radius grows with the body
  else if (nav.stuckT > 1.3) { unstick(); if (nav.stuckN > 3) { sp.route = []; return true; } }
  return !sp.route.length;
}
function unstick() {
  const sp = spider, L = sp.span; nav.stuckN = (nav.stuckN || 0) + 1; nav.stuckT = 0; nav.best = Infinity;
  let bn = null, bd = 1e9; for (const k of SOLIDS) { const n = solidNear(k, sp.pos.x, sp.pos.z); if (n.d < bd) { bd = n.d; bn = n; } }
  if (bn && bd < L * .9) nav.back.set(bn.nx, 0, bn.nz); else nav.back.set(-Math.sin(sp.yaw), 0, -Math.cos(sp.yaw));
  nav.backT = .7;
  const goal = sp.route[sp.route.length - 1];
  if (nav.stuckN === 2 && sp.route.length > 1) sp.route.shift();                 // a waypoint it cannot reach: drop it
  if (goal) { const r = routeTo(goal, true); if (r.length) sp.route = r; }
}
// a wander target: open ground (not wedged behind a tall wall), in the same connected area as the spider
function goodSpot(x, z, L) { const G = navGrid(L), c = navCell(G, x, z), me = navNear(G, spider.pos.x, spider.pos.z);
  if (!G.free[c] || (me >= 0 && G.comp[c] !== G.comp[me])) return false;
  for (const k of walls(L)) if (solidNear(k, x, z).d < L * .36) return false; return true; }
function wanderSpot() {
  const L = spider.span, D = navDims(L);
  for (let k = 0; k < 60; k++) {
    const x = rand(-TW / 2 + 4, TW / 2 - 4), z = rand(-TD / 2 + 4, TD / 2 - 4), q = logLocal(x, z);
    if (!clearSpot(x, z) || !reachable({ x, z }, L)) continue;
    if (Math.abs(q.al) < D.hl + 1 && q.sd < D.hw + 1) continue;          // beside or behind the log
    if (Math.hypot(x - spider.pos.x, z - spider.pos.z) < L) continue;
    if (!goodSpot(x, z, L)) continue;
    return new V3(x, 0, z);
  }
  return new V3(rand(-5, 5), 0, rand(0, 8));
}
function pickWander() {
  const hideP = S.phase === 'premolt' ? .8 : (isNight() ? .12 : .5) + (S.led ? .25 : 0);
  if (Math.random() < hideP) { goBurrow('toBurrow'); return; }
  spider.route = routeTo(wanderSpot());
  setMode('wander');
}
function goBurrow(mode) {                                       // too big for the log: just move off somewhere else
  if (spider.span > LOG_FIT) { spider.route = routeTo(wanderSpot()); setMode(mode === 'flee' ? 'flee' : 'wander'); return; }
  spider.route = routeTo(BURROW); setMode(mode); }
function sensePrey(p, senseR) { // slit sensilla feel substrate vibration; the legs also touch prey that sits very close
  const d = Math.hypot(p.pos.x - spider.pos.x, p.pos.z - spider.pos.z);
  return !p.eaten && !p.held && p.burrowed <= 0 && ((p.moving && d < senseR * p.vib) || d < spider.span * (p.kind === 'human' ? CHASE.touch : .55));   // legs reach into a gap after a person
}

/* the chase on a person (balance: see the round-4 notes in CLAUDE.md) */
const CHASE = { overHuman: 1.5, acc: 5, turn: 1.5, lungeTurn: .5, biteR: .28, tMin: 10, tMax: 13, hungerD: 33, hungerN: 22, touch: .7, creep: .15,
  search: 72, starveSense: 1.5, starveTop: 1.5, starveAcc: 1.4, starveT: 2, camp: 25, senseBase: 15, senseL: .6,
  pair: 1.4, meal: 16 };   // round 6: two people moving shake the ground more (sense range ×pair); a person is only a small meal for a giant (food value)
function tick(dt) {
  TM = fast ? 6 : 1;
  if (CTRL.who) { let ix = 0, iz = 0;   // WASD/arrows → world-fixed heading (camera-independent, keeps it simple with free orbit)
    if (KEYS.w || KEYS.arrowup) iz -= 1; if (KEYS.s || KEYS.arrowdown) iz += 1;
    if (KEYS.a || KEYS.arrowleft) ix -= 1; if (KEYS.d || KEYS.arrowright) ix += 1;
    const mag = Math.hypot(ix, iz); CTRL.x = mag ? ix / mag : 0; CTRL.z = mag ? iz / mag : 0; CTRL.sprint = !!KEYS.shift;
  } else CTRL.x = CTRL.z = 0;
  const hrs = dt * .5 * TM; S.hour += hrs;
  factT -= hrs; if (factT <= 0) { factT = rand(5, 9); log('รู้ไหม: ' + FACTS[factI++ % FACTS.length], true); }
  const night = isNight();
  if (night && S.wasNight === false) say('night', true);
  S.wasNight = night;
  sayCD -= dt; sayGap -= dt; if ((chatT -= dt) <= 0) { chatT = rand(20, 32); moodTalk(); }
  ROUND.tick(dt);
  // care on autopilot, once per crisis: very hungry → drop in one prey; very dry → one misting (re-arms after it recovers)
  if (!previewing && S.phase === 'normal' && S.hunger >= 85 && !S.autoFed && !prey.some(p => !p.eaten && p.kind !== 'human')) {
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

  const sp = spider, L = sp.span, speed = L * .6 * Math.pow(9 / Math.max(L, 9), .35) * sp.sp.speed * M * TM;   // kaiju sizes walk heavier (slower per body length)
  sp.modeT += dt;
  const w = sp.want; for (const k in w) w[k] = 0;
  const hungry = S.hunger > 30 && S.phase === 'normal';
  const senseR = L * 2.8 * (night ? 1.3 : 1);
  if (nav.restT > 0) nav.restT -= dt * TM;                        // worn out after a chase: no hunting for a while
  // a person: hunted once his steps are felt and the spider is a bit hungry (more at night); very hungry with nothing else
  // to eat → it goes out after his trail even without feeling him (updates every few seconds, not exact)
  const huntable = p => p.kind !== 'human' ? hungry : S.phase === 'normal' && nav.restT <= 0 && !p.boarded && S.hunger > (night ? CHASE.hungerN : CHASE.hungerD);
  const humanR = (CHASE.senseBase + L * CHASE.senseL) * (night ? 1.3 : 1) * (prey.filter(q => q.kind === 'human' && !q.eaten && q.v > .3).length > 1 ? CHASE.pair : 1);      // his steps: × his gait (walk .6, jog 1, sprint 1.5)
  const starving = S.hunger > CHASE.search && !prey.some(q => q.kind !== 'human' && !q.eaten);   // very hungry, nothing else to eat: every sense on him
  if (starving && !nav.starving && prey.some(q => q.kind === 'human' && !q.eaten)) log(`${S.name} หิวจัดและไม่มีอาหารอื่น เริ่มออกล่าคนในเมือง (ไวต่อแรงสั่นขึ้นมาก)`, true);
  nav.starving = starving;
  if (['wander', 'idle', 'toBurrow', 'hide'].includes(sp.mode)) {
    let p = null, pd = 1e9;                                          // of all it feels: the nearest (a person counts as farther: harder to catch; of two people, the one felt most: distance ÷ vibration)
    for (const q of prey) if (huntable(q) && sensePrey(q, q.kind === 'human' ? humanR * (starving ? CHASE.starveSense : 1) : senseR)) {
      const dq = Math.hypot(q.pos.x - sp.pos.x, q.pos.z - sp.pos.z) * (q.kind === 'human' ? 1.6 / Math.max(q.vib, .3) : 1); if (dq < pd) { pd = dq; p = q; } }
    if (p) { sp.prey = p; nav.mem.copy(p.pos); nav.lost = 0; nav.replanT = 0; sp.route = []; setMode('hunt');
      log(`${S.name} รู้สึกถึงแรงสั่นของ${PREY_TH[p.kind]} จึงย่องเข้าหา`, true); say('hunt', true); }
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
      const man = p.kind === 'human', d = Math.hypot(p.pos.x - sp.pos.x, p.pos.z - sp.pos.z), felt = sensePrey(p, (man ? humanR : senseR) * 1.3);
      if (felt) { nav.mem.copy(p.pos); nav.lost = 0; } else nav.lost += dt;
      if (man && nav.chaseT > 0 && (nav.chaseT += dt * TM) > nav.chaseMax) {   // a chase lasts 10–15 s at most: then the spider is spent
        setMode('idle'); nav.restT = rand(6, 10); log(`${S.name} ไล่จนหมดแรง ต้องหยุดพัก (แมงมุมวิ่งเร็วได้แค่ช่วงสั้น ๆ)`, true); break; }
      if (man ? felt && d < L * .5 + 1.5 : d < L * .9 && (felt || d < L * .6)) { sp.strikeN = (sp.strikeN || 0) + 1; setMode('strike'); break; }
      const dm0 = Math.hypot(nav.mem.x - sp.pos.x, nav.mem.z - sp.pos.z);
      if (man && (felt && d < L * 3 || nav.chaseT > 0 && dm0 > L * .6)) {   // the chase: faster than him flat out, but slow to speed up and to turn (lost contact: rush to where he went quiet)
        if (!nav.chaseT) { ROUND.chaseOn(p); nav.chaseT = 1e-3; if (starving) nav.chaseMax += CHASE.starveT; }
        let lead = felt ? p.pos.clone().addScaledVector(new V3(Math.sin(p.face), 0, Math.cos(p.face)), Math.min(d * .15, 3) * (p.v || 0) / HUM.sprint) : nav.mem.clone();
        if ((nav.cRT -= dt) <= 0) { nav.cRT = .4; const G = navGrid(L); nav.cR = navSegFree(G, sp.pos, lead) ? null : astar(G, sp.pos, lead); }   // a building in the way: run round it
        if (nav.cR) { while (nav.cR.length > 1 && Math.hypot(nav.cR[0].x - sp.pos.x, nav.cR[0].z - sp.pos.z) < L * .25) nav.cR.shift(); lead = nav.cR[0]; }
        drive(dt, lead, HUM.sprint * CHASE.overHuman * TM * (starving ? CHASE.starveTop : 1), { acc: CHASE.acc * TM * (starving ? CHASE.starveAcc : 1), turn: CHASE.turn, noSlow: true }); w.stalk = 0; break; }
      // prey wedged in a gap the spider can't fit into (log/rock crevice): no progress for a while → prey gets flushed out into the open
      if (d < nav.huntBest - .3) { nav.huntBest = d; nav.huntT = 0; } else if ((nav.huntT += dt) > 3 && d < L * 2.5) {
        nav.huntT = 0; nav.huntBest = Infinity; p.burrowed = 0; p.flushT = 2.5;
        p.yaw = p.face = Math.atan2(sp.pos.x - p.pos.x, sp.pos.z - p.pos.z) + rand(-.6, .6);
        if (p.kind === 'cricket' && p.jump) p.jump(p.speed * 1.4, 5); else { p.v = p.speed; p.t = rand(1.5, 2.5); }
      }
      if (nav.lost > (man && nav.starving ? CHASE.camp : 10) / M || sp.modeT > (man && nav.starving ? 70 : 45)) { setMode('idle'); if (man) nav.restT = rand(2, 5); log(man ? `${p.name}หลบนิ่ง แมงมุมจับแรงสั่นไม่ได้ จึงเลิกตามหา` : 'เหยื่ออยู่นิ่ง แมงมุมจับแรงสั่นไม่ได้ จึงเลิกล่า', true); break; }
      if ((nav.replanT -= dt) <= 0 || !sp.route.length) { const old = sp.route[0]; sp.route = routeTo(nav.mem); nav.replanT = .5;
        if (!old || old.distanceTo(sp.route[0]) > .5) { nav.best = Infinity; nav.stuckT = 0; } }
      const dm = Math.hypot(nav.mem.x - sp.pos.x, nav.mem.z - sp.pos.z);
      if (!felt && dm < L * .6) { if (man && dm > L * .15) drive(dt, nav.mem, speed * CHASE.creep); else { brake(dt); faceTo(dt, nav.mem.x, nav.mem.z); } }   // lost the trail at its last position: freeze and wait (a person: feel around the spot)
      else if (sp.route.length > 1) follow_route(dt, speed * .45);
      else drive(dt, nav.mem, speed * (felt ? .38 : .28));
      break;
    }
    case 'strike': {
      const p = sp.prey; w.fang = 1; w.stalk = .5;
      if (!p || p.eaten) { setMode('idle'); break; }
      const fwd = new V3(Math.sin(sp.yaw), 0, Math.cos(sp.yaw)), mouth = sp.pos.clone().addScaledVector(fwd, L * .2);
      const dm = Math.hypot(p.pos.x - mouth.x, p.pos.z - mouth.z);
      const man = p.kind === 'human', tk = man ? CHASE.lungeTurn : 1;  // a person: a narrower bite and a straighter lunge, so a side-step can beat it
      if (sp.modeT < .2) { w.rear = 1; brake(dt); faceTo(dt, p.pos.x, p.pos.z, tk); }       // rear up, then a short lunge (≈ half a leg span, not time-scaled)
      else { w.rear = .3; faceTo(dt, p.pos.x, p.pos.z, tk); sp.vel.copy(fwd).multiplyScalar(dm > L * .12 && sp.modeT < .45 ? L * 2.4 : 0); }
      if (sp.modeT > .2 && dm < (man ? L * CHASE.biteR + .9 : L * .3)) { setMode('eat'); sp.vel.set(0, 0, 0); p.held = true; p.v = 0; p.burrowed = 0; p.setOpacity(1); log(`${S.name} พุ่งกัดด้วยเขี้ยวแล้วปล่อยพิษ จับได้แล้ว`); say('catch', true);
        spawnRipple(p.pos, L * .3);                      // a dusty impact ring at the bite, on any prey
        if (p.kind === 'human') { BLOOD.splash(sp.worldOf(new V3(0, -L * .03, L * .2)), 50); humanSay(p, 'caught'); ROUND.grief(p); log(`${S.name} ขย้ำ${p.name}ด้วยเขี้ยว เลือดกระเซ็น!`); } }
      else if (sp.modeT > .55) { sp.vel.multiplyScalar(.2); setMode('hunt'); log('พลาด เหยื่อหลบได้'); say('miss', true); }
      break;
    }
    case 'eat': {
      const p = sp.prey; w.eat = 1; w.fang = 1; brake(dt);
      if (!p || p.eaten) { setMode('idle'); break; }
      const mouth = sp.worldOf(new V3(0, -L * .045, L * .17));
      p.pos.set(mouth.x, 0, mouth.z); p.v = 0; p.moving = false;
      p.mesh.position.copy(mouth); p.mesh.rotation.set(.5, sp.yaw + Math.PI / 2, 0);
      if (p.kind === 'human') { // blood drips from the fangs; after the struggle the spider wraps him in silk
        if ((p.dripT = (p.dripT || 0) - dt) <= 0) { p.dripT = rand(.12, .35); BLOOD.drip(sp.worldOf(new V3(rand(-.03, .03) * L, -L * .05, L * .19))); }
        const w = clamp((sp.modeT * TM - 2.5) / 4, 0, 1); if (w > 0 && !p.silk) { p.silk = BLOOD.cocoon(p); log(`${S.name} พันใยห่อ${p.name}เป็นรังไหม`); }
        if (p.silk) p.silk.scale.setScalar(.2 + .8 * w); }
      if (sp.modeT > 9 / TM) {
        leaveBolus(mouth, p.kind, p.k); if (p.kind === 'human') BLOOD.stain(mouth, 1.1);
        p.remove(); S.autoFed = false; S.hunger = clamp(S.hunger - p.value * 1.4, 0, 100); S.growth = clamp(S.growth + p.value * (12 / L), 0, 100);
        log('ย่อยนอกร่างกายเสร็จ เหลือแต่ซาก (น้ำย่อยละลายเนื้อเหยื่อก่อนดูดกิน)', true); say('eat', true); setMode('idle'); save();
      }
      break;
    }
    case 'threat': w.threat = 1; w.fang = 1; brake(dt); faceTo(dt, camera.position.x, camera.position.z); if (sp.modeT > 2.6) setMode('idle'); break;
    case 'flee': if (follow_route(dt, speed * 2.2) || sp.modeT > 12) setMode(L > LOG_FIT ? 'idle' : 'hide'); break;
    case 'molt': w.flip = 1; brake(dt); break;
  }
  if (S.phase !== 'normal' && (sp.mode === 'hunt' || sp.mode === 'strike')) setMode('idle');
  nav.prev.copy(sp.pos);
  sp.pos.addScaledVector(sp.vel, dt);
  sp.pos.x = clamp(sp.pos.x, -TW / 2 + L * .45, TW / 2 - L * .45); sp.pos.z = clamp(sp.pos.z, -TD / 2 + L * .45, TD / 2 - L * .45);
  // solid log walls: the spider only gets under the log through the open end (its route), never through the bark
  if (pushOutOfLog(sp.pos, L * .22, nav.prev, navDims(L).ch)) { sp.vel.multiplyScalar(.5); }
  obstaclesFor(L).forEach(o => { const dx = sp.pos.x - o.x, dz = sp.pos.z - o.z, d = Math.hypot(dx, dz) || 1, R = o.r - .3 + L * .18;
    if (d < R) { sp.pos.x = o.x + dx / d * R; sp.pos.z = o.z + dz / d * R; } });
  for (const k of walls(L)) { const n = solidNear(k, sp.pos.x, sp.pos.z), R = L * .3;
    if (n.d < R) { sp.pos.x += n.nx * (R - n.d); sp.pos.z += n.nz * (R - n.d); } }
  sp.update(dt);
  for (const l of sp.legs) { // a foot set down in the water hole sends out a ring
    if (l._sw && !l.swing && l.foot.y < WATER_Y + .15 && inPond(l.foot.x, l.foot.z)) spawnRipple(l.foot, L * .06, true);
    l._sw = l.swing; }
  prey.forEach(p => p.update(dt, sp));
  for (let i = prey.length - 1; i >= 0; i--) if (prey[i].eaten) prey.splice(i, 1);
  for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.userData.t += dt; const k = r.userData.t;
    const w = r.userData.wet, life = w ? 1.8 : 1.2; r.scale.setScalar(1 + k * (w ? 2.4 : 9) * r.userData.s); r.material.opacity = (w ? .3 : .45) * (1 - k / life); if (k > life) { scene.remove(r); r.material.dispose(); ripples.splice(i, 1); } }
  for (let i = boluses.length - 1; i >= 0; i--) { const b = boluses[i]; b.userData.t -= hrs; if (b.userData.t < 0) { scene.remove(b); boluses.splice(i, 1); } }
  for (let i = exuviae.length - 1; i >= 0; i--) { const e = exuviae[i], f = ((e.userData.age = (e.userData.age || 0) + dt * TM) - EXU_LIFE) / 10;  // old skins: 3 min, then fade + sink over 10 s
    if (f >= 1) { dropExuvia(e); exuviae.splice(i, 1); } else if (f > 0) { e.traverse(q => { if (q.isMesh) { q.material.opacity = .9 * (1 - f); q.castShadow = f < .5; } }); e.position.y = -f * (e.userData.sink || .3); } }
  if (humWarnT > 0) humWarnT -= hrs;
  if (humWarnT <= 0 && S.hum > 88) { log('ความชื้นสูงเกิน เสี่ยงเชื้อราในตู้ ควรหยุดพ่นน้ำสักพัก', true); humWarnT = 24; }
  if (humWarnT <= 0 && S.temp < 20) { log('อากาศเย็นไป แมงมุมเป็นสัตว์เลือดเย็น จึงเคลื่อนไหวช้าลง', true); humWarnT = 24; }
}
// the chewed, dried-out food bolus a tarantula drops after feeding
const boluses = [], bolusGeo = (() => { const g = new THREE.SphereGeometry(1, 12, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(1 + PERLIN.noise(v.x * 2.5, v.y * 2.5, v.z * 2.5) * .35); p.setXYZ(i, v.x, v.y * .6, v.z); }
  g.computeVertexNormals(); return g; })();
const bolusMat = track(new THREE.MeshStandardMaterial({ color: lin(0x2a1d12), roughness: .85 }), .3);
function leaveBolus(p, kind, k) {
  const m = new THREE.Mesh(bolusGeo, bolusMat), s = (kind === 'dubia' ? .42 : .32) * (k || 1); m.scale.setScalar(s);
  m.position.set(p.x, groundY(p.x, p.z) + s * .3, p.z); m.rotation.y = rand(0, 6.3); m.castShadow = true; m.userData.t = 36; scene.add(m); boluses.push(m);
}
let humWarnT = 0, factT = 3, factI = Math.floor(Math.random() * 21);
function finishMolt() {
  const ex = spider.exuvia(); ex.userData.age = 0; ex.userData.sink = spider.span * .05; scene.add(ex); exuviae.push(ex); if (exuviae.length > 2) dropExuvia(exuviae.shift());
  const old = spider.span; S.molts++; S.span = Math.min(spider.sp.maxSpan * KAIJU, +(old * 1.35).toFixed(1));
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
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new V2(1, 1) }, uNight: { value: 0 }, uCA: { value: 0 }, uGold: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uNight; uniform float uCA; uniform float uGold; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      // lens: chromatic aberration grows towards the frame edges (centre stays sharp), like a real macro lens
      vec2 cq = vUv - .5, co = cq * dot(cq, cq) * uCA;
      vec3 col = uCA > 0.0 ? vec3(texture2D(tDiffuse, vUv + co).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - co).b) : texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(.2126,.7152,.0722));
      col = mix(col, col * vec3(.9,.99,1.08), (1.0 - smoothstep(0.0,.18,l)) * (.38 + uNight * .4));   // cool shadows (bluer at night)
      col = mix(col, col * vec3(1.08,1.0,.9), smoothstep(.25,.9,l) * .34);                          // warm highlights
      col = mix(col, col * vec3(1.16,.94,.74), uGold * .4);                                          // golden hour (dawn/dusk sun): a stronger amber cast
      col = mix(vec3(l), col, 1.06 - uNight * .2);                                                   // gentle saturation, less at night
      col = LinearTosRGB(vec4(max(col, 0.0), 1.0)).rgb;
      col = col * col * (3.0 - 2.0 * col) * .12 + col * .88;                                         // soft S-curve
      vec2 q = vUv - .5; float v = smoothstep(.9, .28, length(q * vec2(uRes.x / uRes.y * .62, 1.0)));
      col *= mix(.5, 1.0, v);
      col += (hash(vUv * uRes + fract(uTime * 7.1) * 91.0) - .5) * .018;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};
const composer = new THREE.EffectComposer(renderer, new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType }));
composer.addPass(new THREE.RenderPass(scene, camera));
const bokeh = new THREE.BokehPass(scene, camera, { focus: 50, aperture: .0002, maxblur: .008, width: 2, height: 2 });
{ // depth for DOF: skip glass, dust and additive FX so they don't punch sharp holes in the blur
  // The depth target is only 2×2 texels (BokehPass r128 has no setSize, so it keeps the size given above): the blur per screen
  // quarter comes from 4 depth samples. Re-rendering the whole scene for 4 pixels every frame was ~1/3 of all triangles,
  // so the depth is refreshed every DOF_EVERY frames (same look; the 4 samples just lag a few frames). The blur itself runs every frame.
  const DOF_EVERY = 3, hid = [], vis = [], cc = new THREE.Color(); let n = 0;
  const hide = () => { hid.length = 0; hid.push(glassGroup, dust, beams, roomBokeh, water, water.userData.tint, ...ripples, ...drops, ...(typeof FX_HIDE !== 'undefined' ? FX_HIDE : [])); return hid; };
  bokeh.render = function (r, writeBuffer, readBuffer) {
    r.getClearColor(cc); const ca = r.getClearAlpha(), ac = r.autoClear; r.autoClear = false; r.setClearColor(0xffffff); r.setClearAlpha(1);
    if (n++ % DOF_EVERY === 0) {
      const h = hide(); vis.length = 0; h.forEach(o => { vis.push(o.visible); o.visible = false; });
      this.scene.overrideMaterial = this.materialDepth; r.setRenderTarget(this.renderTargetDepth); r.clear(); r.render(this.scene, this.camera); this.scene.overrideMaterial = null;
      h.forEach((o, i) => o.visible = vis[i]); }
    this.uniforms.tColor.value = readBuffer.texture; this.uniforms.nearClip.value = this.camera.near; this.uniforms.farClip.value = this.camera.far;
    if (this.renderToScreen) r.setRenderTarget(null); else { r.setRenderTarget(writeBuffer); r.clear(); }
    this.fsQuad.render(r);
    r.setClearColor(cc); r.setClearAlpha(ca); r.autoClear = ac; };
}
composer.addPass(bokeh);
const bloom = new THREE.UnrealBloomPass(new V2(2, 2), .38, .5, .86); composer.addPass(bloom);
const grade = new THREE.ShaderPass(GradeShader); composer.addPass(grade);
const fxaa = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaa);
renderer.shadowMap.autoUpdate = false;              // shadows once per frame, not again for the DOF depth pass
const SHADOW_LIGHTS = [led, sun, lamp];
function setShadowRes(n) { [[led, n], [lamp, n / 2]].forEach(([l, s]) => { if (l.shadow.mapSize.x !== s) { l.shadow.mapSize.set(s, s); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } }); }
// render resolution: the quality's pixel ratio × DRS.k (dynamic resolution, see autoQuality), never below the quality's floor
const DRS = { k: 1, t: 0, n: 0, warm: 0, slow: 0, good: 0, cap: 1, capT: 0, upT: 99, user: false };
const prBase = q => { const d = devicePixelRatio || 1; return q === 'high' ? Math.min(d, 2) : q === 'min' ? Math.min(d, 1) * .75 : Math.min(d, 1.25); };
const prFloor = q => q === 'high' ? ((devicePixelRatio || 1) >= 1.5 ? 1 : .8) : q === 'min' ? .6 : .7;
const drsMin = () => Math.min(1, prFloor(quality) / prBase(quality));
function applyRes() {
  const w = innerWidth, h = innerHeight, pr = Math.max(prBase(quality) * DRS.k, Math.min(prBase(quality), prFloor(quality)));
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); composer.setPixelRatio(pr); composer.setSize(w, h);
  fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr)); grade.uniforms.uRes.value.set(w * pr, h * pr);
}
function resize() {
  const hi = quality === 'high', lo = quality === 'min', w = innerWidth, h = innerHeight;
  applyRes();
  camera.aspect = w / h;
  camera.fov = clamp(2 * Math.atan(Math.tan(26 * Math.PI / 180) / camera.aspect) * 180 / Math.PI, 36, 64); if (cine) camera.fov = Math.max(camera.fov, 50);   // portrait phones: widen so the tank still fits
  if (eyes) camera.fov = Math.max(camera.fov, 66);   // his eyes: a wide human field of view
  camera.updateProjectionMatrix();
  bokeh.uniforms.aspect.value = camera.aspect;       // BokehPass only reads the aspect once, at construction
  bokeh.enabled = hi; bloom.enabled = hi; grade.uniforms.uCA.value = hi ? .007 : lo ? 0 : .004;   // lens fringe: off on the lowest mode
  setShadowRes(hi ? 2048 : 1024);
  led.castShadow = lamp.castShadow = !lo;           // lowest mode: no shadows at all
  setMeadowDensity(hi ? 1 : lo ? .35 : .6);
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
const PREY_TH = { cricket: 'จิ้งหรีด', dubia: 'ดูเบีย', human: 'คน' }, HUMAN_SPAN = 12;
function feed(kind, auto) {
  if (kind === 'human') {   // both people (2 s apart); pressed again while they are out = the camera goes to each in turn
    if (S.span < HUMAN_SPAN) { log(`แมงมุมยังตัวเล็ก (ขา ${S.span} ซม.) ต้องโตถึง ${HUMAN_SPAN} ซม. ก่อน คนถึงจะกลัว`); return; }
    const hs = humansOut();
    if (ROUND.on || ROUND.breakT >= 0) { if (hs.length) { focusI = (focusI + 1) % hs.length; focusOn(hs[focusI]); } else log(ROUND.on ? 'คนกำลังจะเข้ามาในเมือง รอสักครู่' : 'พักระหว่างรอบ รอบใหม่จะเริ่มเร็ว ๆ นี้'); return; }
    ROUND.begin(); return; }
  else if (prey.filter(p => !p.eaten && p.kind !== 'human').length >= 4) { log('ในตู้มีเหยื่อเยอะแล้ว เหยื่อที่เหลือค้างอาจทำร้ายแมงมุมได้'); return; }
  const np = new Prey(kind); prey.push(np);
  if (auto) log(`🤖 ให้อาหารอัตโนมัติ: ${S.name} หิวจัด จึงปล่อย${kind === 'cricket' ? 'จิ้งหรีด' : 'แมลงสาบดูเบีย'} 1 ตัว`);
  else if (S.phase === 'premolt') log('แมงมุมที่ใกล้ลอกคราบจะไม่กิน ควรเอาเหยื่อออก', true);
  else if (S.phase === 'soft') log('เขี้ยวยังนิ่มหลังลอกคราบ ยังไม่ควรให้อาหาร', true);
  else log(kind === 'cricket' ? 'ปล่อยจิ้งหรีด 1 ตัว (กระโดดเก่ง สร้างแรงสั่นมาก)' : 'ปล่อยแมลงสาบดูเบีย 1 ตัว (โปรตีนสูง ชอบมุดดิน)');
}
// camera glides to a person for a few seconds when he walks in (or when you press the button while he is already out)
let focusP = null, focusT = 0, focusI = 0; const _wv = new V3(); const focusOn = p => { if (!watchWho && !view && !cine && !eyes && !tankView && !saverOn) { focusP = p; focusT = 3.5; } };
$('tCricket').onclick = () => feed('cricket');
$('tDubia').onclick = () => feed('dubia');
$('tHuman').onclick = () => feed('human');
$('tAutoRound').onclick = e => { S.autoRound = !S.autoRound; e.currentTarget.classList.toggle('on', S.autoRound);
  log(S.autoRound ? '🔁 เล่นต่ออัตโนมัติ: เปิด (ถูกกินแล้วกลับมาใหม่ใน 10 วินาที, จบรอบแล้วเริ่มรอบใหม่เอง)' : '⏹ เล่นต่ออัตโนมัติ: ปิด (เล่นรอบเดียว ไม่เกิดใหม่)');
  if (!S.autoRound) { ROUND.pend = ROUND.pend.filter(w => !w.again); if (ROUND.breakT >= 0) ROUND.breakT = -1; } };
// short notice in the middle of the screen (respawn, stars)
let noticeT = 0; function notice(t) { const n = $('notice'); n.textContent = t; n.classList.add('on'); clearTimeout(noticeT); noticeT = setTimeout(() => n.classList.remove('on'), 3500); }
function mist(auto) { if (!auto) S.autoMist = false; S.hum = clamp(S.hum + 14, 0, 98); mistFx();
  if (auto) log(`🤖 พ่นน้ำอัตโนมัติ: ความชื้นต่ำมาก จึงพ่นละอองน้ำให้ 1 ครั้ง`); else { log('พ่นละอองน้ำ ความชื้นเพิ่มขึ้น'); say('misted', true); } }
$('tMist').onclick = () => mist(false);
$('tLed').onclick = e => { S.led = !S.led; e.currentTarget.classList.toggle('on', S.led); log(S.led ? 'เปิดไฟตู้' : 'ปิดไฟตู้');
  if (S.led) { say('bright', true); log('ทารันทูลาไม่ชอบแสงจ้า ถ้าเปิดไฟตู้นานๆ มันจะหลบในโพรงบ่อยขึ้น', true); if (spider.mode === 'wander' && Math.random() < .5) goBurrow('toBurrow'); } };
$('tLamp').onclick = e => { S.lamp = !S.lamp; e.currentTarget.classList.toggle('on', S.lamp); log(S.lamp ? 'เปิดไฟอุ่น' : 'ปิดไฟอุ่น'); };
$('tVib').onclick = e => { vibOn = !vibOn; e.currentTarget.classList.toggle('on', vibOn); };
$('tFollow').onclick = e => { follow = !follow; e.currentTarget.classList.toggle('on', follow); if (follow && watchWho) setWatch(null); };
// camera follows one person (by who, so it picks him up again after a respawn): off → ชัยภัทร → ตุ้ย → off
let watchWho = null, eyesWho = null;
function setWatch(w) { watchWho = w; focusT = 0;
  if (w) { if (follow) $('tFollow').click(); if (cine) setCine(false); if (eyes) setEyes(false); if (tankView) setTank(false); if (view === 'top') setView(null); } }
// ส่องคน: ตามหลัง (3rd) หรือสายตาเขา (1st) รวมเป็นปุ่มเดียว วน: ปิด → ชัยภัทร(ตามหลัง) → ชัยภัทร(สายตา) → ตุ้ย(ตามหลัง) → ตุ้ย(สายตา) → ปิด
const PCAM_ORDER = [null, 'chai3', 'chai1', 'tui3', 'tui1'];
const currentPCam = () => eyesWho && !CTRL.who ? eyesWho + '1' : !CTRL.who && watchWho ? watchWho + '3' : null;
function applyPCam(sel) {
  if (!sel) { setWatch(null); eyesWho = null; if (eyes) setEyes(false); return; }
  const who = sel.slice(0, -1), first = sel.endsWith('1');
  if (first) { eyesWho = who; setEyes(true); } else { eyesWho = null; if (eyes) setEyes(false); setWatch(who); }
}
$('tPerson').onclick = () => {
  if (!humansOut().length && !ROUND.on) { log('ยังไม่มีคนในเมือง ปล่อยคนก่อน แล้วค่อยส่องตามดู'); return; }
  const i = PCAM_ORDER.indexOf(currentPCam()); applyPCam(PCAM_ORDER[(i + 1) % PCAM_ORDER.length]);
};
// keyboard WASD/arrow state, read into CTRL.x/z/sprint each tick() while a person is under player control
const KEYS = {};
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); KEYS[k] = true;
  if (CTRL.who && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault(); });
addEventListener('keyup', e => { if (e.target.tagName === 'INPUT') return; KEYS[e.key.toLowerCase()] = false; });
// บังคับคนเดินเอง (WASD/ลูกศร, Shift = วิ่ง): off → ชัยภัทร → ตุ้ย → off; AI ปล่อยมือคนนั้นทันที
// กล้องสลับเป็นมุมมองสายตาคนนั้นไปด้วย (ล็อกอัตโนมัติ) เดินไปทางไหนก็เห็นตรงหน้า ไม่ต้องคอยหมุนกล้องเอง
function setControl(w) { CTRL.who = w; if (!w) { CTRL.x = CTRL.z = 0; if (eyes) setEyes(false); return; } setEyes(true); }
$('tControl').onclick = () => { const i = [null, ...PEOPLE_ORDER].indexOf(CTRL.who), w = [null, ...PEOPLE_ORDER][(i + 1) % 3];
  if (w && !humansOut().some(p => p.who === w)) { log(humansOut().length ? `${PEOPLE[w].name}ยังไม่อยู่ในเมืองตอนนี้ รอสักครู่` : 'ยังไม่มีคนในเมือง ปล่อยคนก่อน แล้วค่อยบังคับ'); return; }
  setControl(w); log(w ? `🎮 บังคับ${PEOPLE[w].name}เอง: กล้องมองผ่านสายตาเขา ใช้ WASD/ลูกศรเดิน, Shift วิ่ง (สตามินาลด) — หนีแมงมุมเองได้เลย` : '🎮 บังคับคน: ปิด (คืนให้ AI คุมเหมือนเดิม, กล้องกลับเป็นอิสระ)'); };
$('tEatHum').onclick = () => tryEat(CTRL.who && humansOut().find(p => p.who === CTRL.who));
$('tDrinkHum').onclick = () => tryDrink(CTRL.who && humansOut().find(p => p.who === CTRL.who));
$('tFast').onclick = e => { fast = !fast; e.currentTarget.classList.toggle('on', fast); };
{ const d = document, el = d.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen, fsEl = () => d.fullscreenElement || d.webkitFullscreenElement;
  if (!req) $('tFull').hidden = true;
  $('tFull').onclick = () => fsEl() ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : req.call(el);
  const fsSync = () => { $('tFull').textContent = fsEl() ? '⛶ ออกเต็มจอ' : '⛶ เต็มจอ'; };
  d.addEventListener('fullscreenchange', fsSync); d.addEventListener('webkitfullscreenchange', fsSync);
  const ui = on => d.body.classList.toggle('noui', !on);
  $('tHide').onclick = () => ui(false); $('uiBack').onclick = () => ui(true);
  // screensaver: fullscreen, no UI, slow cinematic orbit around the spider; any tap/key exits
  const saver = (on, full) => { saverOn = on; if (on && cine) setCine(false); if (on && eyes) setEyes(false); d.body.classList.toggle('saver', on); ui(!on); follow = on || $('tFollow').classList.contains('on');
    if (on) { saverT = 0; if (full && !fsEl() && req) req.call(el); } else if (fsEl()) (d.exitFullscreen || d.webkitExitFullscreen).call(d); };
  $('tSaver').onclick = e => { e.stopPropagation(); saver(true, true); };
  $('tSaverWin').onclick = e => { e.stopPropagation(); saverAt = performance.now(); saver(true, false); };
  const quit = e => { if (saverOn && performance.now() - saverAt > 800) { e.stopPropagation(); e.preventDefault(); saver(false); } };
  let saverAt = 0; $('tSaver').addEventListener('click', () => saverAt = performance.now());
  addEventListener('pointerdown', quit, true); addEventListener('keydown', quit, true);
  const fsOff = () => { if (saverOn && !fsEl() && performance.now() - saverAt > 1500) saver(false); };
  d.addEventListener('fullscreenchange', fsOff); d.addEventListener('webkitfullscreenchange', fsOff);
  addEventListener('keydown', e => { if ((e.key === 'h' || e.key === 'H') && e.target.tagName !== 'INPUT') ui(d.body.classList.contains('noui')); }); }
/* ---------- UI: แผงตั้งค่า, สมุดบันทึกแบบพับ, จางเองเมื่อไม่ได้แตะ ---------- */
{ const d = document, B = d.body;
  const panel = (cls, on) => { B.classList.toggle('setOpen', cls === 'setOpen' && on); B.classList.toggle('logOpen', cls === 'logOpen' && on); B.classList.toggle('helpOpen', cls === 'helpOpen' && on);   // เปิดได้ทีละแผง
    $('tSettings').classList.toggle('on', B.classList.contains('setOpen')); $('tLogBtn').classList.toggle('on', B.classList.contains('logOpen')); $('tHelp').classList.toggle('on', B.classList.contains('helpOpen'));
    if (B.classList.contains('logOpen')) { logUnread = 0; $('logBadge').hidden = true; } };
  $('tSettings').onclick = () => panel('setOpen', !B.classList.contains('setOpen'));
  $('tLogBtn').onclick = () => panel('logOpen', !B.classList.contains('logOpen'));
  $('tHelp').onclick = () => panel('helpOpen', !B.classList.contains('helpOpen'));
  canvas.addEventListener('pointerdown', () => panel('', false));           // แตะฉาก = ปิดแผง
  addEventListener('keydown', e => { if (e.key === 'Escape') panel('', false); });
  // ไม่ขยับเมาส์/นิ้ว 5 วินาที → UI จางลง (ไม่จางตอนเปิดแผงอยู่)
  let idleT = 0; const wake = () => { B.classList.remove('idle'); clearTimeout(idleT);
    idleT = setTimeout(() => { if (!B.classList.contains('setOpen') && !B.classList.contains('logOpen')) B.classList.add('idle'); else wake(); }, 5000); };
  ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(ev => addEventListener(ev, wake, { passive: true, capture: true })); wake(); }
// locked front view: the screen acts as the terrarium's front glass
const CAM0 = { pol: controls.maxPolarAngle };
function setCine(on) { cine = on; if (on && view) setView(null); if (on && watchWho) setWatch(null); if (on && eyes) setEyes(false); controls.maxPolarAngle = on ? Math.PI * .6 : CAM0.pol; resize(); }
function setTank(on) { tankView = on; if (on) { if (cine) setCine(false); if (view) setView(null); if (eyes) setEyes(false); if (follow) $('tFollow').click(); } controls.enabled = !tankView; }
// first person: look through a person's eyes (the one the camera last went to) (watch only: the orbit controls are off, the game drives him)
const eyesOf = () => { if (CTRL.who) { const p = humansOut().find(q => q.who === CTRL.who); if (p) return p; }   // controlling someone: always his eyes, even after a respawn
  if (eyesWho) { const p = humansOut().find(q => q.who === eyesWho); if (p) return p; }
  const h = humansOut(); return h.includes(focusP) ? focusP : h[0]; }, eyeP = new V3(), eyeL = new V3(), eyeF = new V3();
function setEyes(on) { eyes = on;
  if (on) { if (cine) setCine(false); if (view) setView(null); if (tankView) setTank(false); if (follow) $('tFollow').click(); eyeL.set(0, -1e9, 0); }
  else controls.target.copy(spider ? spider.root.position : controls.target);
  controls.enabled = !on && !tankView; resize(); }
// locked camera angles: front / right / back / left (tilted down 25°) or straight down; zoom still works
const VIEWS = { front: [0, 'หน้า'], right: [Math.PI / 2, 'ขวา'], back: [Math.PI, 'หลัง'], left: [-Math.PI / 2, 'ซ้าย'], top: [0, 'บน'], glass: [0, 'ติดกระจก'] }, VIEW_ORDER = [null, 'front', 'right', 'back', 'left', 'top', 'glass'];
const viewDir = new V3();
function setView(v) { view = v; viewT = v ? .6 : 0;
  if (v) { if (cine) setCine(false); if (eyes) setEyes(false); if (tankView) setTank(false); focusT = 0; }
  controls.enableRotate = !v; controls.enabled = !eyes && !tankView; }
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || saverOn) return; const i = '0123456'.indexOf(e.key); if (i >= 0) setView(VIEW_ORDER[i]); });
// มุมกล้อง: รวมมุมล็อก (หน้า/ขวา/หลัง/ซ้าย/บน/ติดกระจก) + มุมหนัง + ตู้จริง ไว้ปุ่มเดียว วนตามลำดับนี้
const CAM_ORDER = [null, 'front', 'right', 'back', 'left', 'top', 'glass', 'cine', 'tank'];
const CAM_LABEL = { front: 'หน้า', right: 'ขวา', back: 'หลัง', left: 'ซ้าย', top: 'บน', glass: 'ติดกระจก', cine: 'มุมหนัง', tank: 'ตู้จริง' };
const currentCam = () => cine ? 'cine' : tankView ? 'tank' : view;
function applyCam(m) { if (m === 'cine') return setCine(true); if (m === 'tank') return setTank(true); if (cine) setCine(false); if (tankView) setTank(false); setView(m); }
$('tCam').onclick = () => applyCam(CAM_ORDER[(CAM_ORDER.indexOf(currentCam()) + 1) % CAM_ORDER.length]);
function viewCam(dt) {
  const top = view === 'top', flat = view === 'glass', t = Math.tan(camera.fov * Math.PI / 360), a = VIEWS[view][0], el = top ? Math.PI / 2 - .01 : flat ? 0 : 25 * Math.PI / 180;
  const side = top ? 0 : Math.abs(Math.sin(a)), wide = TW * (1 - side) + TD * side, deep = TD * (1 - side) + TW * side;   // tank size seen from that side
  // glass: no tilt, no margin — fill the whole screen with the front glass (background-size:cover, not contain) so the display edge = the tank edge
  const R = top ? Math.max(TW / 2 / (t * camera.aspect), TD / 2 / t) * 1.08 + TH
    : flat ? Math.min(wide / 2 / (t * camera.aspect), TH / 2 / t) + deep / 2
    : Math.max(wide / 2 / (t * camera.aspect), TH * .75 / t) * .94 + deep / 2;
  if (top || !follow || !spider) controls.target.lerp(camPrev.set(0, top ? 0 : flat ? TH / 2 : TH * .3, 0), clamp(dt * 4, 0, 1));
  viewDir.set(Math.sin(a) * Math.cos(el), Math.sin(el), Math.cos(a) * Math.cos(el));
  const off = camPrev.copy(camera.position).sub(controls.target); let r = off.length() || R; off.divideScalar(r);
  if (viewT > 0) { const k = clamp(dt / viewT, 0, 1); viewT -= dt; off.lerp(viewDir, k).normalize(); r = lerp(r, Math.min(R, controls.maxDistance), k); } else off.copy(viewDir);
  camera.position.copy(controls.target).addScaledVector(off, r); }
const QUAL_TXT = { high: '✨ ภาพ: สูง', low: '⚡ ภาพ: เร็ว', min: '🐢 ภาพ: ต่ำสุด' };
function setQuality(q) { quality = q; $('tQual').textContent = QUAL_TXT[q]; DRS.k = 1; DRS.cap = 1; DRS.slow = DRS.good = 0; DRS.warm = 0; resize(); }
$('tQual').onclick = () => { DRS.user = true; setQuality({ high: 'low', low: 'min', min: 'high' }[quality]); };   // a manual choice: no more automatic mode drops (resolution scaling stays)
const drops = [], dropGeo = new THREE.SphereGeometry(.07, 6, 4), dropMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: .45, depthWrite: false });
function mistFx() {
  haze = 1;
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
  bar('bHunger', S.hunger, S.hunger >= 85 ? 'bad crit' : S.hunger > 75 ? 'bad' : S.hunger < 40 ? 'ok' : ''); $('vHunger').textContent = Math.round(S.hunger) + '%';
  bar('bTemp', (S.temp - 15) / 20 * 100, S.temp >= 24 && S.temp <= 28 ? 'ok' : 'bad'); $('vTemp').textContent = S.temp.toFixed(1) + '°C';
  bar('bHum', S.hum, S.hum < 55 ? 'bad crit' : S.hum >= 65 && S.hum <= 85 ? 'ok' : 'bad'); $('vHum').textContent = Math.round(S.hum) + '%';
  bar('bGrow', S.growth, S.growth >= 100 ? 'bad' : ''); $('vGrow').textContent = Math.round(S.growth) + '%';
  { const b = $('tHuman'), ok = S.span >= HUMAN_SPAN; b.disabled = !ok; b.title = ok ? 'ปล่อยชัยภัทรกับตุ้ยเข้ามาในเมือง (กดซ้ำ = กล้องไปหาทีละคน)' : `แมงมุมต้องขาใหญ่ถึง ${HUMAN_SPAN} ซม. ก่อน`; $('hHuman').textContent = ok ? '' : `ต้องโตถึง ${HUMAN_SPAN} ซม. (ตอนนี้ ${S.span})`; }
  $('vSpan').textContent = S.span + ' ซม.'; $('vMolt').textContent = 'ลอก ' + S.molts + ' ครั้ง';
  const h = Math.floor(S.hour % 24); $('vTime').textContent = `วัน ${Math.floor(S.hour / 24) + 1} · ${String(h).padStart(2, '0')}:00`; $('vDay').textContent = isNight() ? '🌙 กลางคืน' : '☀️ กลางวัน';
  { const cm = currentCam(), b = $('tCam'); b.textContent = '🧭 มุมกล้อง: ' + (cm ? CAM_LABEL[cm] : 'อิสระ'); b.classList.toggle('on', !!cm); }
  { const pc = currentPCam(), b = $('tPerson');
    b.textContent = '👁 ส่องคน: ' + (pc ? `${PEOPLE[pc.slice(0, -1)].name} (${pc.endsWith('1') ? 'สายตา' : 'ตามหลัง'})` : 'ปิด'); b.classList.toggle('on', !!pc); }
  { const cb = $('tControl'); cb.textContent = '🎮 บังคับคน: ' + (CTRL.who ? PEOPLE[CTRL.who].name : 'ปิด'); cb.classList.toggle('on', !!CTRL.who);
    const p = CTRL.who && humansOut().find(q => q.who === CTRL.who), hh = $('humanHud'); hh.hidden = !p;
    if (p) { const A = p.ai, stMax = .6 + .4 * clamp(Math.min(A.H, A.W) * 2.5, 0, 1);
      $('hcName').textContent = PEOPLE[CTRL.who].name + ' (บังคับเอง)';
      bar('bHumFood', A.H * 100, A.H < .3 ? 'bad crit' : A.H < .5 ? 'bad' : 'ok'); $('vHumFood').textContent = Math.round(A.H * 100) + '%';
      bar('bHumWater', A.W * 100, A.W < .3 ? 'bad crit' : A.W < .5 ? 'bad' : 'ok'); $('vHumWater').textContent = Math.round(A.W * 100) + '%';
      bar('bHumStam', A.stam / stMax * 100, A.stam / stMax < .25 ? 'bad' : ''); $('vHumStam').textContent = Math.round(A.stam / stMax * 100) + '%';
      $('tEatHum').disabled = !nearStore(p); $('tDrinkHum').disabled = !nearPond(p); } }
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
  S = state; if (S.led === undefined) S.led = true; if (S.autoRound === undefined) S.autoRound = true; S.rounds = S.rounds || 0; S.best = S.best || 0;   // old saves: new round-6 fields
  $('tAutoRound').classList.toggle('on', S.autoRound);
  $('start').hidden = true; ['hud', 'log', 'help', 'tools'].forEach(id => $(id).hidden = false);
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
S = newState('', 'lividus'); spider = new Spider('lividus', 5); pickWander();
resize();
const clock = new THREE.Clock(); let hudT = 0, saveT = 0;
// background & fog are shaded in linear space, so convert the sRGB picks (otherwise the room turns milky grey)
const BG_DAY = new THREE.Color(0), BG_NIGHT = new THREE.Color(0), camPrev = new V3(), _sayP = new V3();
let FOG0 = 0;
// light shafts falling into the gaps beside the buildings (film shot only): the same beam sheets as under the LED bar
const cityBeamMat = beamMat(0xfff0d6);
{ const g = new THREE.PlaneGeometry(4, TH * 1.1); g.translate(0, TH * .55, 0);
  SOLIDS.slice(0, 7).forEach((k, i) => { const m = new THREE.Mesh(g, cityBeamMat), side = i % 2 ? 1 : -1, d = k.hw + 2.2;
    m.position.set(k.x + k.c * d * side, groundY(k.x, k.z) - 1, k.z - k.s * d * side); m.rotation.set(-.32, rand(-.4, .4), .18); beams.add(m); }); }
// auto quality (every frame, from the real frame time): keep ~60 fps smoothly.
// 1) dynamic resolution: each 1 s window below ~50 fps lowers the render scale 15% (down to the mode's floor); 3 good windows (≥ 57 fps)
//    raise it again, but not back to a scale that just failed (remembered 30 s) so it doesn't pump up and down.
// 2) still slow at the floor for 3 s → next lighter mode (high → fast; fast → lowest only when very slow). Never automatic after a manual pick.
function autoQuality(raw) {
  if (document.hidden || raw > .25) return;            // tab switches / hitches are not the device's steady speed
  if (DRS.warm < 90) { DRS.warm++; return; }            // skip warm-up frames (shader compile)
  DRS.t += raw; DRS.n++; DRS.capT = Math.max(0, DRS.capT - raw); DRS.upT += raw; if (DRS.capT <= 0) DRS.cap = 1;
  if (DRS.t < 1) return;
  const ft = DRS.t / DRS.n, kMin = drsMin(); DRS.t = DRS.n = 0;
  if (ft > 1 / 50) {
    DRS.good = 0;
    if (DRS.k > kMin + 1e-3) { if (DRS.upT < 4) { DRS.cap = DRS.k; DRS.capT = 30; } DRS.k = Math.max(kMin, DRS.k * .85); applyRes(); return; }
    if (++DRS.slow >= 3 && !DRS.user) {
      if (quality === 'high' && ft > 1 / 42) { setQuality('low'); log('เครื่องนี้ภาพกระตุก เลยสลับเป็นโหมด ⚡ ภาพเร็ว ให้อัตโนมัติ (กดปุ่มเพื่อกลับเป็นภาพสูงได้)', true); }
      else if (quality === 'low' && ft > 1 / 26) { setQuality('min'); log('เครื่องนี้ยังกระตุกอยู่ เลยลดเป็นโหมด 🐢 ภาพต่ำสุด ให้อัตโนมัติ (กดปุ่มเพื่อเปลี่ยนกลับได้)', true); }
      DRS.slow = 0; }
    return; }
  DRS.slow = 0;
  if (ft < 1 / 57 && ++DRS.good >= 3 && DRS.k < 1) { const up = Math.min(1, DRS.k / .85); DRS.good = 0; if (up < DRS.cap - 1e-3 || DRS.cap >= 1 && up >= 1) { DRS.k = up; DRS.upT = 0; applyRes(); } }
}
function loop() {
  const raw = clock.getDelta(), dt = Math.min(raw, .05), now = clock.elapsedTime;
  autoQuality(raw);
  HAIR_U.uTime.value = now; grade.uniforms.uTime.value = now;
  tick(dt);
  // foliage is shoved by the spider's body and legs and by prey, then springs back
  const cols = spider && spider.legs[0].J ? spider.colliders([]) : [];
  prey.forEach(p => { if (!p.eaten && p.burrowed < .5) cols.push(p.mesh.position.x, p.mesh.position.y + .3 * p.k, p.mesh.position.z, (p.kind === 'cricket' ? .5 : .85) * p.k); });
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
  { // sun: rises on the left (east) at 6:00, overhead at noon, sets on the right at 18:00; low sun is warm and dim
    const h = S.hour % 24, a = clamp((h - 6) / 12, 0, 1) * Math.PI, up = Math.sin(a);
    sun.position.set(-Math.cos(a) * 150, 15 + up * 140, 85);
    sun.intensity = day * (.4 + 1.4 * up); sun.color.setRGB(1, .72 + .26 * up, .5 + .42 * up);
    grade.uniforms.uGold.value = day * (1 - up) * (1 - up); }
  scene.background.copy(BG_NIGHT).lerp(BG_DAY, day); scene.fog.color.copy(scene.background);
  if (typeof CITY !== 'undefined') CITY.update(dt, 1 - day);   // window glow + neon flicker
  if (typeof FX_UPDATE === 'function') { const h = spider && spider.prey;                        // helicopter (searchlight follows a chase) + fire
    FX_UPDATE(dt, 1 - day, h && h.kind === 'human' && !h.eaten && ['hunt', 'strike', 'eat'].includes(spider.mode) ? h.pos : null); }
  grade.uniforms.uNight.value = (1 - day) * (1 - .7 * ledK);
  ledBar.userData.strip.material.color.setRGB(3, 3.05, 3.2).multiplyScalar(ledK + .02);
  bulb.material.color.setRGB(4, 1.9, .7).multiplyScalar(lampK + .01);
  const env = (.07 + .38 * day) * (.5 + .5 * ledK) + .06 * lampK;
  if (Math.abs(env - envLevel) > .005) { envLevel = env; applyEnv(env); }
  water.material.normalMap.offset.set(now * .01, now * .007);
  const da = dust.geometry.attributes.position;
  for (let i = 0; i < dustN; i++) { da.array[i * 3 + 1] += Math.sin(now * .3 + i) * dt * .15; da.array[i * 3] += Math.cos(now * .21 + i * 1.3) * dt * .12; }
  da.needsUpdate = true; dust.material.opacity = .03 + ledK * .3 + lampK * .12;
  // god rays: stronger in humid air, right after misting, and at night
  haze = Math.max(0, haze - dt / 40); BEAM_U.uTime.value = now; beams.visible = quality !== 'min';
  const air = (.3 + .7 * S.hum / 100) * (.35 + .65 * haze) * (1 - .55 * day);
  ledBeamMat.uniforms.uI.value = ledK * air * .09; lampBeamMat.uniforms.uI.value = lampK * air * .07;
  cityBeamMat.uniforms.uI.value = lerp(cityBeamMat.uniforms.uI.value, cine ? day * .16 + ledK * .05 : 0, clamp(dt * 2, 0, 1));
  for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; d.position.y -= d.userData.v * dt; if (d.position.y < groundY(d.position.x, d.position.z)) { scene.remove(d); drops.splice(i, 1); } }
  if (focusT > 0 && focusP && !focusP.eaten && !cine && !eyes && !tankView && !saverOn) { focusT -= dt; const k = clamp(dt * 2.2, 0, 1);
    camPrev.copy(controls.target); controls.target.lerp(focusP.mesh.position, k); camera.position.add(camPrev.sub(controls.target).negate());
    const off = camPrev.copy(camera.position).sub(controls.target), r = off.length(); if (r > 26) camera.position.copy(controls.target).addScaledVector(off, lerp(r, 26, k) / r); }
  else if (watchWho && !cine && !eyes && !tankView && !saverOn) { const p = humansOut().find(q => q.who === watchWho);   // watching a person
    if (p) { camPrev.copy(controls.target); controls.target.lerp(_wv.copy(p.mesh.position).setY(p.mesh.position.y + .9), clamp(dt * 3, 0, 1)); camera.position.add(camPrev.sub(controls.target).negate());
      const off = camPrev.copy(camera.position).sub(controls.target), r = off.length(); if (r > 16 && !view) camera.position.copy(controls.target).addScaledVector(off, lerp(r, 16, clamp(dt * 1.5, 0, 1)) / r); } }
  else if (follow && spider && view !== 'top') { camPrev.copy(controls.target); controls.target.lerp(spider.root.position, clamp(dt * 2.5, 0, 1)); camera.position.add(camPrev.sub(controls.target).negate()); }
  if (view && !saverOn && !tankView && !cine && !eyes) viewCam(dt);
  if (tankView && !saverOn) { // look straight in through the front glass
    const t = Math.tan(camera.fov * Math.PI / 360), d = Math.min(TH / 2 / t, TW / 2 / (t * camera.aspect)) * .97, y = TH / 2; // 'cover' fit: the glass always fills the window, no floor in front
    controls.target.set(0, y, 0); camera.position.lerp(camPrev.set(0, y, TD / 2 + d), clamp(dt * 3, 0, 1)); }
  if (saverOn && spider) { // new shot every ~14 s: angle, height and distance drift smoothly while the camera circles
    saverT -= dt; if (saverT <= 0) { saverT = rand(10, 18); const s = spider.span || 10; saverShot = { el: rand(.18, .75), r: s * rand(1.3, 3.2) + 6, spin: rand(.03, .08) * (Math.random() < .5 ? -1 : 1) }; }
    const off = camPrev.copy(camera.position).sub(controls.target), r0 = off.length();
    let az = Math.atan2(off.x, off.z) + saverShot.spin * dt, el = Math.asin(clamp(off.y / r0, -1, 1));
    const k = clamp(dt * .25, 0, 1); el = lerp(el, saverShot.el, k); const r = lerp(r0, saverShot.r, k);
    camera.position.set(controls.target.x + Math.sin(az) * Math.cos(el) * r, controls.target.y + Math.sin(el) * r, controls.target.z + Math.cos(az) * Math.cos(el) * r); }
  if (cine && spider && !tankView && !saverOn) { // kaiju shot: from down in the street, looking up at the spider
    const s = spider.span || 10, p = spider.root.position, k2 = clamp(dt * 2, 0, 1);
    controls.target.lerp(camPrev.set(p.x, p.y + s * .12, p.z), k2); const off = camPrev.copy(camera.position).sub(controls.target); off.y = 0;
    if (off.lengthSq() < .01) off.set(0, 0, 1);
    const ty = p.y + s * .12, a0 = Math.atan2(off.x, off.z);
    const at = (a, f) => { const r = Math.min(s * f, 34), x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      return inTank(x, z, 1.5) ? [x, groundY(x, z) + clamp(s * .05, .6, 2.5), z] : null; };   // never squeezed against the glass
    const clear = c => { if (!c) return false; const [x, y, z] = c, n = Math.ceil(Math.hypot(p.x - x, p.z - z) / 1.2);
      for (let i = 0; i <= n * .9; i++) { const u = i / n, qx = x + (p.x - x) * u, qz = z + (p.z - z) * u, qy = y + (ty - y) * u;
        for (const k of SOLIDS) if (gridY(k.grid, qx, qz) > qy && solidNear(k, qx, qz).inside) return false; } return true; };
    let pick = null;                                               // keep the angle if the street is clear, else swing around / pull in
    for (const da of [0, .45, -.45, .9, -.9, 1.4, -1.4, 2.2, -2.2, 3.1]) { for (const f of [1.7, 1.3, 1, .75]) { const c = at(a0 + da, f); if (clear(c)) { pick = c; break; } } if (pick) break; }
    if (pick) camera.position.lerp(camPrev.set(...pick), k2); }
  // haze between the buildings in the film shot; shafts of light through the street gaps by day
  FOG0 = FOG0 || scene.fog.density; scene.fog.density = lerp(scene.fog.density, cine ? FOG0 * 2.4 : FOG0, clamp(dt, 0, 1));
  controls.update();
  if (eyes) { const p = eyesOf();                                  // his eyes: a point just in front of his face, looking where his head points
    if (!p) { setEyes(false); log('มุมมองสายตาคนปิดแล้ว (ไม่มีใครอยู่ในเมืองแล้ว)'); }
    else { const n = p.hum.j.neck; eyeP.set(0, .141, .13); n.localToWorld(eyeP); eyeF.set(0, .12, 6); n.localToWorld(eyeF);
      if (eyeL.y < -1e8) eyeL.copy(eyeF); eyeL.lerp(eyeF, clamp(dt * 7, 0, 1)); camera.position.copy(eyeP); camera.lookAt(eyeL); controls.target.copy(eyeL); } }
  // focus on the orbit target (the spider when following); shallower DOF the closer the camera, like a macro lens
  const fd = camera.position.distanceTo(controls.target);
  bokeh.uniforms.focus.value = fd; bokeh.uniforms.aperture.value = clamp(.0065 / fd, .00005, .0006);
  BLOOD.update(dt); preyTalk(dt);
  if (typeof contactShadows === 'function') contactShadows();   // soft contact shadows under feet/body/prey (js/look.js)
  renderer.shadowMap.needsUpdate = true;
  // a light that is off (sun at night, LED / lamp switched off) adds nothing, so its shadow map needn't be re-rendered (saves a whole scene pass each)
  for (let i = 0; i < 3; i++) { const l = SHADOW_LIGHTS[i]; l.shadow.autoUpdate = false; l.shadow.needsUpdate = l.intensity > .002; }
  composer.render();
  // speech bubble floats above the spider
  const sb = $('say'); sayBubbleT -= dt;
  if (sayBubbleT > 0 && spider && !previewing) { const q = _sayP.copy(spider.root.position); q.y += spider.span * .22; q.project(camera);
    const on = q.z < 1 && Math.abs(q.x) < .92 && q.y < .9 && q.y > -1; sb.classList.toggle('on', on && sayBubbleT > .3);   // off screen = hidden, not pinned to the edge
    if (on) { sb.style.left = clamp((q.x * .5 + .5) * innerWidth, 130, innerWidth - 130) + 'px'; sb.style.top = Math.max(60, (-q.y * .5 + .5) * innerHeight) + 'px'; } }
  else sb.classList.remove('on');
  if (!previewing) { hudT -= dt; if (hudT < 0) { hud(); hudT = .2; } saveT -= dt; if (saveT < 0) { save(); saveT = 5; } }
  requestAnimationFrame(loop);
}
loop();
