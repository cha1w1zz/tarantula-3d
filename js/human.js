'use strict';
/* =====================================================================
   ชัยภัทร: a person-sized prey (town scale: a storey ≈ 3, a person ≈ 1.7) + his speech bubble, and the blood / silk FX.
   Loaded after prey.js, before game.js. API used by prey.js / game.js:
     PREY_KINDS.human(p, g)   build the model into g; sets p.rig(p, dt, v) (poses limbs each frame), p.limbs, speed/value/vib
     humanSay(p, cat)         line over his head ('panic' | 'calm' | 'caught')
     preyTalk(dt)             moves the bubbles (called from game.js loop)
     BLOOD.splash(pos, n) / BLOOD.drip(pos) / BLOOD.stain(pos, size) / BLOOD.cocoon(p) → mesh / BLOOD.update(dt)
   Look (ชัยภัทร, 178 cm): slim young Thai man, black curtain-fringe hair (middle part), red graduation gown (open front, wide
   sleeves with black + gold cuffs, gold front bands, small gold pin), white shirt, black trousers, dark shoes.
   ONE mesh per person: every part hangs on a joint (LimbBatch). HUMAN_GLASSES = thin black rectangular glasses.
   ===================================================================== */
const HUMAN_GLASSES = false;
const HUM_PY = 1.01;   // pelvis joint height when standing (legs .45 + .43 + foot): head top ≈ 1.78

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
  const bx = (sx, sy, sz, x, y, z, col) => paint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z), col);
  // limb hanging DOWN from its joint: radius r0 → r1, rounded ends
  function capsule(r0, r1, len, seg = 8) { const pts = [];
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i / 3 * Math.PI / 2; pts.push(new V2(Math.max(1e-4, Math.cos(a) * r1), -len + Math.sin(a) * r1)); }
    for (let i = 0; i <= 3; i++) { const a = i / 3 * Math.PI / 2; pts.push(new V2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0)); }
    return new THREE.LatheGeometry(pts, seg); }
  // lathe through [radius, y] points, squashed front-to-back by sz; optional open front (gap = half-angle of the opening)
  const lathe = (keys, sz, seg = 12, gap = 0) => new THREE.LatheGeometry(keys.map(([r, y]) => new V2(Math.max(1e-4, r), y)), seg, gap, Math.PI * 2 - 2 * gap).scale(1, 1, sz);
  const PAL = { skin: 0xd9a47c, skinD: 0xbd8763, hair: 0x0c0908, gown: 0xb8141b, gownD: 0x86100f, gold: 0xe2ad35, band: 0x121010, shirt: 0xf2f0ea,
    pant: 0x16161a, pantL: 0x24242a, shoe: 0x1a1614, sole: 0x2e2825, eyeW: 0xe6e0d6, eye: 0x0f0a08, brow: 0x120d0b, lip: 0x9c5c50, mouth: 0x4a1714 };
  // widen the shoulders of a torso lathe (a V shape instead of a barrel)
  const broad = g => { const P = g.attributes.position; for (let i = 0; i < P.count; i++) P.setX(i, P.getX(i) * (1 + .1 * sstep(.18, .38, P.getY(i)) - .04 * sstep(.2, 0, P.getY(i)))); g.computeVertexNormals(); return g; };
  // gown edge: gold facing within `w` radians of the front opening
  const edgeCol = (gap, w, x, z, base) => { const a = Math.abs(Math.atan2(x, z)); return a < gap + w ? PAL.gold : base; };
  let parts = null;
  // head (medium poly) for either person: o.hair 'curtain' (ชัยภัทร) | 'spiky' (ตุ้ย: short, messy spiky top, short sides), o.skin tones
  function headGeo(o) { const K = Object.assign({}, PAL, o.pal || {}), spiky = o.hair === 'spiky';
    // head (medium poly): slim oval face, defined jaw + cheekbones; black hair = the shell pushed out above the hairline:
    // thick on top, a middle-parted curtain fringe over the forehead, short at the sides and back
    const hg = new THREE.SphereGeometry(1, 44, 26), HP = hg.attributes.position, hairK = new Float32Array(HP.count);
    for (let i = 0; i < HP.count; i++) { let x = HP.getX(i), y = HP.getY(i), z = HP.getZ(i); const ax = Math.abs(x);
      const front = sstep(.05, .55, z), back = sstep(0, -.5, z);
      const fr = spiky ? .5 + .06 * Math.sin(x * 23) - .08 * sstep(.4, .75, ax) : .22 + .46 * Math.exp(-((x / .3) ** 2)) - .05 * sstep(.35, .7, ax);                       // fringe edge: low over the brows, lifted at the part
      const line = lerp(lerp(.3, -.5, back), fr, front) + (ax > .8 && z > -.3 ? .05 : 0);               // hairline: fringe / above the ear / nape
      const k = sstep(line - .05, line + .05, y) * (y > -.7 ? 1 : 0);
      const part = spiky ? 1 : 1 - .75 * Math.exp(-((x / .09) ** 2)) * sstep(.2, .6, z) * sstep(.3, .75, y);            // the parting line
      const tuft = spiky ? .1 * Math.max(0, Math.sin(Math.atan2(x, z) * 8 + y * 11) * Math.sin(x * 14 + z * 10 + 1)) * sstep(.35, .95, y) + .03 * Math.sin(Math.atan2(x, z) * 17) * sstep(.2, .8, y)
        : .035 * Math.sin(Math.atan2(x, z) * 9 + y * 7) * sstep(.25, .9, y);
      const th = spiky ? (.025 + .12 * sstep(.2, .95, y) + .04 * front * sstep(.35, .7, y) + tuft) - .015 * sstep(.6, .95, ax) * sstep(.5, 0, y)
        : (.05 + .16 * sstep(.15, .95, y) + .05 * front * sstep(.2, .6, y) + tuft) * part - .025 * sstep(.6, .95, ax) * sstep(.5, 0, y);
      // face shaping (skin only): narrow jaw + chin, cheekbones, flatter face, rounder back of the head
      if (y < -.05 && z > -.3) { const j = sstep(-.05, -.95, y); x *= 1 - .3 * j; z *= 1 + .06 * j * sstep(0, .6, z); }
      x *= 1 + .06 * Math.exp(-(((y + .02) / .2) ** 2)) * sstep(0, .5, z);
      if (z < 0) z *= 1.06;
      const r = 1 + k * th; HP.setXYZ(i, x * r, y * r, z * r); hairK[i] = k; }
    hg.computeVertexNormals(); hg.scale(.086, .112, .098).translate(0, .135, .012);
    const cH = new THREE.Color(K.hair), cS = new THREE.Color(K.skin), cJ = new THREE.Color(K.jaw || 0xcd9771); let hi = 0;   // soft hairline: blend, no stair steps
    paint(hg, (x, y, z) => (y < .052 ? cJ : cS).clone().lerp(cH, sstep(.2, .8, hairK[hi++])));
    // face: straight dark brows, monolid eyes (white + dark iris + lash line), small nose, ears
    const EY = .141, eyes = [-1, 1].map(s => [paint(ell(.0165, .0068, .006, s * .033, EY, .1, 10, 6), K.eyeW), paint(ell(.0072, .0068, .004, s * .033, EY - .0005, .1045, 8, 6), K.eye),
      bx(.036, .0035, .006, s * .033, EY + .0068, .1015, K.brow).rotateZ(0)]).flat();
    const brows = [-1, 1].map(s => bx(.036, .0075, .01, s * .035, .162, .1, K.brow));
    const nose = paint(ell(.0085 * (o.noseW || 1), .016, .011, 0, .121, .104, 8, 6), K.nose || 0xcf9a74), ears = [-1, 1].map(s => paint(ell(.012, .026, .016, s * .088, .133, .004, 6, 5), K.skinD));
    const lips = paint(ell(.02, .0045, .006, 0, .082, .097, 8, 5), K.lip);
    const glass = !HUMAN_GLASSES ? [] : [-1, 1].map(s => [bx(.034, .003, .004, s * .035, EY + .014, .112, K.band), bx(.034, .003, .004, s * .035, EY - .012, .112, K.band),
      bx(.003, .026, .004, s * .052, EY + .001, .11, K.band), bx(.003, .026, .004, s * .018, EY + .001, .113, K.band), bx(.003, .003, .1, s * .086, EY + .012, .06, K.band)]).flat()
      .concat([bx(.016, .003, .004, 0, EY + .01, .114, K.band)]);
    return merge([hg, ...eyes, ...brows, nose, ...ears, lips, ...glass]); }
  // all part geometries are built once and shared (LimbBatch only reads them)
  function build() {
    if (parts) return parts; const K = PAL;
    // hips (black trousers), hangs from the pelvis joint; the gown's skirt: upper half on the pelvis, the hem on its own swaying joint
    const G0 = .42, skirtCol = (x, y, z) => edgeCol(G0, .2, x, z, K.gown);
    const pelvis = merge([paint(ell(.145, .115, .1, 0, -.03, 0, 12, 8), K.pant),
      paint(lathe([[.165, .02], [.2, -.15], [.232, -.3]], .82, 26, G0), skirtCol)]);
    const hem = paint(lathe([[.232, .005], [.262, -.16], [.292, -.31], [.285, -.325]], .82, 26, G0), (x, y, z) => y < -.3 ? K.gownD : skirtCol(x, y, z));
    // gown body (open over the white shirt), gold facings with a black stripe, yoke band round the neck, small gold pin
    const torso = paint(broad(lathe([[0, -.075], [.14, -.07], [.158, -.03], [.162, .1], [.168, .22], [.182, .32], [.18, .38], [.155, .425], [.09, .455], [.045, .468], [0, .47]], .68, 32)),
      (x, y, z) => y < -.035 ? K.gownD : (z > 0 && Math.abs(x) < .05) ? K.shirt : K.gown);
    const fac = [-1, 1].map(s => [bx(.044, .5, .012, 0, 0, 0, K.gold).rotateY(s * .38).translate(s * .07, .185, .108),
      bx(.008, .5, .006, 0, 0, 0, K.band).rotateY(s * .38).translate(s * .073, .185, .116)]).flat();
    const yoke = paint(new THREE.TorusGeometry(.078, .02, 6, 18).rotateX(Math.PI / 2).scale(1.15, 1, 1).translate(0, .44, -.005), K.gold);
    const collar = paint(new THREE.TorusGeometry(.052, .013, 6, 16).rotateX(Math.PI / 2 - .25).translate(0, .468, .008), K.shirt);
    const pin = paint(ell(.013, .013, .006, .112, .335, .097, 8, 6), K.gold);
    const neck = paint(new THREE.CylinderGeometry(.043, .048, .1, 10).translate(0, .47, 0), K.skinD);
    const spine = merge([torso, ...fac, yoke, collar, pin, neck]);
    const head = headGeo({});  // pivot = neck top
    const mouth = paint(ell(.017, .006, .006, 0, 0, 0, 8, 5), K.mouth);
    // arms: gown sleeves (wide bell below the elbow, black + gold stripes at the cuff), hands
    const upper = paint(capsule(.056, .052, .27), K.gown);
    const fore = merge([paint(lathe([[.058, .02], [.068, -.08], [.09, -.185], [.092, -.186], [.097, -.205], [.0975, -.206], [.101, -.222], [.1015, -.223], [.108, -.255], [.104, -.262]], 1, 16),
      (x, y) => y > -.1855 ? K.gown : y > -.2055 ? K.gold : y > -.2225 ? K.band : K.gold), paint(ell(.026, .066, .042, 0, -.3, .006, 8, 6), K.skin),
      paint(capsule(.034, .03, .14, 6).translate(0, -.12, 0), K.shirt)]);
    // legs: black trousers, dark shoes
    const thigh = paint(capsule(.085, .065, .45, 10), K.pant);
    const shin = paint(capsule(.065, .049, .43, 10), (x, y) => y < -.39 ? K.pantL : K.pant);
    const shoe = merge([paint(ell(.05, .042, .125, 0, -.022, .04, 10, 7), K.shoe), paint(ell(.054, .018, .128, 0, -.054, .04, 10, 5), K.sole)]);
    return (parts = { pelvis, hem, spine, head, mouth, upper, fore, thigh, shin, shoe });
  }
  // ตุ้ย (170 cm, slim, narrow shoulders): short-sleeve white-blue Thai school shirt (collar, buttons, pocket on his left,
  // emblem + blue name on his right chest), black-navy trousers, black sneakers
  let tui = null;
  function buildTui() {
    if (tui) return tui; const K = Object.assign({}, PAL, { skin: 0xc28a62, skinD: 0xa87450, shirt: 0xdfe6f2, shirtD: 0xc4cde0, pant: 0x16171f, pantL: 0x20222c, shoe: 0x121214, sole: 0x2a2a2e, lip: 0x9a5a52 });
    const pelvis = merge([paint(ell(.135, .11, .095, 0, -.03, 0, 12, 8), K.pant), paint(new THREE.TorusGeometry(.128, .012, 5, 20).rotateX(Math.PI / 2).scale(1, 1, .72).translate(0, .035, 0), 0x0c0c0e)]);
    const torso = paint(lathe([[0, -.075], [.128, -.07], [.142, -.03], [.145, .1], [.15, .22], [.16, .32], [.158, .38], [.138, .425], [.08, .455], [.042, .468], [0, .47]], .66, 28),
      (x, y, z) => y < -.035 ? K.shirtD : K.shirt);
    const btn = [.05, .14, .23, .32].map(y => paint(ell(.007, .007, .004, 0, y, .104, 6, 4), 0xf4f4f6));
    const placket = bx(.018, .5, .004, 0, .2, .101, K.shirtD);
    const pocket = bx(.075, .085, .006, .062, .26, .098, K.shirtD), emblem = paint(ell(.016, .019, .005, -.062, .325, .1, 8, 6), 0xc9a23a), name = bx(.06, .012, .005, -.066, .295, .1, 0x2849a8);
    const collar = [-1, 1].map(s => bx(.07, .045, .01, 0, 0, 0, K.shirt).rotateZ(s * .55).rotateY(s * .5).translate(s * .045, .445, .06));
    const neck = paint(new THREE.CylinderGeometry(.04, .045, .1, 10).translate(0, .47, 0), K.skinD);
    const spine = merge([torso, ...btn, placket, pocket, emblem, name, ...collar, neck]);
    const head = headGeo({ hair: 'spiky', pal: { skin: K.skin, skinD: K.skinD, lip: K.lip, jaw: 0xb88158, nose: 0xbb8660 }, noseW: 1.25 });
    const mouth = paint(ell(.017, .006, .006, 0, 0, 0, 8, 5), K.mouth);
    const upper = merge([paint(lathe([[.064, .03], [.068, -.05], [.066, -.15], [.062, -.152]], 1, 12), K.shirt), paint(capsule(.042, .038, .27), K.skin)]);
    const fore = merge([paint(capsule(.036, .03, .23, 8), K.skin), paint(ell(.026, .064, .04, 0, -.29, .006, 8, 6), K.skin)]);
    const thigh = paint(capsule(.078, .06, .45, 10), K.pant);
    const shin = paint(capsule(.06, .046, .43, 10), K.pant);
    const shoe = merge([paint(ell(.05, .044, .125, 0, -.022, .04, 10, 7), K.shoe), paint(ell(.054, .02, .128, 0, -.056, .04, 10, 5), K.sole)]);
    return (tui = { pelvis, hem: null, spine, head, mouth, upper, fore, thigh, shin, shoe });
  }
  return { build: who => who === 'tui' ? buildTui() : build(), merge };
})();

