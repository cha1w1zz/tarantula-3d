'use strict';
/* =====================================================================
   Survival round (loaded after human.js, before game.js; uses game.js globals at run time).
   The player only watches: the game drives ชัยภัทร and ตุ้ย. They must last ROUND_DAYS survival days in the town, then the helicopter
   picks him up. Events go to the keeper's log + his speech bubble (no new UI).
     needs     hunger (a store, every ~4 days) and thirst (the pond, every ~3 days); at zero he does not die, he only runs slower
     stamina   sprinting + jukes drain it, walking / hiding refill it; hunger + thirst lower its maximum
     hiding    he waits behind buildings; before leaving cover he peeks out and ducks back if he senses the spider
     trips     random store, random detours, mostly by day
     chase     fast acceleration, tight turns, jukes (a sharp side-step when the spider closes in, so it overshoots)
   game.js calls ROUND.begin() when they are released, ROUND.tick(dt) every tick, ROUND.grief(p) when one is caught;
   Prey.human() (prey.js) calls humanAI().
   ===================================================================== */
const DAY_S = 12, ROUND_DAYS = 30;                                // 1 survival day = 12 s real (× fast-forward) → 30 days ≈ 6 min
const HUM = { dodge: .2, need: .5, walk: 1.4, hurry: 3.2, run: 5, sprint: 9.5, jog: .55, acc: 16, turn: 10, eatDays: 3, drinkDays: 2, sprintS: 5.5, jukeCost: .12, jukeCD: 1.4 };

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
// where a human walks in: a random free town cell ≥ 25 from the spider, ≥ 15 from the other human, not in the pond / under the log;
// 50 misses → the old way (the fixed street spot farthest from the spider). ok = false: the spider is too close to everything
const HUMAN_SPAWNS = [{ x: -18, z: -19 }, { x: 33, z: 12 }];
const spawnArea = (x, z) => z < -13 ? 'ถนนหลังเมือง' : x > 19 ? 'ฝั่งขวา' : 'สวน';
function humanSpawn(others) {
  const G = humanNav().G, sd = (x, z) => spider ? Math.hypot(x - spider.pos.x, z - spider.pos.z) : 99;
  const od = (x, z) => (others || []).reduce((m, o) => Math.min(m, Math.hypot(x - o.x, z - o.z)), 99);
  for (let t = 0, n = 0; t < 50 && n < 5000; t++, n++) { const k = Math.floor(Math.random() * G.free.length); if (!G.free[k] || G.comp[k] !== G.main) { t -= .9; continue; }   // only real tries count
    const x = k % G.nx - TW / 2, z = (k / G.nx | 0) - TD / 2;
    if (sd(x, z) >= 25 && od(x, z) >= 15 && !inPond(x, z) && pondT(x, z) > 1.2 && !underLog(x, z)) return { x, z, name: spawnArea(x, z), ok: true }; }
  const pick = HUMAN_SPAWNS.slice().sort((a, b) => sd(b.x, b.z) - sd(a.x, a.z))[0];
  let best = null, bd = 1e9;
  for (let k = 0; k < G.free.length; k++) if (G.comp[k] === G.main) { const x = k % G.nx - TW / 2, z = (k / G.nx | 0) - TD / 2, d = Math.hypot(x - pick.x, z - pick.z); if (d < bd) { bd = d; best = { x, z }; } }
  const x = best ? best.x : pick.x, z = best ? best.z : pick.z;
  return { x, z, name: spawnArea(x, z), ok: sd(x, z) >= 25 };
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

/* ---------- the people ---------- */
// ตุ้ย: a scaredy-cat (hides longer, peeks out less, startles from further away) who talks like an edgy anime hero coder
const PEOPLE = { chai: { name: 'ชัยภัทร', hideK: 1, peekK: 1, startleK: 1, nervous: 0 }, tui: { name: 'ตุ้ย', hideK: 1.2, peekK: .7, startleK: 1.2, nervous: 1 } }, PEOPLE_ORDER = ['chai', 'tui'];
const humansOut = () => prey.filter(q => q.kind === 'human' && !q.eaten && !q.boarded);

/* ---------- the round: both people in town; eaten → the same person back after 10 s (auto play); day 30 → two helicopters ---------- */
const ROUND = {
  on: false, t: 0, day: 0, p: [], result: null, rescuing: false, stats: null, deaths: 0, back: [], breakT: -1, pend: [],
  // new round: day 1, both released 2 s apart
  begin() { humanNav(); Object.assign(this, { on: true, t: 0, day: 0, p: [], result: null, rescuing: false, deaths: 0, saved: 0, back: [], breakT: -1, pend: [{ who: 'chai', t: 0 }, { who: 'tui', t: 2 }], chaseT0: -1,
      stats: { chases: 0, escapes: 0, caught: 0, scares: 0, jukes: 0, trips: 0, meals: 0, drinks: 0, ducks: 0, dur: [] } });
    log(`🏁 เริ่มภารกิจเอาชีวิตรอดรอบที่ ${(S.rounds || 0) + 1}: ชัยภัทรกับตุ้ยต้องอยู่รอดในเมืองร้าง ${ROUND_DAYS} วัน (1 วัน = ${DAY_S} วินาที) แล้วเฮลิคอปเตอร์จะมารับ`); },
  // a person walks in (first release or respawn); false = the spider is too close to every free spot (retry in 1 s)
  enter(who, again) { const at = humanSpawn(humansOut().map(q => q.pos)); if (!at.ok) return false;
    const p = new Prey('human', who, at); prey.push(p); this.p.push(p);
    p.ai = { st: 'hide', t: rand(5, 7), route: [], goal: null, why: null, H: 1, W: rand(.75, 1), stam: 1, cv: 0, jukeT: 0, jukeCD: 0, safeT: 0, repl: 0, chased: false };
    if (again) { log(`🔁 ${p.name}กลับมาแล้ว… (เข้ามาทาง${at.name})`); humanSay(p, 'respawn', true); notice(`${p.name}กลับมาแล้ว…`); }
    else log(`🏃 ${p.name}หลงเข้ามาในเมืองร้างทาง${at.name}… ต้องหาของกิน หาน้ำ และหลบแมงมุมยักษ์ให้ได้ ${ROUND_DAYS} วัน`);
    focusOn(p); return true; },
  tick(dt) {
    if (this.breakT >= 0) { this.breakT -= dt * TM; if (this.breakT < 0 && S.autoRound !== false && S.span >= HUMAN_SPAN) this.begin(); return; }   // break between rounds
    if (!this.on) return;
    for (const w of this.pend) if ((w.t -= dt * TM) <= 0) w.t = this.enter(w.who, w.again) ? 1e9 : 1;   // releases / respawns (retry each 1 s)
    this.pend = this.pend.filter(w => w.t < 1e8);
    for (const p of this.p.slice()) {
      if (p.boarded) { this.p.splice(this.p.indexOf(p), 1); continue; }
      if (!p.eaten) continue;
      this.p.splice(this.p.indexOf(p), 1); this.deaths++;
      if (S.autoRound !== false && !this.rescuing) this.pend.push({ who: p.who, t: 10, again: true });
      else this.back.push(p.who); }
    if (!this.p.length && !this.pend.length) { this.end(this.saved ? 'win' : 'lose'); return; }
    this.t += dt * TM; const day = Math.floor(this.t / DAY_S);
    if (day > this.day) { this.day = day;
      if (day < ROUND_DAYS && day % 5 === 0) log(`📅 วันที่ ${day}: ` + (this.p.map(p => `${p.name} (อิ่ม ${Math.round(p.ai.H * 100)}% · น้ำ ${Math.round(p.ai.W * 100)}%)`).join(', ') || 'ยังไม่มีใครในเมือง')); }
    if (this.day >= ROUND_DAYS && !this.rescuing && this.p.some(p => !p.held)) { this.rescuing = true; this.pend = []; this.saved = 0;
      const who = this.p.filter(p => !p.held);
      log(`🚁 ครบ ${ROUND_DAYS} วันแล้ว! เฮลิคอปเตอร์กู้ภัยบินลงมารับ${who.map(p => p.name).join('กับ')}`);
      who.forEach((p, i) => { humanSay(p, 'rescue', true); (i ? HELI2 : HELI).rescue(p, () => { if (p.eaten || p.held) return; p.boarded = true; this.saved++; if (spider.prey === p) setMode('idle'); p.remove(); }); }); }
  },
  // the spider's side of a chase (game.js): started / ended (caught = it ended in the fangs)
  chaseOn(p) { if (!this.on || !this.p.includes(p)) return; this.stats.chases++; this.chaseT0 = this.t; this.chased = p; },
  chaseOff(caught) { if (!this.on || this.chaseT0 < 0) return; this.stats.dur.push(+(this.t - this.chaseT0).toFixed(1)); this.chaseT0 = -1; const p = this.chased;
    if (caught) this.stats.caught++; else { this.stats.escapes++; if (p && !p.eaten) { log(`🏃 ${p.name}รอดจากการไล่ล่าครั้งที่ ${this.stats.chases} มาได้`); humanSay(p, 'phew', true); } } },
  // caught by the spider: the other one grieves and keeps still behind cover for 8–12 s
  grief(p) { for (const o of this.p) if (o !== p && !o.eaten && !o.held && o.ai) { humanSay(o, 'grief', true); goHide(o, spider, false, true); o.ai.t = rand(8, 12); } },
  stars() { return this.deaths === 0 ? 3 : this.deaths === 1 ? 2 : 1; },   // tuned so all three happen (headless: ~25% / ~60% / ~15%)
  end(res) { if (!this.on) return; this.on = false; this.result = res;
    if (res === 'win') { const st = this.stars(), txt = '⭐'.repeat(st); S.rounds = (S.rounds || 0) + 1; S.best = Math.max(S.best || 0, st);
      log(`🎉 ภารกิจสำเร็จ! ขึ้นเฮลิคอปเตอร์ได้ ${this.saved} คน · ถูกกินระหว่างรอบ ${this.deaths} ครั้ง · ได้ ${txt} (เล่นมาแล้ว ${S.rounds} รอบ · ดีที่สุด ${'⭐'.repeat(S.best)})`); notice(`รอดครบ ${ROUND_DAYS} วัน ${txt}`); }
    else { S.rounds = (S.rounds || 0) + 1; log(`💀 ภารกิจล้มเหลว ไม่มีใครรอดถึงวันที่ ${ROUND_DAYS} (ถูกกิน ${this.deaths} ครั้ง ในวันที่ ${this.day + 1}) · เล่นมาแล้ว ${S.rounds} รอบ`); notice('ภารกิจล้มเหลว'); }
    if (S.autoRound !== false) { this.breakT = 15; log('⏳ รอบใหม่จะเริ่มเองใน 15 วินาที'); } },
};

/* ---------- a person's brain (called from Prey.human every tick) ---------- */
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
  const P = PEOPLE[p.who] || PEOPLE.chai, walking = sp.vel.length() > L * .1, near = d < (walking ? L * 1.1 + 6 : L * .7 + 4) * P.startleK;
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
        const sc = (covered(sp.pos, h.p) ? 5 : 0) + Math.hypot(h.p.x - sp.pos.x, h.p.z - sp.pos.z) * .12 - hd * .1 - Math.max(0, toward) * 6 + (h.s.h < L * CLIMB ? -1.5 : 1.5) + rand(0, .8) - (hideTaken(h.p, p) ? 8 : 0);
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
      const need = A.W < HUM.need || A.H < HUM.need, urgent = low < .15, go = night ? urgent : need || Math.random() < .25 * P.peekK;
      if (go) { A.st = 'peek'; A.t = rand(.9, 1.6); A.peekFrom = p.pos.clone(); head = rand(0, 6.3); } else A.t = rand(2, 5); }
  } else if (A.st === 'peek') {   // a step out, a look round: the spider in sight or the ground shaking → back into cover
    want = A.t > .9 ? .6 : 0; p.panic = 0;
    const sees = awake && (d < (L * 1.1 + 8) * P.startleK && !covered(sp.pos, p.pos) || (sp.vel.length() > L * .15 && d < (L * 1.3 + 6) * P.startleK));
    if (sees) { A.st = 'hide'; A.t = rand(4, 9); ROUND.stats.ducks++; A.route = [A.peekFrom.clone()]; humanSay(p, 'peek'); if (Math.random() < .5) log(`👀 ${p.name}แอบมองออกไป เห็นแมงมุมอยู่ใกล้ ๆ เลยหลบกลับไปรอก่อน`); }
    else if (A.t <= 0) planTrip(p, sp);
  } else if (A.st === 'trip') {
    if (A.route.length) { head = steerRoute(p, A); want = (A.why === 'hide' && !night ? HUM.walk : HUM.hurry) * weak; }   // errands: brisk; moving cover by day: a stroll
    else if (A.why === 'hide') goHide(p, sp, false, true);
    else { A.st = 'act'; A.t = A.why === 'drink' ? 3.2 : 3.4; }
  } else if (A.st === 'act') {   // eating / drinking on the spot (human.js poses it from p.acting)
    if (A.t <= 0) { if (A.why === 'eat') { A.H = 1; ROUND.stats.meals++; humanSay(p, 'ate'); log(`🍙 ${p.name}แอบเข้า${A.goal && A.goal.name || 'ร้าน'}หาของกิน อิ่มแล้ว`); }
      else if (A.why === 'drink') { A.W = 1; ROUND.stats.drinks++; humanSay(p, 'drank'); log(`💧 ${p.name}แอบไปกินน้ำที่บ่อ หายคอแห้งแล้ว`); }
      goHide(p, sp, false); }
  }
  // stamina: sprinting drains it (above), walking and hiding refill it
  if (A.cv <= HUM.run + .1) A.stam = Math.min(stMax, A.stam + T * (A.cv < .3 ? .25 : .12));
  A.stam = clamp(A.stam, 0, stMax);
  // fast acceleration, tight turns (Prey.update turns `face` toward `yaw`)
  p.acting = A.st === 'act' ? A.why : null;   // leaving 'act' early (ducked / fled) = the snack is dropped
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
  const A = p.ai, H = humanNav(); A.st = 'hide'; A.t = (Math.min(A.H, A.W) < HUM.need ? rand(1.5, 3) : rand(3, 8) * (isNight() ? 1.6 : 1)) * (PEOPLE[p.who] || PEOPLE.chai).hideK; A.why = null;
  if (here) { A.route = []; A.goal = { p: p.pos.clone() }; return; }
  let best = null, bs = -1e9;
  for (const h of H.hides) { const hd = h.p.distanceTo(p.pos); if (hd > 25 || hideTaken(h.p, p)) continue; const sc = (covered(sp.pos, h.p) ? 4 : 0) - hd * .2 + h.p.distanceTo(sp.pos) * .05 + rand(0, .5); if (sc > bs) { bs = sc; best = h; } }
  A.route = best ? humanRoute(p.pos, best.p) : []; A.goal = best;
}
// the other person already hides (or is heading) within 6 units of there: no bunching
const hideTaken = (q, p) => prey.some(o => o !== p && o.kind === 'human' && !o.eaten && o.ai && ((o.ai.goal && o.ai.goal.p && o.ai.goal.p.distanceTo(q) < 6) || (!o.ai.route.length && o.pos.distanceTo(q) < 6)));
