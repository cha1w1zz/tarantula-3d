'use strict';
/* =====================================================================
   Survival round (loaded after human.js, before game.js; uses game.js globals at run time).
   The player only watches: the game drives ชัยภัทร. He must last ROUND_DAYS survival days in the town, then the helicopter
   picks him up. Events go to the keeper's log + his speech bubble (no new UI).
     needs     hunger (a store, every ~4 days) and thirst (the pond, every ~3 days); at zero he does not die, he only runs slower
     stamina   sprinting + jukes drain it, walking / hiding refill it; hunger + thirst lower its maximum
     hiding    he waits behind buildings; before leaving cover he peeks out and ducks back if he senses the spider
     trips     random store, random detours, mostly by day
     chase     fast acceleration, tight turns, jukes (a sharp side-step when the spider closes in, so it overshoots)
   game.js calls ROUND.start(p) when he is released, ROUND.tick(dt) every tick, ROUND.caught(p) / ROUND.eaten(p);
   Prey.human() (prey.js) calls humanAI().
   ===================================================================== */
const DAY_S = 12, ROUND_DAYS = 30;                                // 1 survival day = 12 s real (× fast-forward) → 30 days ≈ 6 min
const HUM = { dodge: .25, need: .5, walk: 1.4, hurry: 3.2, run: 5, sprint: 9.5, jog: .55, acc: 16, turn: 10, eatDays: 4, drinkDays: 3, sprintS: 6.5, jukeCost: .12, jukeCD: 1.4 };

/* ---------- where a person can walk: a 1-unit grid (buildings, rocks, pond, log, tank edge blocked), same format as navGrid ---------- */
const HNAV = { G: null, stores: [], hides: [], pond: [] };
function humanNav() {
  if (HNAV.G) return HNAV;
  const nx = TW + 1, nz = TD + 1, free = new Uint8Array(nx * nz), comp = new Int32Array(nx * nz).fill(-1);
  // the strips behind the back row and the east row (building backs against the glass) are not town: no hiding back there
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = i - TW / 2, z = j - TD / 2; free[j * nx + i] = z < -35.5 || x > 53.5 || preyBlocked(x, z, 1.2) ? 0 : 1; }
  let c = 0; const st = [];
  for (let s = 0; s < free.length; s++) if (free[s] && comp[s] < 0) { comp[s] = c; st.push(s);
    while (st.length) { const k = st.pop(), i = k % nx, j = k / nx | 0;
      for (const [di, dj] of N8) { const a = i + di, b = j + dj, q = b * nx + a; if (a >= 0 && b >= 0 && a < nx && b < nz && free[q] && comp[q] < 0) { comp[q] = c; st.push(q); } } }
    c++; }
  const G = HNAV.G = { nx, nz, free, comp };
  // the biggest connected area is "the town": every goal must be in it
  const size = new Map(); comp.forEach(v => v >= 0 && size.set(v, (size.get(v) || 0) + 1)); let big = -1, bs = 0; size.forEach((n, k) => { if (n > bs) { bs = n; big = k; } }); G.main = big;
  const cellPt = k => new V3(k % nx - TW / 2, 0, (k / nx | 0) - TD / 2), ok = k => k >= 0 && comp[k] === big;
  // store doors (convenience stores, kiosks, the two 食堂 eateries): a step in front of the shop front
  CITY.buildings.forEach((b, i) => { const L = LOTS[i]; if (!L || !(b.kind === 'store' || b.kind === 'kiosk' || L.hsign === 'SHOKUDO')) return;
    const fx = Math.sin(b.rot), fz = Math.cos(b.rot), k = navNear(G, b.x + fx * (b.d / 2 + 1.4), b.z + fz * (b.d / 2 + 1.4));
    if (ok(k)) HNAV.stores.push({ p: cellPt(k), name: { store: 'ร้านสะดวกซื้อ', kiosk: 'ร้านชำเล็ก ๆ' }[b.kind] || 'ร้านอาหาร', b }); });
  // pond: spots on the bank all round
  for (let a = 0; a < 6.28; a += .6) { const r = pondR(a) + 1.6, k = navNear(G, dishPos.x + Math.cos(a) * r, dishPos.z + Math.sin(a) * r); if (ok(k)) HNAV.pond.push(cellPt(k)); }
  // hiding places: hugging the walls of every building taller than him (sides + corners)
  SOLIDS.forEach(s => { if (s.h < 1.9) return;
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const lx = u * (s.hw + 1.1), lz = v * (s.hd + 1.1), x = s.x + lx * s.c + lz * s.s, z = s.z - lx * s.s + lz * s.c, k = navCell(G, x, z);
      if (ok(k) && G.free[k]) HNAV.hides.push({ p: new V3(x, 0, z), s }); } });
  return HNAV;
}
// can he be seen / felt from the spider's spot? a building taller than him between them = cover
function covered(a, b) { const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1, n = Math.ceil(Math.sqrt(L2) / .8);
  for (const s of SOLIDS) { if (s.h <= 1.9) continue;
    const t = clamp(((s.x - a.x) * dx + (s.z - a.z) * dz) / L2, 0, 1), cx = a.x + dx * t - s.x, cz = a.z + dz * t - s.z; if (cx * cx + cz * cz > s.r * s.r) continue;   // segment misses it
    for (let i = 1; i < n; i++) if (solidNear(s, a.x + dx * i / n, a.z + dz * i / n).inside) return true; }
  return false; }
