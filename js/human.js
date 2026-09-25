'use strict';
/* =====================================================================
   ชัยภัทร: a person-sized prey (town scale: a storey ≈ 3, a person ≈ 1.7) + his speech bubble, and the blood / silk FX.
   Loaded after prey.js, before game.js. API used by prey.js / game.js:
     PREY_KINDS.human(p, g)   build the model into g; sets p.rig(p, dt, v) (poses limbs each frame), p.limbs, speed/value/vib
     humanSay(p, cat)         line over his head ('panic' | 'calm' | 'caught')
     preyTalk(dt)             moves the bubbles (called from game.js loop)
     BLOOD.splash(pos, n) / BLOOD.drip(pos) / BLOOD.stain(pos, size) / BLOOD.cocoon(p) → mesh / BLOOD.update(dt)
   Look: orange hoodie, yellow backpack, jeans, white sneakers. ONE mesh per person: every part hangs on a joint (LimbBatch).
   ===================================================================== */

// ---------- geometry kit: vertex-coloured parts ----------
const HGEO = (() => {
  const C = h => lin(h), c = new THREE.Color();
  // colour every vertex: a hex, or f(x, y, z) → hex
  function paint(g, f) { g.deleteAttribute('uv'); const P = g.attributes.position, a = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { c.copy(typeof f === 'function' ? C(f(P.getX(i), P.getY(i), P.getZ(i))) : C(f)); a.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
  // glue indexed geometries into one (only the listed attributes)
  function merge(list, names = ['position', 'normal', 'color']) {
    const G = new THREE.BufferGeometry(); let nv = 0, ni = 0, v = 0, o = 0; list.forEach(g => { nv += g.attributes.position.count; ni += g.index.count; });
    const I = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    names.forEach(n => { const w = list[0].attributes[n].itemSize, A = new Float32Array(nv * w); let k = 0; list.forEach(g => { A.set(g.attributes[n].array, k); k += g.attributes[n].array.length; }); G.setAttribute(n, new THREE.BufferAttribute(A, w)); });
    list.forEach(g => { for (const i of g.index.array) I[o++] = i + v; v += g.attributes.position.count; });
    G.setIndex(new THREE.BufferAttribute(I, 1)); return G; }
  const ell = (rx, ry, rz, x, y, z, w = 10, h = 8) => new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
  // limb hanging DOWN from its joint: radius r0 → r1, rounded ends
  function capsule(r0, r1, len, seg = 8) { const pts = [];
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i / 3 * Math.PI / 2; pts.push(new V2(Math.max(1e-4, Math.cos(a) * r1), -len + Math.sin(a) * r1)); }
    for (let i = 0; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push(new V2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0)); }
    return new THREE.LatheGeometry(pts, seg); }
  // lathe through [radius, y] points, squashed front-to-back by sz
  const lathe = (keys, sz, seg = 12) => new THREE.LatheGeometry(keys.map(([r, y]) => new V2(Math.max(1e-4, r), y)), seg).scale(1, 1, sz);
  const PAL = { skin: 0xc58a64, skinD: 0xa4694a, hair: 0x17110e, hood: 0xff5a24, hoodD: 0xcc3d18, hoodL: 0xfff1de, jean: 0x2c4f86, jeanD: 0x1f3862, jeanL: 0x5f82b4,
    shoe: 0xf4f2ec, sole: 0xcfc8b8, shoeR: 0xe23a2a, pack: 0xf7c22c, packD: 0xc28d12, strap: 0x2b2d35, eye: 0x0d0907, mouth: 0x3a0b0b };
  // widen the shoulders of a torso lathe (a V shape instead of a barrel)
  const broad = g => { const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setX(i, P.getX(i) * (1 + .1 * sstep(.18, .38, P.getY(i)) - .04 * sstep(.2, 0, P.getY(i)))); g.computeVertexNormals(); return g; };
  let parts = null;
  // all part geometries are built once and shared (LimbBatch only reads them)
  function build() {
    if (parts) return parts; const K = PAL;
    // hips (jeans), hangs from the pelvis joint
    const pelvis = paint(ell(.165, .12, .11, 0, -.03, 0, 12, 8), K.jean);
    // hoodie (pocket, hood, drawstrings) + backpack + straps + neck
    const torso = paint(broad(lathe([[0, -.075], [.15, -.07], [.168, -.03], [.172, .1], [.178, .22], [.192, .32], [.19, .38], [.165, .43], [.1, .465], [.05, .478], [0, .482]], .68, 14)),
      (x, y, z) => y < -.035 ? K.hoodD : (z > .06 && y > .02 && y < .16 && Math.abs(x) < .11) ? (y > .145 || Math.abs(x) > .1 ? K.hoodD : 0xf06020) : K.hood);
    const hood = paint(new THREE.TorusGeometry(.1, .042, 6, 14).rotateX(Math.PI / 2 - .35).scale(1, 1, 1.15).translate(0, .458, -.02), K.hoodD);
    const hoodBack = paint(ell(.12, .085, .05, 0, .39, -.135, 10, 6), K.hoodD);
    const strings = [-1, 1].map(s => paint(new THREE.BoxGeometry(.011, .12, .011).translate(s * .035, .36, .134), K.hoodL));
    const pack = paint(ell(.135, .165, .07, 0, .22, -.172, 12, 8), (x, y, z) => z < -.215 && y < .2 ? K.packD : K.pack);
    const straps = [-1, 1].map(s => paint(new THREE.BoxGeometry(.034, .26, .02).rotateX(-.08).translate(s * .1, .3, .133), K.strap));
    const neck = paint(new THREE.CylinderGeometry(.05, .055, .1, 8).translate(0, .49, 0), K.skinD);
    const spine = merge([torso, hood, hoodBack, ...strings, pack, ...straps, neck]);
    // head: one sphere, pushed out above a hairline (high in front, low at the back) = hair, no seams
    const hg = new THREE.SphereGeometry(1, 16, 12), HP = hg.attributes.position, hairK = new Float32Array(HP.count);
    for (let i = 0; i < HP.count; i++) { const x = HP.getX(i), y = HP.getY(i), z = HP.getZ(i), line = .12 + .44 * z - .1 * Math.abs(x);
      const k = sstep(line - .06, line + .06, y), a = Math.atan2(x, z), tuft = .05 * Math.sin(a * 7 + y * 5) * sstep(.2, .9, y);
      const r = 1 + k * (.1 + .08 * Math.max(0, y) + tuft); HP.setXYZ(i, x * r, y * r, z * r); hairK[i] = k; }
    hg.computeVertexNormals(); hg.scale(.094, .112, .1).translate(0, .66, .012);
    let hi = 0; paint(hg, (x, y, z) => hairK[hi++] > .5 ? K.hair : (y < .575 ? K.skinD : K.skin));
    const face = [ell(.015, .018, .008, -.034, .668, .094, 6, 4), ell(.015, .018, .008, .034, .668, .094, 6, 4)].map(g => paint(g, K.eye));
    const brows = [-1, 1].map(s => paint(new THREE.BoxGeometry(.034, .008, .012).rotateZ(s * .22).translate(s * .036, .694, .092), K.hair));
    const nose = paint(ell(.014, .022, .018, 0, .648, .103, 6, 5), K.skinD), ears = [-1, 1].map(s => paint(ell(.014, .028, .018, s * .094, .656, .0, 6, 5), K.skinD));
    const head = merge([hg, ...face, ...brows, nose, ...ears]).translate(0, -.5, 0);  // pivot = neck top
    const mouth = paint(ell(.021, .009, .008, 0, 0, 0, 8, 5), K.mouth);
    // arms (hoodie sleeves, cuffs, hands)
    const upper = paint(capsule(.062, .052, .27), K.hood);
    const fore = merge([paint(capsule(.052, .044, .23), (x, y) => y < -.19 ? K.hoodD : K.hood), paint(ell(.026, .068, .044, 0, -.3, .006, 8, 6), K.skin)]);
    // legs (jeans with a turned-up cuff) and sneakers (white, red heel, pale sole)
    const thigh = paint(capsule(.096, .068, .43, 10), K.jean);
    const shin = paint(capsule(.07, .05, .39, 10), (x, y) => y < -.33 ? K.jeanL : K.jean);
    const shoe = merge([paint(ell(.054, .046, .128, 0, -.02, .04, 10, 7), (x, y, z) => z < -.045 ? K.shoeR : K.shoe), paint(ell(.058, .02, .132, 0, -.052, .04, 10, 5), K.sole)]);
    return (parts = { pelvis, spine, head, mouth, upper, fore, thigh, shin, shoe });
  }
  return { build, merge };
})();