// the town's asphalt / curb strips sit a little above the soil that groundY() returns (city.js strip(): +.07 / +.2)
const streetLift = (x, z) => { const inX = x > -58.5 && x < 58.5;
  if ((inX && z > -22.5 && z < -17.5) || (x > 30.5 && x < 35.5 && z > -17.5 && z < 38.5)) return .07;
  if ((inX && z > -24 && z < -22.5) || (x > -58.5 && x < 30.5 && z > -17.5 && z < -16.9) || (x > 35.5 && x < 37.4 && z > -17.5 && z < 38.5) || (x > 29.9 && x < 30.5 && z > -16.9 && z < 38.5)) return .2;
  return 0; };

// ---------- the person ----------
PREY_KINDS.human = (p, g) => {
  const G = HGEO.build(p.who), mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72, metalness: 0, side: THREE.DoubleSide }), .4);   // double-sided: open gown + sleeves
  const batch = new LimbBatch(g, mat), J = {};
  const joint = (par, x, y, z, geo) => { const j = new THREE.Group(); j.position.set(x, y, z); par.add(j); if (geo) batch.add(j, geo); return j; };
  J.hold = joint(g, 0, 0, 0);  // pivot used when he is caught (moves his waist into the fangs)
  J.pelvis = joint(J.hold, 0, HUM_PY, 0, G.pelvis); if (p.who === 'tui') J.hold.scale.setScalar(1.70 / 1.78);   // ตุ้ย is 170 cm
  J.hem = joint(J.pelvis, 0, -.3, 0, G.hem);  // lower gown: sways and flares back when he runs
  J.spine = joint(J.pelvis, 0, .045, 0, G.spine);
  J.neck = joint(J.spine, 0, .455, 0, G.head);  // head pivots at the top of the neck
  J.mouth = joint(J.neck, 0, .082, .097, G.mouth);
  J.sh = []; J.el = []; J.hip = []; J.knee = []; J.ank = [];
  [1, -1].forEach(s => {  // s = +1 his left (+x), -1 his right
    J.sh.push(joint(J.spine, s * .195, .395, -.005, G.upper)); J.el.push(joint(J.sh[J.sh.length - 1], 0, -.27, 0, G.fore));
    J.hip.push(joint(J.pelvis, s * .085, -.06, 0, G.thigh)); J.knee.push(joint(J.hip[J.hip.length - 1], 0, -.45, 0, G.shin));
    J.ank.push(joint(J.knee[J.knee.length - 1], 0, -.43, 0, G.shoe));
  });
  // snack in his right hand (onigiri: white rice, nori band), part of the same batched mesh; shrunk to nothing unless he is eating
  const fg = new THREE.CylinderGeometry(.05, .05, .032, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), fp = fg.attributes.position, fc = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i++) fc.set(fp.getY(i) < -.012 ? [.02, .03, .02] : [.9, .88, .82], i * 3);
  fg.setAttribute('color', new THREE.BufferAttribute(fc, 3)); fg.deleteAttribute('uv');
  J.food = joint(J.el[1], 0, -.3, .05, fg); J.food.scale.setScalar(.001);
  batch.build(); p.limbs = batch;
  p.hum = { j: J, t: rand(0, 9), ph: rand(0, 6.3), v: 0, run: 0, lookT: rand(1, 3), lookD: 0, lookS: 1, look: 0, roll: 0, pf: null, holdK: 0, fl: 0 };
  p.rig = humanRig;
  p.speed = 1.4; p.run = HUM.sprint; p.value = typeof CHASE !== 'undefined' ? CHASE.meal : 24; p.vib = .45;  // walk ≈ 1.4, sprint ≈ 9.5 (js/survive.js drives him)
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
  J.pelvis.position.set(idle * .018 * Math.sin(H.t * .5), HUM_PY + bob * (1 - hk), 0);
  // gown hem: swings with the stride, flares back in a sprint, hangs straight when he is caught
  J.hem.rotation.set(-(.32 * run + .07 * mov * Math.sin(2 * H.ph) + .05 * sstep(1, 6, sv)) * (1 - hk) + .15 * hk, 0, .06 * Math.sin(H.ph) * mov * (1 - hk));
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
  J.mouth.scale.set(1 - .15 * open / 3, 1 + open * 1.3, 1);
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
  // eating (snack to mouth ~0.8 s a bite, chew nod, glance round between bites) / drinking at the pond (crouch, cupped hands to mouth)
  const act = !held && p.acting; H.actK = lerp(H.actK || 0, act ? 1 : 0, clamp(dt * 6, 0, 1)); const ak = H.actK;
  J.food.scale.setScalar(act === 'eat' && ak > .4 ? 1 : .001);
  if (act) { H.act = act; H.actT = (H.actT || 0) + dt; } else H.actT = 0;
  if (ak > .01) { const nv = p.nervous || 0, L = (x, a) => x + (a - x) * ak;
    if (H.act === 'eat') { const per = .8 * (1 - .3 * nv), c = (H.actT % per) / per, b = sstep(.15, .45, c) * (1 - sstep(.55, .85, c));   // b: 1 = snack at the mouth
      const g = (1 - b) * Math.sin(H.actT * (2.2 + 2 * nv)) * (.5 + .4 * nv);   // glance around between bites
      J.sh[1].rotation.set(L(J.sh[1].rotation.x, -.35 - .85 * b), 0, L(J.sh[1].rotation.z, .22 + .22 * b)); J.el[1].rotation.x = L(J.el[1].rotation.x, -1.3 - 1.3 * b);
      J.sh[0].rotation.set(L(J.sh[0].rotation.x, -.25), 0, L(J.sh[0].rotation.z, -.1)); J.el[0].rotation.x = L(J.el[0].rotation.x, -1.1);
      J.neck.rotation.x = L(J.neck.rotation.x, .1 * b + .06 * Math.max(0, Math.sin(H.actT * 11)) * (1 - b)); J.neck.rotation.y = L(J.neck.rotation.y, g);
    } else { const c = (H.actT % 1.1) / 1.1, b = sstep(.3, .6, c) * (1 - sstep(.75, .95, c));   // scoop low, lift to the mouth
      J.pelvis.position.y = L(J.pelvis.position.y, HUM_PY - .42); J.spine.rotation.x = L(J.spine.rotation.x, .45 - .2 * b);
      for (let i = 0; i < 2; i++) { J.hip[i].rotation.x = L(J.hip[i].rotation.x, -1.45); J.knee[i].rotation.x = L(J.knee[i].rotation.x, 2.3); J.ank[i].rotation.x = L(J.ank[i].rotation.x, -.75);
        J.sh[i].rotation.set(L(J.sh[i].rotation.x, -1 + .5 * b), 0, L(J.sh[i].rotation.z, (i ? .3 : -.3))); J.el[i].rotation.x = L(J.el[i].rotation.x, -.5 - 1.7 * b); }
      J.neck.rotation.x = L(J.neck.rotation.x, .15 - .1 * b); J.neck.rotation.y = L(J.neck.rotation.y, 0); } }
  // ตุ้ย waiting in cover: arms crossed (like his photo)
  const cross = p.who === 'tui' && !held && !act && pan < .3 && sv < .25 && (!p.ai || ['hide', 'wait', 'peek'].includes(p.ai.st));
  H.crossK = lerp(H.crossK || 0, cross ? 1 : 0, clamp(dt * 4, 0, 1));
  if (H.crossK > .01) { const c = H.crossK, L = (x, a) => x + (a - x) * c;
    for (let i = 0; i < 2; i++) { const s = i ? -1 : 1; J.sh[i].rotation.set(L(J.sh[i].rotation.x, -.3), L(J.sh[i].rotation.y, -s * .75), L(J.sh[i].rotation.z, -s * .12)); J.el[i].rotation.x = L(J.el[i].rotation.x, i ? -1.95 : -1.75); } }
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
    '.say.hum.panic{background:rgba(255,228,220,.97);color:#5a0d06}.say.hum.panic::after{border-top-color:rgba(255,228,220,.97)}';
  document.head.appendChild(st); })();