function humanRoute(from, to, detour) {
  const H = humanNav(); let pts = null;
  if (spider && S.phase !== 'molting') {                     // keep well clear of the spider on the way (if there is another way)
    const G = H.G, f = G.free.slice(), R = spider.span * .9 + 4, i0 = Math.round(spider.pos.x + TW / 2), j0 = Math.round(spider.pos.z + TD / 2), r = Math.ceil(R);
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) if (i >= 0 && j >= 0 && i < G.nx && j < G.nz && Math.hypot(i - i0, j - j0) < R) f[j * G.nx + i] = 0;
    if (Math.hypot(from.x - spider.pos.x, from.z - spider.pos.z) > R && Math.hypot(to.x - spider.pos.x, to.z - spider.pos.z) > R) pts = astar(Object.assign({}, G, { free: f }), from, to); }
  if (!pts) pts = astar(H.G, from, to);
  if (detour && pts) { const G = H.G; for (let k = 0; k < 12; k++) { const x = lerp(from.x, to.x, rand(.25, .75)) + rand(-12, 12), z = lerp(from.z, to.z, rand(.25, .75)) + rand(-12, 12), c = navCell(G, x, z);
      if (G.free[c] && G.comp[c] === G.main) { const a = astar(G, from, new V3(x, 0, z)), b = a && astar(G, a[a.length - 1], to); if (a && b) { pts = a.concat(b); break; } } } }
  return pts || [to.clone()];
}

/* ---------- the round ---------- */
const ROUND = {
  on: false, t: 0, day: 0, p: null, result: null, rescuing: false, stats: null,
  start(p) { humanNav(); Object.assign(this, { on: true, t: 0, day: 0, p, result: null, rescuing: false, stats: { chases: 0, escapes: 0, caught: 0, scares: 0, jukes: 0, trips: 0, meals: 0, drinks: 0, ducks: 0, dur: [] }, chaseT0: -1 });
    p.ai = { st: 'hide', t: rand(2, 5), route: [], goal: null, why: null, H: 1, W: rand(.75, 1), stam: 1, cv: 0, jukeT: 0, jukeCD: 0, safeT: 0, repl: 0, chased: false };
    log(`🏁 เริ่มภารกิจเอาชีวิตรอด: ชัยภัทรต้องอยู่รอดในเมืองร้าง ${ROUND_DAYS} วัน (1 วัน = ${DAY_S} วินาที) แล้วเฮลิคอปเตอร์จะมารับ`); },
  tick(dt) {
    if (!this.on) return; const p = this.p;
    if (!p || p.eaten) { if (!this.result) this.end('lose'); return; }
    this.t += dt * TM; const day = Math.floor(this.t / DAY_S);
    if (day > this.day) { this.day = day;
      if (day < ROUND_DAYS && day % 5 === 0) log(`📅 วันที่ ${day}: ชัยภัทรยังรอดอยู่ (อิ่ม ${Math.round(p.ai.H * 100)}% · น้ำ ${Math.round(p.ai.W * 100)}%)`); }
    if (this.day >= ROUND_DAYS && !this.rescuing && !p.held) { this.rescuing = true; log('🚁 ครบ 30 วันแล้ว! เฮลิคอปเตอร์กู้ภัยบินลงมารับชัยภัทร'); humanSay(p, 'rescue', true);
      HELI.rescue(p, () => { if (p.eaten || p.held) return; p.boarded = true; if (spider.prey === p) setMode('idle'); p.remove(); this.end('win'); }); }
  },
  // the spider's side of a chase (game.js): started / ended (caught = it ended in the fangs)
  chaseOn(p) { if (!this.on || p !== this.p) return; this.stats.chases++; this.chaseT0 = this.t; },
  chaseOff(caught) { if (!this.on || this.chaseT0 < 0) return; this.stats.dur.push(+(this.t - this.chaseT0).toFixed(1)); this.chaseT0 = -1;
    if (caught) this.stats.caught++; else { this.stats.escapes++; if (this.p && !this.p.eaten) { log(`🏃 ชัยภัทรรอดจากการไล่ล่าครั้งที่ ${this.stats.chases} มาได้`); humanSay(this.p, 'phew', true); } } },
  end(res) { if (!this.on) return; this.on = false; this.result = res;
    if (res === 'win') log(`🎉 ชัยภัทรขึ้นเฮลิคอปเตอร์ได้! รอดครบ ${ROUND_DAYS} วัน (รอดจากการไล่ล่า ${this.stats.escapes} ครั้ง) ภารกิจสำเร็จ`);
    else log(`💀 ชัยภัทรไม่รอด ถูก${S.name}จับกินในวันที่ ${this.day + 1} จาก ${ROUND_DAYS} ภารกิจล้มเหลว`); },
};