// the town's asphalt / curb strips sit a little above the soil that groundY() returns (city.js strip(): +.07 / +.2)
const streetLift = (x, z) => { const inX = x > -58.5 && x < 58.5;
  if ((inX && z > -22.5 && z < -17.5) || (x > 30.5 && x < 35.5 && z > -17.5 && z < 38.5)) return .07;
  if ((inX && z > -24 && z < -22.5) || (x > -58.5 && x < 30.5 && z > -17.5 && z < -16.9) || (x > 35.5 && x < 37.4 && z > -17.5 && z < 38.5) || (x > 29.9 && x < 30.5 && z > -16.9 && z < 38.5)) return .2;
  return 0; };

// ---------- the person ----------
PREY_KINDS.human = (p, g) => {
  const G = HGEO.build(), mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: 0 }), .4);
  const batch = new LimbBatch(g, mat), J = {};
  const joint = (par, x, y, z, geo) => { const j = new THREE.Group(); j.position.set(x, y, z); par.add(j); if (geo) batch.add(j, geo); return j; };
  J.hold = joint(g, 0, 0, 0);  // pivot used when he is caught (moves his waist into the fangs)
  J.pelvis = joint(J.hold, 0, .95, 0, G.pelvis);
  J.spine = joint(J.pelvis, 0, .045, 0, G.spine);
  J.neck = joint(J.spine, 0, .485, 0, G.head);  // head pivots at the top of the neck
  J.mouth = joint(J.neck, 0, .102, .097, G.mouth);
  J.sh = []; J.el = []; J.hip = []; J.knee = []; J.ank = [];
  [1, -1].forEach(s => {  // s = +1 his left (+x), -1 his right
    J.sh.push(joint(J.spine, s * .222, .4, -.005, G.upper)); J.el.push(joint(J.sh[J.sh.length - 1], 0, -.27, 0, G.fore));
    J.hip.push(joint(J.pelvis, s * .092, -.06, 0, G.thigh)); J.knee.push(joint(J.hip[J.hip.length - 1], 0, -.43, 0, G.shin));
    J.ank.push(joint(J.knee[J.knee.length - 1], 0, -.39, 0, G.shoe));
  });
  batch.build(); p.limbs = batch;
  p.hum = { j: J, t: rand(0, 9), ph: rand(0, 6.3), v: 0, run: 0, lookT: rand(1, 3), lookD: 0, lookS: 1, look: 0, roll: 0, pf: null, holdK: 0, fl: 0 };
  p.rig = humanRig;
  p.speed = 1.4; p.run = 7.5; p.value = 55; p.vib = 1.5;  // walk ≈ 1.4, sprint ≈ 7.5 (faster than crickets)
  BLOOD.warm();  // compile the blood shaders now, not at the moment of the bite
};