const humanSay = (() => {
  const LINES = { panic: ['ช่วยด้วย!', 'แมงมุมยักษ์!!', 'อย่ากินผมนะ!', 'หนีเร็ว!', 'แม่จ๋าาา!', 'ใครก็ได้ช่วยที!'], calm: ['เงียบจัง…', 'เมืองนี้ร้างจริง ๆ', 'ได้ยินเสียงอะไรไหม?'], caught: ['อ๊ากกก!!', 'ปล่อยผมนะ!'],
    juke: ['หลบ!', 'ทางนี้!', 'พลาดแล้วเจ้ายักษ์!'], tired: ['ไม่ไหวแล้ว…', 'หอบ…หอบ…', 'ขาจะขาดแล้ว'], phew: ['รอดไปที…', 'เงียบ ๆ ไว้…', 'เกือบไปแล้ว'],
    peek: ['มันยังอยู่แถวนี้…', 'รอก่อน…', 'ยังไม่ปลอดภัย'], hungry: ['หิวจะแย่ ไปหาอะไรกินดีกว่า', 'ท้องร้องแล้ว…'], thirsty: ['คอแห้งมาก…', 'ต้องไปหาน้ำ'],
    ate: ['อิ่มแล้ว ค่อยมีแรงหน่อย'], drank: ['ชื่นใจ…'], rescue: ['เฮลิคอปเตอร์! ทางนี้!!', 'ผมอยู่นี่!!'],
    grief: ['ไม่นะ ตุ้ย!!', 'ตุ้ยยย… ขอโทษ ช่วยไม่ได้'], respawn: ['ผม…ยังไม่ตาย?', 'กลับมาแล้ว คราวนี้ไม่พลาดแน่'] };
  // ตุ้ย: terrified of everything, but talks like an edgy anime hero who is also a programmer
  const TUI = { panic: ['ระบบป้องกันขั้นสุดท้าย… เปิดใช้งาน! (ขาสั่นมาก)', 'try { วิ่ง } catch (แมงมุม) { ร้องไห้ }', 'บั๊กตัวนี้ใหญ่เกิน debug ไม่ไหวแล้ว!!', 'แม่ครับ ผม push ขึ้น production ไม่ทันแล้ว!!'],
    calm: ['ข้าคือ root ของเมืองนี้… ขอ sudo หนีหน่อย', 'เงียบ… เงียบเกินไป เหมือนก่อน server ล่ม', 'อะ อะไรขยับน่ะ!? …ใบไม้เอง'],
    caught: ['Segmentation fault!! อ๊ากก!', 'kill -9 ไม่ได้ผลลล!'], juke: ['หลบ! ด้วย reflex ระดับ 60 fps!', 'ctrl+z!!'],
    tired: ['RAM เต็มแล้ว… ขาค้าง…', 'แบตเหลือ 1%…'], phew: ['รอด… exit code 0… (ยังสั่นอยู่)', 'ฮึ่ม ข้าแค่ถอยทางยุทธศาสตร์เท่านั้น'],
    peek: ['สแกนพื้นที่… มันยังอยู่! ขอ timeout ก่อน', 'ping แมงมุม… ได้ reply ใกล้มาก!!'], hungry: ['พลังงานต่ำ ต้อง recharge ด้วยข้าวปั้น…'], thirsty: ['ระบบระบายความร้อนต้องการน้ำ…'],
    ate: ['อิ่ม… buff พลัง +10 (มือยังสั่น)'], drank: ['คูลลิ่งกลับมาทำงานแล้ว'], rescue: ['deploy สำเร็จ!! ช่วยด้วยยย ทางนี้!!'],
    grief: ['ชัยภัทร!! ไม่นะ… commit สุดท้ายของเขา…', 'ข้าจะ… จะแก้แค้น… (หลบก่อน)'], respawn: ['reboot สำเร็จ… ข้ากลับมาแล้ว (ขาสั่น)'] };
  const LOGGED = { caught: 1, rescue: 1, panic: 1, grief: 1 };   // the rest only show in his bubble (no log spam during a chase)
  const GAP = { panic: 6, juke: 7, tired: 14, peek: 9, hungry: 20, thirsty: 20, calm: 15 };   // per-line-kind wait: no rapid-fire repeats while he runs
  const HIGH = { caught: 1, rescue: 1, grief: 1, respawn: 1 };   // the one NOT being chased only says these (two people don't flood the screen)
  return (p, cat, force) => { const L = (p.who === 'tui' ? TUI : LINES)[cat], cd = p.catCD || (p.catCD = {}), now = performance.now() / 1000;
    if (!L || (!force && cat !== 'caught' && (p.sayCD > 0 || (cd[cat] || 0) > now))) return;
    if (!HIGH[cat] && spider && spider.prey && spider.prey !== p && spider.prey.kind === 'human' && !spider.prey.eaten && ['hunt', 'strike', 'eat'].includes(spider.mode)) return;
    p.sayCD = 2.5; cd[cat] = now + (GAP[cat] || 0);
    const t = L[Math.random() * L.length | 0]; p.sayTxt = `${p.name}: ${t}`; p.sayT = 2.6; p.sayCat = cat; if (LOGGED[cat]) log(`<i>${p.name}:</i> “${t}”`, 'say'); };
})();
const _sayV = new V3(), _sayC = new V3();
// hidden behind a building (camera → head line passes under a roof) or far away = no bubble; checked 6× a second so it doesn't flicker
function sayBlocked(q) { const c = camera.position, d = c.distanceTo(q); if (d > 95) return true;
  for (let i = 1; i < 16; i++) { _sayC.lerpVectors(c, q, i / 16); if (_sayC.y < groundY(_sayC.x, _sayC.z) - .1) return true; } return false; }