/* ---------- ชัยภัทร's brain (called from Prey.human every tick) ---------- */
function humanAI(p, dt, sp, d) {
  const A = p.ai; if (!A) return;
  const T = dt * TM, L = sp.span, night = isNight(), H = humanNav();
  // needs + stamina ceiling; at zero he only gets slower
  A.H = Math.max(0, A.H - T / (DAY_S * HUM.eatDays)); A.W = Math.max(0, A.W - T / (DAY_S * HUM.drinkDays));
  const low = Math.min(A.H, A.W), weak = low <= 0 ? .8 : 1, stMax = .6 + .4 * clamp(low * 2.5, 0, 1);
  A.jukeCD -= T; A.jukeT -= T; A.t -= T; A.repl -= T;
  // --- threat: the spider close by (seen or felt shaking the ground), or it is after him
  const awake = sp.flip < .5 && sp.hidden < .5 && S.phase !== 'molting';
  const hunted = sp.prey === p && (sp.mode === 'hunt' || sp.mode === 'strike');
  const walking = sp.vel.length() > L * .1, near = d < (walking ? L * 1.1 + 6 : L * .7 + 4);
  const alarm = sp.flip < .5 && d < L * .6 + 2 || awake && (hunted && d < L * 3.2 || near && A.st !== 'act' && !covered(sp.pos, p.pos));   // hunted, very close, or in plain sight nearby (a meal is finished first)
  if (ROUND.rescuing && A.st !== 'flee' && A.st !== 'wait') { goHide(p, sp, true); A.st = 'wait'; }   // the helicopter is coming: into cover, keep still
  if (alarm && A.st !== 'flee') { A.st = 'flee'; A.repl = 0; A.safeT = 0; ROUND.stats.scares++; humanSay(p, 'panic'); }
  let want = 0, head = p.yaw;
  if (A.st === 'flee') {
    p.panic = 1; p.calmT = 4;
    const sprint = A.stam > .02, sx = p.pos.x - sp.pos.x, sz = p.pos.z - sp.pos.z, sl = Math.hypot(sx, sz) || 1;
    // run for the best cover: a hiding place behind a building from the spider, not past it, not too far
    // at cover, out of its sight and not right next to it: freeze (standing still sends no vibration, so it loses him)
    const still = !A.route.length && A.goal && d > L * .7 + 3 && covered(sp.pos, p.pos);
    if (!still && (A.repl <= 0 || !A.route.length)) { A.repl = .6; let best = null, bs = -1e9;
      for (const h of H.hides) { const hx = h.p.x - p.pos.x, hz = h.p.z - p.pos.z, hd = Math.hypot(hx, hz); if (hd > 32 || hd < 1.5) continue;
        const toward = (hx * -sx + hz * -sz) / (hd * sl);                          // > 0: in the spider's direction
        const sc = (covered(sp.pos, h.p) ? 5 : 0) + Math.hypot(h.p.x - sp.pos.x, h.p.z - sp.pos.z) * .12 - hd * .1 - Math.max(0, toward) * 6 + (h.s.h < L * CLIMB ? -1.5 : 1.5) + rand(0, .8);
        if (sc > bs) { bs = sc; best = h; } }
      A.route = best ? humanRoute(p.pos, best.p) : [new V3(p.pos.x + Math.sin(openDir(p, sp, true)) * 6, 0, p.pos.z + Math.cos(openDir(p, sp, true)) * 6)]; A.goal = best; }
    head = steerRoute(p, A);
    // juke: the spider is on top of him (or rearing to strike) → a hard side-step to the more open side
    // (reacting to the lunge itself: once per strike, the fresher he is the likelier)
    const closing = hunted && d < L * .45 + 3, rearing = sp.mode === 'strike' && sp.prey === p && sp.modeT < .2 && A.jukeFor !== sp.strikeN;
    if (rearing) A.jukeFor = sp.strikeN;
    if (A.jukeT <= 0 && ((closing && A.jukeCD <= 0 && A.stam > .05) || (rearing && Math.random() < HUM.dodge + .35 * A.stam))) {
      const base = Math.atan2(sp.vel.x, sp.vel.z) + Math.PI; let bestA = base + Math.PI / 2, bo = -1;   // across the spider's line of run
      for (const s of [-1, 1]) { const a = base + s * rand(1.25, 1.85); let o = 0; for (let r = .8; r <= 5; r += .8) { if (preyBlocked(p.pos.x + Math.sin(a) * r, p.pos.z + Math.cos(a) * r, 1)) break; o = r; } if (o > bo + rand(0, .8)) { bo = o; bestA = a; } }
      A.jukeA = bestA; A.jukeT = .45; A.jukeCD = HUM.jukeCD; A.stam -= HUM.jukeCost; ROUND.stats.jukes++; A.repl = 0;
      if (Math.random() < .35) humanSay(p, 'juke'); }
    if (A.jukeT > 0) head = A.jukeA;
    const flat = hunted || d < L * .8 + 3;                                    // only a real chase is worth his last strength
    want = still && A.jukeT <= 0 ? 0 : (A.jukeT > 0 ? HUM.sprint * 1.12 : !flat ? HUM.run : sprint ? HUM.sprint : HUM.sprint * HUM.jog) * weak;
    if (want > HUM.hurry) { if (sprint) A.stam -= T / HUM.sprintS; else if (Math.random() < T * .3) humanSay(p, 'tired'); }
    // lost it: not hunted, out of sight / far → sneak into the nearest cover
    if (!hunted && (d > L * 1.3 + 10 || still || covered(sp.pos, p.pos))) A.safeT += T; else A.safeT = 0;
    if (A.safeT > 1.2) goHide(p, sp, true, still);
  } else if (A.st === 'hide' || A.st === 'wait') {
    p.panic = Math.max(0, (p.panic || 0) - T * .3);
    if (A.route.length) { head = steerRoute(p, A); want = HUM.hurry * weak; }
    else if (A.st === 'hide' && A.t <= 0) { // time to go? (needs first; mostly by day; at night only when it is urgent)
      const need = A.W < HUM.need || A.H < HUM.need, urgent = low < .15, go = night ? urgent : need || Math.random() < .25;
      if (go) { A.st = 'peek'; A.t = rand(.9, 1.6); A.peekFrom = p.pos.clone(); head = rand(0, 6.3); } else A.t = rand(2, 5); }
  } else if (A.st === 'peek') {   // a step out, a look round: the spider in sight or the ground shaking → back into cover
    want = A.t > .9 ? .6 : 0; p.panic = 0;
    const sees = awake && (d < L * 1.1 + 8 && !covered(sp.pos, p.pos) || (sp.vel.length() > L * .15 && d < L * 1.3 + 6));
    if (sees) { A.st = 'hide'; A.t = rand(4, 9); ROUND.stats.ducks++; A.route = [A.peekFrom.clone()]; humanSay(p, 'peek'); if (Math.random() < .5) log('👀 ชัยภัทรแอบมองออกไป เห็นแมงมุมอยู่ใกล้ ๆ เลยหลบกลับไปรอก่อน'); }
    else if (A.t <= 0) planTrip(p, sp);
  } else if (A.st === 'trip') {
    if (A.route.length) { head = steerRoute(p, A); want = (A.why === 'hide' && !night ? HUM.walk : HUM.hurry) * weak; }   // errands: brisk; moving cover by day: a stroll
    else if (A.why === 'hide') goHide(p, sp, false, true);
    else { A.st = 'act'; A.t = 1.6; }
  } else if (A.st === 'act') {   // eating / drinking on the spot
    if (A.t <= 0) { if (A.why === 'eat') { A.H = 1; ROUND.stats.meals++; humanSay(p, 'ate'); log(`🍙 ชัยภัทรแอบเข้า${A.goal && A.goal.name || 'ร้าน'}หาของกิน อิ่มแล้ว`); }
      else if (A.why === 'drink') { A.W = 1; ROUND.stats.drinks++; humanSay(p, 'drank'); log('💧 ชัยภัทรแอบไปกินน้ำที่บ่อ หายคอแห้งแล้ว'); }
      goHide(p, sp, false); }
  }
  // stamina: sprinting drains it (above), walking and hiding refill it
  if (A.cv <= HUM.run + .1) A.stam = Math.min(stMax, A.stam + T * (A.cv < .3 ? .25 : .12));
  A.stam = clamp(A.stam, 0, stMax);
  // fast acceleration, tight turns (Prey.update turns `face` toward `yaw`)
  A.cv += clamp(want - A.cv, -HUM.acc * 1.5 * T, HUM.acc * T); p.yaw = head; p.v = A.cv;
  p.vib = A.cv < .2 ? 0 : A.cv < 2 ? .6 : A.cv < 5 ? 1 : 1.5;   // how hard his steps shake the ground (walk ≪ sprint)
}
function steerRoute(p, A) {
  while (A.route.length && Math.hypot(A.route[0].x - p.pos.x, A.route[0].z - p.pos.z) < (A.route.length > 1 ? 1.2 : .7)) A.route.shift();
  const q = A.route[0]; return q ? Math.atan2(q.x - p.pos.x, q.z - p.pos.z) : p.yaw;
}
// next trip: the most pressing need (random store / a spot on the pond bank), else a random move to other cover; random detours
function planTrip(p, sp) {
  const A = p.ai, H = humanNav(); let goal = null, why = 'hide';
  const nearest = (list, n) => { const l = list.slice().sort((a, b) => a.p.distanceTo(p.pos) - b.p.distanceTo(p.pos)).slice(0, n); return l[Math.random() * l.length | 0]; };
  if (A.W < HUM.need && A.W <= A.H + .1) { why = 'drink'; goal = nearest(H.pond.map(q => ({ p: q })), 4); }
  else if (A.H < HUM.need) { why = 'eat'; goal = nearest(H.stores, 3); }
  if (!goal || !goal.p) { why = 'hide'; const c = H.hides.filter(h => h.p.distanceTo(p.pos) > 8 && h.p.distanceTo(p.pos) < 30 && h.p.distanceTo(sp.pos) > sp.span * 1.5); goal = c[Math.random() * c.length | 0]; }
  if (!goal) { A.st = 'hide'; A.t = rand(2, 4); return; }
  A.st = 'trip'; A.why = why; A.goal = goal; A.route = humanRoute(p.pos, goal.p, Math.min(A.H, A.W) > .25 && Math.random() < .35); ROUND.stats.trips++;
  if (why === 'eat') humanSay(p, 'hungry'); else if (why === 'drink') humanSay(p, 'thirsty');
}
// into cover: the hiding place nearest to him that the spider cannot see (fleeing: hurry)
function goHide(p, sp, hurry, here) {
  const A = p.ai, H = humanNav(); A.st = 'hide'; A.t = Math.min(A.H, A.W) < HUM.need ? rand(1.5, 3) : rand(3, 8) * (isNight() ? 1.6 : 1); A.why = null;
  if (here) { A.route = []; return; }
  let best = null, bs = -1e9;
  for (const h of H.hides) { const hd = h.p.distanceTo(p.pos); if (hd > 25) continue; const sc = (covered(sp.pos, h.p) ? 4 : 0) - hd * .2 + h.p.distanceTo(sp.pos) * .05 + rand(0, .5); if (sc > bs) { bs = sc; best = h; } }
  A.route = best ? humanRoute(p.pos, best.p) : [];
}