// poses the body each frame: idle breathing, walk, sprint (lean, arm pump, knee lift, glance back), caught, wrapped
function humanRig(p, dt, v) {
  const H = p.hum, J = H.j, T = Math.PI * 2; H.t += dt;
  const held = !!p.held, sv = H.v = lerp(H.v, held ? 0 : v, clamp(dt * 6, 0, 1));
  const run = H.run = lerp(H.run, sstep(2.2, 5.5, sv), clamp(dt * 5, 0, 1)), mov = sstep(.05, .6, sv), pan = p.panic || 0;
  H.ph = (H.ph + dt * T * (.45 + .39 * Math.sqrt(sv)) * mov) % (T * 100);
  // --- caught: pivot so his waist is in the fangs (legs dangle), flail that weakens; silk pulls arms and legs tight
  H.holdK = lerp(H.holdK, held ? 1 : 0, clamp(dt * 8, 0, 1)); const hk = H.holdK;
  J.hold.position.set(0, -1.02 * hk, 0); J.hold.rotation.set(-.5 * hk, 0, 0);
  if (p.silk) p.silk.position.copy(J.hold.position), p.silk.rotation.copy(J.hold.rotation);
  const wrap = p.silk ? p.silk.userData.wrap || 0 : 0, fk = held ? Math.exp(-(p.heldT || 0) * .38) * (1 - sstep(0, .6, wrap)) : 0;
  H.fl += dt * (6 + 8 * fk);
  const fl = H.fl, br = Math.sin(H.t * 1.7), idle = (1 - mov) * (1 - hk);
  // --- pelvis: bob (twice per stride), hip twist, weight shift when idle, lower + tipped forward in a sprint
  const bob = mov * (.018 + .03 * run) * Math.cos(2 * H.ph) - run * .05 - (pan > .5 && sv < .3 && !held ? .12 : 0);
  J.pelvis.position.set(idle * .018 * Math.sin(H.t * .5), .95 + bob * (1 - hk), 0);
  J.pelvis.rotation.set(.12 * run * (1 - hk), -.14 * Math.sin(H.ph) * mov * (1 - .4 * run), idle * .03 * Math.sin(H.t * .5));
  // glance back over the shoulder now and then while fleeing (or look around while strolling)
  H.lookT -= dt;
  if (H.lookT < 0 && !held) { H.lookS = -H.lookS; H.lookD = pan > .5 ? .85 : 1.6; H.lookT = pan > .5 ? rand(1.6, 3.2) : rand(3, 7) + H.lookD; H.lookA = pan > .5 && sv > 2 ? 1.35 : rand(.3, .7); }
  H.lookD -= dt; const lk = H.lookD > 0 ? Math.sin(Math.PI * clamp(1 - H.lookD / (pan > .5 ? .85 : 1.6), 0, 1)) * H.lookS * (H.lookA || 1) : 0;
  H.look = lerp(H.look, lk, clamp(dt * 10, 0, 1));
  // --- torso: lean into the sprint, counter-twist to the hips, breathe; arches back when bitten
  const lean = .05 * mov + .34 * run + (pan > .5 && sv < .3 ? .25 : 0);
  const nw = 1 - sstep(0, .7, wrap);  // wrapped in silk: straight and still
  J.spine.rotation.set(((lean + .015 * br * idle) * (1 - hk) - .35 * fk * Math.sin(fl * .45) * hk) * nw, (.2 * Math.sin(H.ph) * mov + H.look * .35) * nw, 0);
  J.spine.scale.set(1 + .012 * br * idle, 1, 1 + .02 * br * idle);
  const hb = mov * (.03 + .05 * run) * Math.sin(2 * H.ph);
  J.neck.rotation.set(((-lean * .75 + hb) * (1 - hk) + hk * (-.5 * fk + .45 * (1 - fk))) * nw, (H.look + idle * .45 * Math.sin(H.t * .37) * Math.sin(H.t * .23) + hk * .6 * fk * Math.sin(fl * .6)) * nw, 0);
  // mouth: open when scared or screaming in the fangs
  const open = held ? .4 + 2.8 * fk * (.6 + .4 * Math.sin(fl * 1.3)) : pan * (1.2 + .5 * Math.sin(H.t * 9));
  J.mouth.scale.set(1 - .15 * open / 3, 1 + open, 1);
  for (let i = 0; i < 2; i++) {
    const s = i ? -1 : 1, ph = H.ph + (i ? Math.PI : 0), sw = Math.sin(ph);
    // legs: walk ↔ run blend (F = thigh swing forward, K = knee bend)
    const Fw = .42 * sw, Kw = .1 + .75 * Math.pow(Math.max(0, Math.cos(ph + .35)), 2);
    const Fr = .25 + .82 * sw, Kr = .3 + 1.6 * Math.pow(Math.max(0, Math.cos(ph + .55)), 1.4);
    let F = lerp(Fw, Fr, run) * mov, K = lerp(Kw, Kr, run) * mov + (1 - mov) * (.04 + (pan > .5 && !held ? .5 : 0));
    let hz = s * (.03 + idle * .02);
    // arms: swing against the legs (walk) / pump with bent elbows (run); arms out and hands up when cornered
    const A = -sw * lerp(.36, .95, run) * mov;
    let sx = -A - (pan > .5 && sv < .3 && !held ? .9 : 0), sz = s * (.08 + .06 * run + .02 * br * idle), ex = -(lerp(.22 + .25 * Math.max(0, A), 1.45 + .35 * A, run) * mov + (1 - mov) * (pan > .5 ? 1.6 : .15));
    if (held) { // flailing (fk → 0 as the venom works), then limp; the silk pulls them together
      const w = sstep(0, .7, wrap), q = fl + i * 2.1;
      F = lerp(F, (.45 + .55 * Math.sin(q * 1.15)) * fk + .08 * (1 - fk), hk) * (1 - w); K = lerp(K, (.5 + .7 * Math.max(0, Math.sin(q * 1.4 + 1))) * fk + .15, hk) * (1 - w);
      sx = lerp(sx, (-.8 * Math.sin(q * .95) - .6) * fk - .1, hk) * (1 - w); sz = lerp(sz, s * ((1.3 + .8 * Math.sin(q * 1.2 + s)) * fk + .25 * (1 - fk)), hk) * (1 - w) + s * .02 * w;
      ex = lerp(ex, -(.4 + .7 * Math.max(0, Math.sin(q * 1.6))) * fk - .1, hk) * (1 - w); hz = hz * (1 - w) - s * .015 * w;
    }
    J.hip[i].rotation.set(-F - .12 * run * (1 - hk), 0, hz); J.knee[i].rotation.set(K, 0, 0);
    J.ank[i].rotation.set(clamp((F - K) * .85 + .3 * run * Math.max(0, -sw), -.6, 1) + (held ? .7 * hk : 0), 0, 0);  // caught: toes hang down
    J.sh[i].rotation.set(sx, 0, sz); J.el[i].rotation.set(ex, 0, 0);
  }
  if (held) return;
  // on his feet: stay upright (no insect slope pitch / wobble from Prey.update) and lean into turns
  if (H.pf == null) H.pf = p.face;
  const turn = Math.atan2(Math.sin(p.face - H.pf), Math.cos(p.face - H.pf)) / Math.max(dt, 1e-3); H.pf = p.face;
  H.roll = lerp(H.roll, clamp(-turn * sv * .03, -.3, .3), clamp(dt * 6, 0, 1));
  p.mesh.rotation.x = 0; p.mesh.rotation.z = H.roll; p.mesh.position.y += streetLift(p.pos.x, p.pos.z) - Math.abs(Math.sin(p.walk)) * .03 * p.gaitK;
}