function preyTalk(dt) {
  prey.forEach(p => { if (p.kind !== 'human') return; p.sayCD = (p.sayCD || 0) - dt; p.sayT = (p.sayT || 0) - dt;
    let el = p.bubble; if (!el) { el = p.bubble = document.createElement('div'); el.className = 'say hum'; document.body.appendChild(el); }
    if (p.eaten) { el.remove(); return; }
    const q = p.hum ? p.hum.j.neck.getWorldPosition(_sayV) : _sayV.copy(p.mesh.position); q.y += .55;
    if (p.sayT > .2 && (p.blkT = (p.blkT || 0) - dt) <= 0) { p.blkT = .16; p.blk = sayBlocked(q); }
    q.project(camera);
    // only on screen (no pinning to the edge: that made it jump around)
    const on = p.sayT > .2 && !p.blk && q.z < 1 && Math.abs(q.x) < .92 && q.y < .9 && q.y > -1 && !document.body.classList.contains('noui');
    el.classList.toggle('on', on); el.classList.toggle('panic', ['panic', 'caught', 'juke', 'tired'].includes(p.sayCat));
    if (!on) { p.bx = null; return; }
    if (el.textContent !== p.sayTxt) el.textContent = p.sayTxt;
    const x = clamp((q.x * .5 + .5) * innerWidth, 100, innerWidth - 100), y = (-q.y * .5 + .5) * innerHeight;
    // always above his head, following smoothly; overlapping another bubble (spider / the other person) nudges it up or down a little
    let dy = 0; const w = el.offsetWidth || 180, h = el.offsetHeight || 34;
    for (const o of [document.getElementById('say'), ...prey.filter(o => o !== p && o.bubble && o.bx != null).map(o => o.bubble)]) { if (!o.classList.contains('on')) continue;
      const r = o.getBoundingClientRect(), top = y - 12 - h, bot = y - 12;
      if (x + w / 2 > r.left - 6 && x - w / 2 < r.right + 6 && bot > r.top - 6 && top < r.bottom + 6) dy += y < (r.top + r.bottom) / 2 + h / 2 ? -Math.min(bot - r.top + 6, 60) : Math.min(r.bottom - top + 6, 60); }
    p.ody = lerp(p.ody || 0, dy, clamp(dt * 6, 0, 1));
    if (p.bx == null) { p.bx = x; p.by = y; } const k = clamp(dt * 14, 0, 1); p.bx = lerp(p.bx, x, k); p.by = lerp(p.by, y, k);
    el.style.left = p.bx + 'px'; el.style.top = Math.max(50, p.by + p.ody) + 'px';
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