// speech bubbles over his head (the same style as the spider's, blue-white for him, pink + shaking when panicking)
(() => { const st = document.createElement('style');
  st.textContent = '.say.hum{background:rgba(222,240,255,.96);color:#0b2140}.say.hum::after{border-top-color:rgba(222,240,255,.96)}' +
    '.say.hum.panic{background:rgba(255,228,220,.97);color:#5a0d06;animation:humShake .12s infinite alternate}.say.hum.panic::after{border-top-color:rgba(255,228,220,.97)}' +
    '@keyframes humShake{from{margin-left:-2px}to{margin-left:2px}}';
  document.head.appendChild(st); })();
const humanSay = (() => {
  const LINES = { panic: ['ช่วยด้วย!', 'แมงมุมยักษ์!!', 'อย่ากินผมนะ!', 'หนีเร็ว!', 'แม่จ๋าาา!', 'ใครก็ได้ช่วยที!'], calm: ['เงียบจัง…', 'เมืองนี้ร้างจริง ๆ', 'ได้ยินเสียงอะไรไหม?'], caught: ['อ๊ากกก!!', 'ปล่อยผมนะ!'] };
  return (p, cat) => { const L = LINES[cat]; if (!L || (p.sayCD > 0 && cat !== 'caught')) return; p.sayCD = 2.5;
    const t = L[Math.random() * L.length | 0]; p.sayTxt = `ชัยภัทร: ${t}`; p.sayT = 2.6; p.sayCat = cat; if (cat !== 'calm') log(`<i>ชัยภัทร:</i> “${t}”`, 'say'); };
})();
const _sayV = new V3();
function preyTalk(dt) {
  prey.forEach(p => { if (p.kind !== 'human') return; p.sayCD = (p.sayCD || 0) - dt; p.sayT = (p.sayT || 0) - dt;
    let el = p.bubble; if (!el) { el = p.bubble = document.createElement('div'); el.className = 'say hum'; document.body.appendChild(el); }
    if (p.eaten) { el.remove(); return; }
    const q = p.hum ? p.hum.j.neck.getWorldPosition(_sayV) : _sayV.copy(p.mesh.position); q.y += .55; q.project(camera);
    const on = p.sayT > .2 && q.z < 1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1 && !document.body.classList.contains('noui');
    el.classList.toggle('on', on); el.classList.toggle('panic', p.sayCat !== 'calm');
    if (on) { if (el.textContent !== p.sayTxt) el.textContent = p.sayTxt; el.style.left = clamp((q.x * .5 + .5) * innerWidth, 110, innerWidth - 110) + 'px'; el.style.top = Math.max(50, (-q.y * .5 + .5) * innerHeight) + 'px'; }
  });
}

// ---------- blood + silk ----------
// droplets: ONE InstancedMesh (glossy teardrops stretched along velocity); stains: ONE InstancedMesh of splats
// (2×2 canvas atlas of ragged shapes, dark rim, wet sheen that dries darker, edges recede as they fade)
const BLOOD = (() => {
  const ND = 220, NS = 48, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), pv = new V3(), dv = new V3(), nv = new V3();
  // droplets: state in flat arrays, active ones packed at the front (mesh.count = how many)
  const DP = new Float32Array(ND * 3), DV = new Float32Array(ND * 3), DL = new Float32Array(ND), DR = new Float32Array(ND), DK = new Uint8Array(ND); let nd = 0;
  const dMat = track(new THREE.MeshPhysicalMaterial({ color: lin(0x560509), roughness: .2, metalness: 0, clearcoat: 1, clearcoatRoughness: .05 }), 1);
  const dGeo = new THREE.SphereGeometry(1, 8, 6), GP = dGeo.attributes.position;  // teardrop: round head along +y (the flight direction), thin tail behind
  for (let i = 0; i < GP.count; i++) { const y = GP.getY(i), t = y < 0 ? -y : 0, k = 1 - .55 * t; GP.setXYZ(i, GP.getX(i) * k, y < 0 ? y * 1.9 : y, GP.getZ(i) * k); }
  dGeo.computeVertexNormals();
  const drops = new THREE.InstancedMesh(dGeo, dMat, ND);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); drops.count = 0; drops.frustumCulled = false; drops.visible = false; scene.add(drops);
  // splat atlas: R = thickness (1 middle → 0 ragged edge, satellite drops, streaks), G = grain
  function atlas() {
    const S = 512, H = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'), im = g.createImageData(S, S), D = im.data;
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell & 1) * H, oy = (cell >> 1) * H, R = H * .3, sat = [];
      const lobes = [rand(0, 6), rand(0, 6), rand(0, 6)], amp = [rand(.1, .2), rand(.05, .12), rand(.03, .07)];
      for (let k = 0; k < 9 + cell * 3; k++) { const a = rand(0, 6.3), d = R * rand(1.05, 1.6); sat.push([Math.cos(a) * d, Math.sin(a) * d, R * rand(.04, .13), a]); }
      for (let k = 0; k < 3 + cell; k++) { const a = rand(0, 6.3); sat.push([Math.cos(a) * R * .9, Math.sin(a) * R * .9, R * rand(.12, .2), a, rand(1.6, 2.6)]); } // streak lobes
      for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
        const dx = x - H / 2, dy = y - H / 2, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
        const rr = R * (1 + amp[0] * Math.sin(a * 3 + lobes[0]) + amp[1] * Math.sin(a * 5 + lobes[1]) + amp[2] * Math.sin(a * 11 + lobes[2]));
        let f = 1 - r / rr;
        for (const [sx, sy, sr, sa, st] of sat) { let ex = dx - sx, ey = dy - sy;
          if (st) { const ca = Math.cos(sa), sn = Math.sin(sa), u = ex * ca + ey * sn, w = -ex * sn + ey * ca; ex = u / st; ey = w; }  // streak: long along its direction
          f = Math.max(f, (1 - Math.hypot(ex, ey) / sr) * (st ? .8 : .6)); }
        const i = ((oy + y) * S + ox + x) * 4, n = Math.random();
        D[i] = clamp(f * 1.6, 0, 1) * 255; D[i + 1] = 110 + n * 145; D[i + 2] = 255; D[i + 3] = 255; }
    }
    g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(cv); t.generateMipmaps = true; return t;
  }
  const sGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), aSt = new THREE.InstancedBufferAttribute(new Float32Array(NS * 4), 4).setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('aSt', aSt);
  const sMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, envMapIntensity: .3 });
  const sU = { tSplat: { value: null } };
  sMat.onBeforeCompile = sh => { sh.uniforms.tSplat = sU.tSplat;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aSt; varying vec2 vSUv; varying vec4 vSt;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSUv = (uv + aSt.xy) * .5; vSt = aSt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tSplat; varying vec2 vSUv; varying vec4 vSt;')
      .replace('#include <map_fragment>', `vec4 sp = texture2D(tSplat, vSUv); float th = .06 + .5 * vSt.z, e = sp.r - th, wet = vSt.w;  // vSt.z = fade (edges recede), vSt.w = wetness
        float cov = smoothstep(0., .04, e), ring = smoothstep(0., .025, e) * (1. - smoothstep(.03, .13, e));  // dark ring at the edge (coffee-ring)
        vec3 fresh = vec3(.03, .001, .0015), dry = vec3(.0075, .0018, .0014);
        diffuseColor.rgb = mix(dry, fresh, wet) * mix(1.15, .6, smoothstep(.04, .5, e)) * (1. - .6 * ring) * (.8 + .4 * sp.g);
        diffuseColor.a = cov * mix(.75, .97, smoothstep(0., .25, e)) * mix(.94, 1., wet) * (1. - smoothstep(.75, 1., vSt.z));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(.9, .16, wet * smoothstep(.02, .3, e));'); };
  const stains = new THREE.InstancedMesh(sGeo, sMat, NS); stains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stains.count = 0; stains.frustumCulled = false; stains.visible = false; stains.receiveShadow = true; stains.renderOrder = 1; scene.add(stains);
  // stain state: x y z, size (now / target), life, age, cell, rotation, ground normal
  const ST = []; for (let i = 0; i < NS; i++) ST.push({ x: 0, y: 0, z: 0, s: 0, s1: 0, L: 1, t: 0, cell: 0, rot: 0, nx: 0, ny: 1, nz: 0 }); let ns = 0;
  const q2 = new THREE.Quaternion();
  const setStain = i => { const s = ST[i]; nv.set(s.nx, s.ny, s.nz); q.setFromUnitVectors(UP, nv).multiply(q2.setFromAxisAngle(UP, s.rot));  // lie on the slope, random spin
    sc.set(s.s, 1, s.s); dv.set(s.x, s.y, s.z); m4.compose(dv, q, sc); stains.setMatrixAt(i, m4); };
  // ground normal without allocating (same as groundN)
  const gN = (x, z) => { const e = .15; return nv.set(groundY(x - e, z) - groundY(x + e, z), 2 * e, groundY(x, z - e) - groundY(x, z + e)).normalize(); };
  function addStain(x, z, size, life) {
    if (!sU.tSplat.value) sU.tSplat.value = atlas();
    const i = ns < NS ? ns++ : ST.reduce((b, s, k) => s.t / s.L > ST[b].t / ST[b].L ? k : b, 0), s = ST[i];  // full: reuse the most faded
    gN(x, z); s.nx = nv.x; s.ny = nv.y; s.nz = nv.z; s.x = x; s.z = z; s.y = groundY(x, z) + streetLift(x, z) + .02; s.s1 = size; s.s = size * .3; s.t = 0; s.L = life; s.cell = Math.random() * 4 | 0; s.rot = rand(0, 6.3);
    stains.visible = true; return s; }
  const kill = (A, n, i, w) => { for (let k = 0; k < w; k++) A[i * w + k] = A[(n - 1) * w + k]; };
  function shoot(x, y, z, vx, vy, vz, r, kind) { if (nd >= ND) return; const i = nd++;
    DP[i * 3] = x; DP[i * 3 + 1] = y; DP[i * 3 + 2] = z; DV[i * 3] = vx; DV[i * 3 + 1] = vy; DV[i * 3 + 2] = vz; DL[i] = 3; DR[i] = r; DK[i] = kind; drops.visible = true; }
  let warm = 0, cocoonMats = null;
  const api = {
    // compile the shaders while nothing is shown yet (called when a person is created)
    warm() { warm = 2; drops.visible = stains.visible = true; if (!sU.tSplat.value) sU.tSplat.value = atlas(); },
    splash(pos, n) { n = n || 40;
      for (let k = 0; k < n; k++) { const a = rand(0, 6.3), up = rand(.2, 1.3), sp = rand(2.5, 7.5), big = Math.random();
        shoot(pos.x, pos.y, pos.z, Math.cos(a) * sp, up * sp * .8 + 1.5, Math.sin(a) * sp, big < .06 ? rand(.045, .06) : big < .3 ? rand(.03, .045) : rand(.012, .028), 0); }
      for (let k = 0; k < n * .6; k++) { const a = rand(0, 6.3), sp = rand(8, 13);  // fine fast spray
        shoot(pos.x, pos.y, pos.z, Math.cos(a) * sp, rand(.5, 5), Math.sin(a) * sp, rand(.012, .022), 0); } },
    drip(pos) { shoot(pos.x, pos.y, pos.z, rand(-.15, .15), -rand(.2, .6), rand(-.15, .15), rand(.03, .045), 1); },
    stain(pos, size) { addStain(pos.x, pos.z, size, 40 + 20 * Math.min(size, 1)); },
    // silk cocoon: translucent body-shaped shell + criss-crossing strands. game.js calls .scale.setScalar(.2 → 1): that value
    // becomes "how far wrapped" (strands appear one by one, the shell spreads from the waist); the real scale stays 1
    cocoon(p) {
      if (!cocoonMats) cocoonMats = makeCocoonMats();
      const g = new THREE.Group(), shell = new THREE.Mesh(cocoonGeo().shell, cocoonMats[0]), str = new THREE.Mesh(cocoonGeo().strands, cocoonMats[1]);
      shell.renderOrder = 2;  // no shadow pass: the body inside already casts one
      str.renderOrder = 3; g.add(shell, str); p.mesh.add(g);
      g.userData.wrap = 0; const U = cocoonMats.U;
      g.scale.setScalar = s => { g.userData.wrap = clamp((s - .2) / .8, 0, 1); U.uWrap.value = g.userData.wrap; return g.scale; };
      return g; },
    update(dt) {
      if (warm > 0 && --warm === 0) { drops.visible = nd > 0; stains.visible = ns > 0; }
      // droplets: gravity + a little drag, stretched along their speed; land → maybe a splat, drips feed a pool
      for (let i = nd - 1; i >= 0; i--) {
        const o = i * 3; DL[i] -= dt; DV[o + 1] -= 18 * dt; const dr = Math.exp(-dt * .6); DV[o] *= dr; DV[o + 2] *= dr;
        DP[o] += DV[o] * dt; DP[o + 1] += DV[o + 1] * dt; DP[o + 2] += DV[o + 2] * dt;
        const gy = groundY(DP[o], DP[o + 2]) + streetLift(DP[o], DP[o + 2]);
        if (DP[o + 1] < gy || DL[i] <= 0) {
          if (DP[o + 1] < gy + .3) {
            if (DK[i] === 1) { let best = null; for (let k = 0; k < ns; k++) { const s = ST[k]; if (s.t < s.L * .8 && Math.hypot(s.x - DP[o], s.z - DP[o + 2]) < Math.max(.3, s.s1 * .5)) { best = s; break; } }
              if (best) { best.s1 = Math.min(best.s1 + .025, 1.3); best.t = Math.min(best.t, 2); } else addStain(DP[o], DP[o + 2], rand(.14, .22), 30); }
            else if (DR[i] > .03 && Math.random() < .5) addStain(DP[o], DP[o + 2], DR[i] * rand(2.5, 4.5), rand(25, 45)); }
          nd--; kill(DP, nd + 1, i, 3); kill(DV, nd + 1, i, 3); DL[i] = DL[nd]; DR[i] = DR[nd]; DK[i] = DK[nd]; continue; }
      }
      for (let i = 0; i < nd; i++) { const o = i * 3; dv.set(DV[o], DV[o + 1], DV[o + 2]); const sp = dv.length();
        if (sp > 1e-3) q.setFromUnitVectors(UP, dv.multiplyScalar(1 / sp)); const r = DR[i];
        sc.set(r * (1 - Math.min(sp * .03, .4)), r * (1 + Math.min(sp * .12, 1.6)), r * (1 - Math.min(sp * .03, .4)));
        pv.set(DP[o], DP[o + 1], DP[o + 2]); m4.compose(pv, q, sc); drops.setMatrixAt(i, m4); }
      drops.count = nd; if (warm <= 0) drops.visible = nd > 0; drops.instanceMatrix.needsUpdate = true;
      // stains: spread out fast, stay wet ~10 s (glossy red) then dry darker, edges recede and fade near the end of life
      for (let i = ns - 1; i >= 0; i--) { const s = ST[i]; s.t += dt;
        if (s.t >= s.L) { ns--; const e = ST[ns]; ST[ns] = s; ST[i] = e; if (i < ns) setStain(i); continue; }
        if (s.s < s.s1) { s.s = Math.min(s.s1, s.s + (s.s1 - s.s) * Math.min(1, dt * 5) + dt * .05); setStain(i); } }
      for (let i = 0; i < ns; i++) { const s = ST[i]; aSt.setXYZW(i, s.cell & 1, s.cell >> 1, sstep(s.L * .55, s.L, s.t), Math.exp(-s.t / 11)); }
      stains.count = ns; if (warm <= 0) stains.visible = ns > 0; stains.instanceMatrix.needsUpdate = true; aSt.needsUpdate = true;
    },
  };
  // --- cocoon geometry (built once): body-shaped lathe with wound ridges + 24 strands (tubes), in his standing frame
  let CG = null;
  const prof = y => { const K = [[-.04, .03], [0, .14], [.12, .15], [.4, .17], [.62, .2], [.78, .28], [.95, .29], [1.1, .27], [1.3, .31], [1.42, .31], [1.5, .22], [1.55, .14], [1.62, .16], [1.7, .165], [1.8, .14], [1.88, .03]];
    for (let i = 1; i < K.length; i++) if (y <= K[i][0]) { const t = (y - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return lerp(K[i - 1][1], K[i][1], sstep(0, 1, t)); } return .02; };
  const NSTR = 24;
  function cocoonGeo() {
    if (CG) return CG;
    const pts = []; for (let k = 0; k <= 48; k++) { const y = -.04 + k / 48 * 1.91; pts.push(new V2(Math.max(.002, prof(y)), y)); }
    const shell = new THREE.LatheGeometry(pts, 20), P = shell.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(x, z), r = Math.hypot(x, z);
      const rr = r * (1 + .07 * Math.sin(a * 2 + y * 26) + .04 * Math.sin(-a * 3 + y * 41)); P.setXYZ(i, Math.sin(a) * rr, y, Math.cos(a) * rr * .95 - .02); }
    shell.computeVertexNormals();
    const list = [];
    for (let s = 0; s < NSTR; s++) { const band = s % 4 === 3, y0 = band ? rand(.1, 1.3) : rand(-.04, .5), y1 = band ? y0 + rand(.15, .35) : rand(1.25, 1.87), a0 = rand(0, 6.3),
        turns = (band ? rand(1.6, 2.6) : rand(.5, 1.3)) * (s % 2 ? 1 : -1), cp = [];
      for (let k = 0; k <= 36; k++) { const t = k / 36, y = lerp(y0, y1, t) + .06 * Math.sin(t * 9 + s), a = a0 + turns * 6.283 * t, r = prof(y) + .012 + .01 * Math.sin(t * 17 + s * 3);
        cp.push(new V3(Math.sin(a) * r, y, Math.cos(a) * r * .95 - .02)); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cp), 40, rand(.004, .009), 3, false), uv = tg.attributes.uv, at = new Float32Array(uv.count);
      for (let i = 0; i < uv.count; i++) at[i] = (s + uv.getX(i)) / NSTR;  // reveal order: strand by strand, along each strand
      tg.setAttribute('aT', new THREE.BufferAttribute(at, 1)); list.push(tg); }
    return (CG = { shell, strands: HGEO.merge(list, ['position', 'normal', 'aT']) });
  }
  // silk texture: pale threads criss-crossing (alpha = gaps where he shows through faintly)
  function makeCocoonMats() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = 'rgba(236,232,222,.8)'; g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 260; k++) { const y = rand(-40, 296), sl = rand(-.9, .9), w = rand(.6, 2.4); g.strokeStyle = `rgba(${Math.random() < .7 ? '255,255,255' : '150,142,128'},${rand(.3, .9)})`; g.lineWidth = w;
      g.beginPath(); for (let x = -256; x <= 512; x += 32) g.lineTo(x, y + sl * x + Math.sin(x * .05 + k) * 4); g.stroke();
      g.beginPath(); for (let x = -256; x <= 512; x += 32) g.lineTo(x, y + 256 + sl * x + Math.sin(x * .05 + k) * 4); g.stroke(); }
    const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(2, 3);
    const U = { uWrap: { value: 0 } };
    const shell = track(new THREE.MeshStandardMaterial({ color: 0xd6d0c4, map: tex, transparent: true, roughness: .6, emissive: lin(0x121110), side: THREE.FrontSide }), .6);
    shell.onBeforeCompile = sh => { sh.uniforms.uWrap = U.uWrap;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWrap; varying vec3 vP;')
        .replace('#include <alphatest_fragment>', `float reach = abs(vP.y - .95) / .95; if (reach > uWrap * 1.5 - .1) discard; diffuseColor.a *= smoothstep(.1, .8, uWrap) * .9 + .1;
          float bl = sin(vP.x * 13. + vP.y * 5.) * sin(vP.y * 9. + vP.z * 11.) * sin(vP.z * 12. - vP.x * 7. + vP.y * 4.);  // blood soaking through where he was bitten
          bl = smoothstep(.12, .4, bl) * smoothstep(1.7, 1.4, vP.y) * smoothstep(1., 1.2, vP.y) * step(0., vP.z + .05);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.08, .004, .006), bl * .85); diffuseColor.a = max(diffuseColor.a, bl * .9);`); };
    const strands = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .35, transparent: true, emissive: lin(0x121212), opacity: .8 }), .8);
    strands.onBeforeCompile = sh => { sh.uniforms.uWrap = U.uWrap;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aT; varying float vT;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = aT;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWrap; varying float vT;')
        .replace('#include <alphatest_fragment>', 'if (vT > uWrap * 1.03) discard;'); };
    const M = [shell, strands]; M.U = U; return M;
  }
  return api;
})();
