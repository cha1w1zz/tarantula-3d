'use strict';
/* =====================================================================
   Tarantula: velvet shell fur + animated setae, 4-segment IK legs,
   metachronal tetrapod gait, spring-driven secondary motion
   ===================================================================== */
const SPECIES = {
  minax:   { th: 'บึ้งดำ', en: 'Thailand Black', sci: 'Melopoeus minax',
             car: 0x171513, carLine: 0x080707, carHair: 0x35312d, abd: 0x141210, abdMark: 0x080706, abdHair: 0x322e2a,
             leg: 0x110f0e, legHair: 0x262320, seta: 0x4c463f, sheenC: 0x3a3632, sheen: 0, speed: 1.0, aggro: .85, maxSpan: 16,
             fact: 'บึ้งดำเป็นชนิดขุดโพรงลึก ขึ้นชื่อเรื่องนิสัยดุ มักยกขาหน้าขู่ก่อนกัด' },
  huahini: { th: 'บึ้งน้ำตาล', en: 'Asian Fawn', sci: 'Chilobrachys huahini',
             car: 0x4a3826, carLine: 0x22170b, carHair: 0x6a5438, abd: 0x3a2b1d, abdMark: 0x1a1108, abdHair: 0x584430,
             leg: 0x3a2a1a, legHair: 0x5a4630, seta: 0x8a765a, sheenC: 0x7a6448, sheen: 0, speed: 1.35, aggro: .55, maxSpan: 13,
             fact: 'บึ้งน้ำตาลว่องไวมาก พบแถบหัวหิน ชอบชักใยปากโพรงเป็นแผ่นหนา' },
  lividus: { th: 'บึ้งน้ำเงิน', en: 'Cobalt Blue', sci: 'Melopoeus lividus',
             car: 0x1c212b, carLine: 0x0a0d12, carHair: 0x333d52, abd: 0x1f1b17, abdMark: 0x0c0a08, abdHair: 0x3a342d,
             leg: 0x0e1838, legHair: 0x1c3272, seta: 0x4d6394, sheenC: 0x4a6cc0, sheen: .35, speed: 1.15, aggro: .9, maxSpan: 13,
             fact: 'สีน้ำเงินของบึ้งน้ำเงินไม่ได้มาจากสารสี แต่เกิดจากโครงสร้างนาโนบนขนที่สะท้อนแสง' },
};
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
/* fine setae lying along the cuticle: brightness + bump streaks for leg segments (u = around, v = along) */
const SETAE_TEX = (() => {
  const s = 256, c = cnv(s, s), g = c.getContext('2d'); g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, s, s); g.lineCap = 'round';
  for (let i = 0; i < 2600; i++) { const x = Math.random() * s, y = Math.random() * s, len = rand(10, 42), a = rand(-.12, .12), v = 90 + Math.random() * 165 | 0;
    g.strokeStyle = `rgba(${v},${v},${v},.7)`; g.lineWidth = rand(.8, 1.8);
    wrap(s, s, x, y, len, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.quadraticCurveTo(X + Math.sin(a) * len * .5 + rand(-2, 2), Y + len * .5, X + Math.sin(a) * len, Y + len * Math.cos(a)); g.stroke(); }); }
  const t = mkTex(c, true, 3, 3); return t;
})();
/* shell-fur alpha: dense clumped tufts so the stacked shells read as a soft velvet volume */
const SHELL_TEX = (() => {
  const s = 128, c = cnv(s, s), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) { const x = Math.random() * s, y = Math.random() * s, r = rand(.9, 2.2), v = 60 + Math.pow(Math.random(), .6) * 195 | 0;
    wrap(s, s, x, y, r, (X, Y) => blob(g, X, Y, r, `rgb(${v},${v},${v})`)); }
  return mkTex(c, false, 1, 1);
})();

/* setae shader: ribbons sway with a breeze and shiver when the spider moves */
const HAIR_U = { uTime: { value: 0 }, uAgit: { value: 0 } };
function hairMat(sheen) {
  // sheen (velvet BRDF) instead of a GGX highlight: a pelt glows at grazing angles rather than glinting white
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .6, sheen });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = HAIR_U.uTime; sh.uniforms.uAgit = HAIR_U.uAgit;
    sh.vertexShader = 'attribute vec3 aSway;\nattribute float aTip;\nattribute float aPhase;\nuniform float uTime;\nuniform float uAgit;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        // bend grows toward the tip; three detuned sines give a slow, gusty drift instead of a metronome
        float hw = aTip * aTip * (3.0 - 2.0 * aTip);
        float breeze = sin(uTime * 1.3 + aPhase) * .55 + sin(uTime * 2.3 + aPhase * 1.31) * .3 + sin(uTime * .47 + aPhase * .53) * .45;
        float shiver = sin(uTime * 9.0 + aPhase * 2.3) * .6 + sin(uTime * 13.7 + aPhase * 3.1) * .4;
        transformed += aSway * hw * (breeze * (.22 + uAgit * .2) + shiver * uAgit * .22);`);
    // both faces of a hair ribbon are lit like the skin it grows from
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 geometryNormal = normal;');
  };
  m.customProgramCacheKey = () => 'tarantula-hair';
  return track(m, .45);
}
const WIND = new V3(.8, .2, .55).normalize();
function buildHair(list) {
  const N = list.length, VP = 16, P = new Float32Array(N * VP * 3), NN = new Float32Array(N * VP * 3), C = new Float32Array(N * VP * 3), S = new Float32Array(N * VP * 3),
    T = new Float32Array(N * VP), PH = new Float32Array(N * VP), I = new Uint32Array(N * 36);
  const s1 = new V3(), s2 = new V3(), tmp = new V3(), pt = new V3(), col = new THREE.Color(), sway = new V3(), W = [1, .72, .42, .05];
  let v = 0, ii = 0;
  for (const h of list) {
    tmp.set(Math.random() - .5, Math.random() - .5, Math.random() - .5); s1.crossVectors(h.d, tmp).normalize(); s2.crossVectors(h.d, s1).normalize();
    // sway mostly along one shared direction (coherent, like air moving over a pelt) plus a little individual scatter
    const a = Math.random() * 6.283; sway.copy(s1).multiplyScalar(Math.cos(a)).addScaledVector(s2, Math.sin(a)).multiplyScalar(.35);
    tmp.copy(WIND).addScaledVector(h.d, -WIND.dot(h.d)); if (tmp.lengthSq() > 1e-4) sway.addScaledVector(tmp.normalize(), .8);
    sway.multiplyScalar(h.len * .55);
    const ph = (h.ph || 0) + Math.random() * 1.6, br = rand(.8, 1.15);
    for (const side of [s1, s2]) {
      const base = v;
      for (let k = 0; k < 4; k++) {
        const t = k / 3;
        pt.copy(h.p).addScaledVector(h.d, h.len * t).addScaledVector(h.curl, h.len * t * t * .5);
        col.copy(h.c0).lerp(h.c1, Math.pow(t, .8)).multiplyScalar(br);
        for (const sg of [-1, 1]) {
          const o = v * 3;
          P[o] = pt.x + side.x * sg * h.w * W[k]; P[o + 1] = pt.y + side.y * sg * h.w * W[k]; P[o + 2] = pt.z + side.z * sg * h.w * W[k];
          NN[o] = h.n.x; NN[o + 1] = h.n.y; NN[o + 2] = h.n.z; C[o] = col.r; C[o + 1] = col.g; C[o + 2] = col.b;
          S[o] = sway.x; S[o + 1] = sway.y; S[o + 2] = sway.z; T[v] = t; PH[v] = ph; v++;
        }
      }
      for (let k = 0; k < 3; k++) { const q = base + k * 2; I[ii++] = q; I[ii++] = q + 1; I[ii++] = q + 2; I[ii++] = q + 1; I[ii++] = q + 3; I[ii++] = q + 2; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(NN, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(S, 3)); g.setAttribute('aTip', new THREE.BufferAttribute(T, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(PH, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingSphere(); return g;
}
// area-weighted random points on a mesh surface
function sampleSurface(geo, count, filter) {
  const p = geo.attributes.position, n = geo.attributes.normal, idx = geo.index.array, tri = idx.length / 3, cdf = new Float32Array(tri);
  const A = new V3(), B = new V3(), Cc = new V3(); let acc = 0;
  for (let t = 0; t < tri; t++) { A.fromBufferAttribute(p, idx[t * 3]); B.fromBufferAttribute(p, idx[t * 3 + 1]); Cc.fromBufferAttribute(p, idx[t * 3 + 2]);
    acc += B.sub(A).cross(Cc.sub(A)).length(); cdf[t] = acc; }
  const out = []; let tries = 0;
  while (out.length < count && tries++ < count * 4) {
    const r = Math.random() * acc; let lo = 0, hi = tri - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < r) lo = m + 1; else hi = m; }
    let u = Math.random(), w = Math.random(); if (u + w > 1) { u = 1 - u; w = 1 - w; } const z = 1 - u - w;
    const i0 = idx[lo * 3], i1 = idx[lo * 3 + 1], i2 = idx[lo * 3 + 2];
    const P = new V3().fromBufferAttribute(p, i0).multiplyScalar(z).addScaledVector(new V3().fromBufferAttribute(p, i1), u).addScaledVector(new V3().fromBufferAttribute(p, i2), w);
    const Nn = new V3().fromBufferAttribute(n, i0).multiplyScalar(z).addScaledVector(new V3().fromBufferAttribute(n, i1), u).addScaledVector(new V3().fromBufferAttribute(n, i2), w).normalize();
    if (filter && !filter(P, Nn)) continue; out.push([P, Nn]);
  }
  return out;
}
const jit = (v, a) => v.add(new V3(rand(-a, a), rand(-a, a), rand(-a, a))).normalize();
const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function carapaceGeo(sp) {
  const g = new THREE.SphereGeometry(1, 72, 48), p = g.attributes.position, col = [];
  const base = new THREE.Color(sp.car), line = new THREE.Color(sp.carLine), hair = new THREE.Color(sp.carHair);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    if (y < 0) y *= .42;
    x *= 1 - .2 * Math.max(0, z); y *= 1 + .14 * Math.max(0, z);
    if (y > 0) y -= .12 * Math.exp(-((x / .15) ** 2 + ((z + .15) / .13) ** 2));      // fovea
    p.setXYZ(i, x, y, z);
    const a = Math.atan2(x, z + .15), rr = Math.hypot(x, z + .15), top = clamp(y / .6, 0, 1);
    const c = base.clone().lerp(line, Math.pow(Math.abs(Math.cos(a * 4)), 12) * clamp(rr * 2.2, 0, 1) * top * .85);
    if (Math.hypot(x, z) > .84) c.lerp(hair, .3);
    if (y < -.05) c.multiplyScalar(.6);
    c.convertSRGBToLinear(); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function abdomenGeo(sp) {
  const g = new THREE.SphereGeometry(1, 72, 56), p = g.attributes.position, col = [];
  const base = new THREE.Color(sp.abd), mark = new THREE.Color(sp.abdMark);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i); const z = p.getZ(i);
    if (z < 0) { x *= 1 + .12 * -z; y *= 1 + .06 * -z; }
    if (y < 0) y *= .86;
    p.setXYZ(i, x, y, z);
    const dorsal = smooth01(.12, .7, y), w = Math.abs(x);
    const chev = smooth01(.7, .9, frac(z * 2.6 + w * 1.9 + .3)) * (1 - smooth01(.42, .7, w)) * dorsal;
    const mid = (1 - smooth01(.04, .13, w)) * dorsal * smooth01(-.35, .2, z) * .8;
    const c = base.clone().lerp(mark, Math.max(chev, mid) * .85);
    if (y < -.2) c.multiplyScalar(.7);
    c.convertSRGBToLinear(); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function segGeo(r0, r1, len, bulge) {
  const pts = [new V2(0, 0)];
  for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new V2(lerp(r0, r1, t) * (1 + bulge * Math.sin(Math.PI * t)) * (t < .04 || t > .96 ? .8 : 1), t * len)); }
  pts.push(new V2(0, len));
  return new THREE.LatheGeometry(pts, 16);
}

// leg layout: hip angle, foot angle (rad from forward), reach and segment lengths as fractions of leg span
const LEG_CFG = [
  { ang: .6, fa: .5, reach: .5, a: .165, b: .185, c: .12, t: .06 },
  { ang: 1.1, fa: 1.08, reach: .44, a: .15, b: .165, c: .11, t: .055 },
  { ang: 1.7, fa: 1.9, reach: .44, a: .145, b: .155, c: .125, t: .055 },
  { ang: 2.3, fa: 2.62, reach: .5, a: .172, b: .182, c: .16, t: .06 },
];

class Spider {
  constructor(key, span) {
    this.key = key; this.sp = SPECIES[key]; this.span = span;
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ'; scene.add(this.root);
    this.pos = LOG_ENTRY.clone().add(new V3(3, 0, 4)); this.yaw = 2.2; this.vel = new V3(); this.yawRate = 0; this.prevVel = new V3();
    this.mode = 'idle'; this.modeT = 0; this.target = null; this.route = []; this.prey = null;
    this.want = { threat: 0, rear: 0, stalk: 0, fang: 0, flip: 0, hidden: 0, eat: 0 };
    this.st = { threat: 0, rear: 0, stalk: 0, fang: 0, flip: 0, hidden: 0, eat: 0 };
    this.soft = 0; this.phase = 0; this.bodyY = null; this.pitchS = 0; this.rollS = 0;
    this.abd = { yaw: 0, yv: 0, pitch: 0, pv: 0 }; this.probe = null; this.probeCD = rand(3, 6); this.palpT = 0;
    this.worldMeshes = [];
    this.build();
    this.placeFeet();
  }
  get threat() { return this.st.threat; }
  get flip() { return this.st.flip; }
  get hidden() { return this.st.hidden; }

  build() {
    const sp = this.sp, L = this.span;
    const m = this.mats = {
      car: track(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .65, sheen: lin(sp.carHair).multiplyScalar(.8), clearcoat: sp.sheen * .4, clearcoatRoughness: .5 }), .35),
      cut: track(new THREE.MeshPhysicalMaterial({ color: lin(sp.car).multiplyScalar(.7), roughness: .6, sheen: lin(sp.carHair).multiplyScalar(.6) }), .35),
      abd: track(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .85, sheen: lin(sp.abdHair).multiplyScalar(.7) }), .25),
      leg: track(new THREE.MeshPhysicalMaterial({ color: lin(sp.leg), map: SETAE_TEX, bumpMap: SETAE_TEX, bumpScale: .5, roughness: .72, sheen: lin(sp.sheenC), metalness: sp.sheen * .3 }), .5),
      fang: track(new THREE.MeshPhysicalMaterial({ color: 0x050403, roughness: .18, clearcoat: 1 }), 1),
      eye: track(new THREE.MeshPhysicalMaterial({ color: 0x030303, roughness: .04, clearcoat: 1, metalness: .3 }), 1.4),
      hair: hairMat(lin(sp.carHair).lerp(lin(sp.sheenC), sp.sheen).multiplyScalar(.8)), legHair: hairMat(lin(sp.sheenC).multiplyScalar(.9)),
    };
    this.tint = [[m.car, new THREE.Color(1, 1, 1)], [m.abd, new THREE.Color(1, 1, 1)], [m.leg, m.leg.color.clone()], [m.cut, m.cut.color.clone()]];
    const bodyFur = this.furTex = SHELL_TEX.clone(); bodyFur.needsUpdate = true; bodyFur.repeat.set(14, 8);
    // shell materials are shared by every furred body part: layer t sits at t × thickness above the skin
    const SH = 5, shellMat = [];
    for (let l = 1; l <= SH; l++) { const t = l / SH;
      const mm = track(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(lerp(.75, 1.25, t)), vertexColors: true, alphaMap: bodyFur, alphaTest: .12 + .7 * t,
        roughness: .8, sheen: lin(sp.carHair).multiplyScalar(.5) }), .25);
      shellMat.push(mm); this.tint.push([mm, mm.color.clone()]); }
    // shells are children of the skin mesh, so they follow its breathing scale
    const ellipsoidFur = (mesh, thick) => shellMat.forEach((mat, i) => { const s = new THREE.Mesh(mesh.geometry, mat), k = thick * (i + 1) / SH;
      s.scale.set(1 + k / mesh.scale.x, 1 + k / mesh.scale.y, 1 + k / mesh.scale.z); mesh.add(s); });
    const hairFrom = (mesh, count, fn, filter) => sampleSurface(mesh.geometry, count, filter || ((P, N) => N.y > -.55)).map(([P, N]) => {
      const p = P.clone().multiply(mesh.scale).applyEuler(mesh.rotation).add(mesh.position);
      const n = new V3(N.x / mesh.scale.x, N.y / mesh.scale.y, N.z / mesh.scale.z).applyEuler(mesh.rotation).normalize(); return fn(p, n); });
    // breeze phase: neighbouring hairs move together, so a gust rolls across the body as a wave
    const wave = p => (p.x * .8 + p.y * .5 - p.z * 1.4) / L * 14;
    const back = new V3(0, 0, -1);

    // carapace: short velvet lying flat, radiating from the fovea, with a paler fringe on the margin
    const car = new THREE.Mesh(carapaceGeo(sp), m.car); car.scale.set(L * .075, L * .034, L * .09); car.position.set(0, 0, L * .03);
    this.root.add(car); ellipsoidFur(car, L * .005);
    const cH = lin(sp.car).multiplyScalar(.6), cT = lin(sp.carHair), fov = new V3(0, 0, L * .03 - L * .09 * .15);
    let hairs = hairFrom(car, 1200, (p, n) => { const rad = p.clone().sub(fov); rad.y = 0; if (rad.lengthSq() < 1e-8) rad.copy(back); rad.normalize();
      return { p, n, d: jit(rad.addScaledVector(n, .3).addScaledVector(back, .3), .18), curl: n.clone().multiplyScalar(-.6), len: L * rand(.006, .012), w: L * .0008, c0: cH, c1: cT, ph: wave(p) }; })
      .concat(hairFrom(car, 260, (p, n) => ({ p, n, d: jit(new V3(n.x, 0, n.z).normalize().addScaledVector(UP, -.25), .25), curl: new V3(0, -.6, 0).addScaledVector(back, .2),
        len: L * rand(.012, .022), w: L * .0008, c0: cH, c1: lin(sp.seta), ph: wave(p) }), (P, N) => N.y < .45 && N.y > -.3));
    // eyes on a small tubercle
    const tub = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), m.cut); tub.scale.set(L * .013, L * .009, L * .013); tub.position.set(0, L * .031, L * .078); this.root.add(tub);
    [[-1.5, 0, .006], [-.5, 0, .004], [.5, 0, .004], [1.5, 0, .006], [-1, 1, .005], [1, 1, .005], [-.5, -1, .004], [.5, -1, .004]].forEach(([ex, ez, r]) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(L * r * .9, 12, 8), m.eye); e.position.set(ex * L * .0065, L * .037, L * .082 + ez * L * .005); this.root.add(e); });
    // chelicerae + fangs
    this.chel = []; this.fangs = [];
    const chelG = new THREE.Group(); chelG.position.set(0, -L * .006, L * .1); this.root.add(chelG); this.chelG = chelG;
    const chelGeo = new THREE.SphereGeometry(1, 28, 20), cc = lin(sp.car).multiplyScalar(.8);
    chelGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(chelGeo.attributes.position.count * 3).map((_, i) => [cc.r, cc.g, cc.b][i % 3]), 3));
    [-1, 1].forEach(s => {
      const g = new THREE.Group(); g.position.set(s * L * .02, 0, 0); chelG.add(g);
      const ch = new THREE.Mesh(chelGeo, m.car); ch.scale.set(L * .02, L * .023, L * .038); ch.position.set(0, -L * .006, L * .018); ch.rotation.x = .35; g.add(ch);
      ellipsoidFur(ch, L * .004);
      const chair = hairFrom(ch, 320, (p, n) => ({ p, n, d: jit(n.clone().multiplyScalar(.5).add(new V3(0, -.15, 1)), .25), curl: new V3(0, -.35, 0).addScaledVector(n, -.2),
        len: L * rand(.009, .02), w: L * .0009, c0: cH, c1: cT, ph: wave(p) }));
      g.add(new THREE.Mesh(buildHair(chair), m.hair));
      const fp = new THREE.Group(); fp.position.set(0, -L * .028, L * .042); g.add(fp);
      const fg = new THREE.ConeGeometry(L * .0055, L * .045, 10, 6); fg.translate(0, L * .0225, 0);
      { const pp = fg.attributes.position; for (let i = 0; i < pp.count; i++) { const y = pp.getY(i) / (L * .045); pp.setZ(i, pp.getZ(i) + y * y * L * .012); } fg.computeVertexNormals(); }
      const fang = new THREE.Mesh(fg, m.fang); fp.add(fang); this.fangs.push(fp); this.chel.push(g);
    });
    // abdomen on a spring-loaded pedicel
    this.abdPivot = new THREE.Group(); this.abdPivot.position.set(0, L * .005, -L * .055); this.root.add(this.abdPivot);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(L * .012, L * .016, L * .03, 12), m.cut); ped.rotation.x = Math.PI / 2; ped.position.z = -L * .005; this.abdPivot.add(ped);
    const abd = new THREE.Mesh(abdomenGeo(sp), m.abd); abd.scale.set(L * .095, L * .08, L * .12); abd.position.set(0, L * .02, -L * .11);
    this.abdPivot.add(abd); this.abdMesh = abd; ellipsoidFur(abd, L * .009);
    const aH = lin(sp.abd).multiplyScalar(.55), aT = lin(sp.abdHair);
    const abdHair = hairFrom(abd, 3800, (p, n) => ({ p, n, d: jit(n.clone().multiplyScalar(.8).addScaledVector(back, .75), .28), curl: new V3(0, -.3, -.35).addScaledVector(n, -.35),
      len: L * rand(.014, .032), w: L * .0011, c0: aH, c1: aT, ph: wave(p) }))
      .concat(hairFrom(abd, 240, (p, n) => ({ p, n, d: jit(n.clone().addScaledVector(back, .45), .3), curl: new V3(0, -.5, -.3).addScaledVector(n, -.2),
        len: L * rand(.04, .07), w: L * .0008, c0: aH, c1: lin(sp.seta), ph: wave(p) })));
    this.abdPivot.add(new THREE.Mesh(buildHair(abdHair), m.hair));
    [-1, 1].forEach(s => { const sg = new THREE.Mesh(segGeo(L * .0065, L * .0045, L * .038, .15), m.leg);
      sg.position.set(s * L * .011, L * .008, -L * .215); sg.quaternion.setFromUnitVectors(UP, new V3(s * .3, .3, -1).normalize()); this.abdPivot.add(sg); });
    this.root.add(new THREE.Mesh(buildHair(hairs), m.hair));

    // legs & palps (world-space meshes driven by IK)
    const lH = lin(sp.leg).multiplyScalar(.75), lT = lin(sp.legHair), lS = lin(sp.seta);
    // setae lean toward the tip of each segment (as on a real leg), long guard hairs stand out further
    const mkSeg = (r0, r1, len, nHair, hairLen, ph0) => {
      const geo = segGeo(r0, r1, len, .12), mesh = new THREE.Mesh(geo, m.leg); mesh.castShadow = true; scene.add(mesh); this.worldMeshes.push(mesh);
      const list = [];
      for (let i = 0; i < nHair; i++) { const t = Math.pow(Math.random(), .9) * len, th = rand(0, 6.283), r = lerp(r0, r1, t / len) * (1 + .12 * Math.sin(Math.PI * t / len));
        const n = new V3(Math.cos(th), 0, Math.sin(th)), guard = Math.random() < .045;
        list.push({ p: new V3(n.x * r, t, n.z * r), n, d: jit(n.clone().multiplyScalar(guard ? 1.1 : .5).add(UP), .22), curl: new V3(0, .25, 0).addScaledVector(n, guard ? -.2 : -.35),
          len: L * (guard ? rand(.03, .055) : rand(hairLen[0], hairLen[1])), w: L * (guard ? .00065 : .00085), c0: lH, c1: guard ? lS : lT, ph: ph0 - t / L * 30 }); }
      mesh.add(new THREE.Mesh(buildHair(list), m.legHair));
      return mesh;
    };
    const knob = r => { const g = new THREE.SphereGeometry(r, 14, 10), k = new THREE.Mesh(g, m.leg); k.castShadow = true; scene.add(k); this.worldMeshes.push(k); return k; };
    this.legs = [];
    [1, -1].forEach(s => LEG_CFG.forEach((cf, i) => {
      const dir = new V3(s * Math.sin(cf.ang), 0, Math.cos(cf.ang)), ph = rand(0, 6.283);
      const hip0 = new V3(s * Math.sin(cf.ang) * L * .062, -L * .008, Math.cos(cf.ang) * L * .078 + L * .03);
      const hip = hip0.clone().addScaledVector(dir, L * .034).add(new V3(0, -L * .004, 0));
      const coxa = new THREE.Mesh(segGeo(L * .018, L * .016, hip0.distanceTo(hip) + L * .008, .1), m.leg);
      coxa.position.copy(hip0); coxa.quaternion.setFromUnitVectors(UP, hip.clone().sub(hip0).normalize()); this.root.add(coxa);
      const a = L * cf.a, b = L * cf.b, c = L * cf.c, t = L * cf.t;
      const leg = { s, i, hip, a, b, c, t, rest: new V3(s * Math.sin(cf.fa) * L * cf.reach, 0, Math.cos(cf.fa) * L * cf.reach + L * .03),
        off: frac((i % 2 ? .5 : 0) + (s < 0 ? .5 : 0) + (3 - i) * .06), lastP: 0,
        foot: new V3(), from: new V3(), swing: false, st: 0, dur: .2, tuck: 0, ext: 0,
        A: mkSeg(L * .018, L * .016, a, 380, [.013, .028], ph), B: mkSeg(L * .016, L * .014, b, 400, [.013, .027], ph - 3),
        C: mkSeg(L * .012, L * .0098, c, 230, [.011, .022], ph - 6), T: mkSeg(L * .0096, L * .0086, t, 110, [.009, .017], ph - 8),
        k1: knob(L * .0165), k2: knob(L * .0128), k3: knob(L * .0092) };
      this.legs.push(leg);
    }));
    this.palps = [1, -1].map(s => { const ph = rand(0, 6.283); return { s, i: -1, hip: new V3(s * L * .03, -L * .014, L * .098), rest: new V3(s * L * .065, 0, L * .235),
      a: L * .09, b: L * .08, c: L * .065, foot: new V3(), tuck: 0,
      A: mkSeg(L * .012, L * .011, L * .09, 170, [.012, .026], ph), B: mkSeg(L * .012, L * .011, L * .08, 180, [.012, .028], ph - 3), C: mkSeg(L * .012, L * .0105, L * .065, 190, [.014, .03], ph - 6),
      k1: knob(L * .0115), k2: knob(L * .0105) }; });
    this.root.traverse(o => { if (o.isMesh && o.material !== m.hair && !o.material.alphaMap) o.castShadow = true; });
    const recv = o => { if (o.isMesh) o.receiveShadow = true; };
    this.root.traverse(recv); this.worldMeshes.forEach(w => w.traverse(recv));
    // materials made after the last applyEnv() would otherwise keep envMapIntensity 1 and look chalky
    this.ownMats = new Set(Object.values(m).concat(this.tint.map(e => e[0])));
    const lvl = typeof envLevel === 'number' && envLevel >= 0 ? envLevel : .75;
    this.ownMats.forEach(mm => { mm.envMapIntensity = mm.userData.env * lvl; });
  }
  pickables() { // solid parts only: raycasting thousands of hair ribbons and fur shells would make a click hitch
    const out = []; this.root.traverse(o => o.isMesh && !o.material.alphaMap && o.material !== this.mats.hair && out.push(o)); return out.concat(this.worldMeshes); }
  dispose() {
    scene.remove(this.root); this.worldMeshes.forEach(o => scene.remove(o));
    const geos = new Set(); this.root.traverse(o => o.geometry && geos.add(o.geometry)); this.worldMeshes.forEach(w => w.traverse(o => o.geometry && geos.add(o.geometry)));
    geos.forEach(g => g.dispose());
    this.ownMats.forEach(mm => { envMats.delete(mm); mm.dispose(); }); this.furTex.dispose();
  }
  exuvia() { // shed exoskeleton left behind after a molt
    // the cast skin lies right-side up with legs splayed, slightly collapsed; called just before dispose(), so re-posing is safe
    for (const k in this.st) this.st[k] = 0; this.probe = null; this.pitchS = this.rollS = 0; this.placeFeet();
    this.root.position.y -= this.span * .025; this.root.updateMatrixWorld(true);
    const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: lin(0x5a4a38), roughness: .75, transparent: true, opacity: .9, side: THREE.DoubleSide, envMapIntensity: .2 });
    const add = o => { const c = o.clone(true); c.traverse(q => { if (q.isMesh) { if (q.material.alphaMap) q.visible = false; q.material = mat; q.castShadow = true; } });
      o.updateMatrixWorld(true); c.matrixAutoUpdate = false; c.matrix.copy(o.matrixWorld); return c; };
    g.add(add(this.root)); this.worldMeshes.forEach(w => g.add(add(w)));
    return g;
  }
  worldOf(v) { return this.root.localToWorld(v.clone()); }
  placeFeet() {
    this.poseRoot(0, true);
    this.legs.forEach(l => { const w = this.worldOf(l.rest); w.y = groundY(w.x, w.z); l.foot.copy(w); l.swing = false; });
    this.palps.forEach(p => { const w = this.worldOf(p.rest); w.y = groundY(w.x, w.z); p.foot.copy(w); });
    this.bodyY = null; this.update(0);
  }
  poseRoot(dt, snap) {
    const L = this.span, st = this.st, legs = this.legs;
    // only planted feet carry the body: a lifted foot must not hoist it
    const avg = f => { let s = 0, n = 0; legs.forEach(l => { if (!l.swing && f(l)) { s += l.foot.y; n++; } }); return n ? s / n : groundY(this.pos.x, this.pos.z); };
    const cg = groundY(this.pos.x, this.pos.z);
    const feet = avg(() => true), front = avg(l => l.i <= 1), back = avg(l => l.i >= 2), left = avg(l => l.s > 0), right = avg(l => l.s < 0);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const bob = -Math.abs(Math.sin(this.phase * Math.PI * 2)) * L * .007 * clamp(speed / (L * .4), 0, 1);
    let ty = Math.max(feet, cg - L * .02) + L * .088 * (1 - .28 * st.stalk) + st.rear * L * .05 + bob - st.hidden * L * .4;
    ty = lerp(ty, cg + L * .05, st.flip);
    const k = snap ? 1 : clamp(dt * 9, 0, 1);
    this.bodyY = this.bodyY == null ? ty : lerp(this.bodyY, ty, k);
    let swingL = 0, swingR = 0; legs.forEach(l => { if (l.swing) l.s > 0 ? swingL++ : swingR++; });
    const tp = -Math.atan2(front - back, L * .38) * .8 - st.rear * .55 - st.threat * .45 + st.stalk * .06 + st.eat * -.12;
    const tr = Math.atan2(left - right, L * .45) * .8 + (swingR - swingL) * .012 * clamp(speed / (L * .3), 0, 1);
    this.pitchS = lerp(this.pitchS, tp, k); this.rollS = lerp(this.rollS, tr, k);
    this.root.position.set(this.pos.x, this.bodyY, this.pos.z);
    this.root.rotation.set(this.pitchS * (1 - st.flip), this.yaw, this.rollS * (1 - st.flip) + st.flip * Math.PI);
    this.root.updateMatrixWorld(true);
    this.bodyUp = UP.clone().applyQuaternion(this.root.quaternion);
    // joint-bend reference: dorsal while standing, sky-ward once rolled onto the back so legs curl up in the air
    this.legUp = this.bodyUp.clone().lerp(UP, st.flip); if (this.legUp.lengthSq() < 1e-4) this.legUp.set(0, 0, 0).add(UP); this.legUp.normalize();
  }
  // hip → knee → ankle (analytic 2-bone); the metatarsus hangs from the ankle and the tarsus lies on the ground
  // `raise` (0..1) is for a leg held up in the air: the distal segments then continue outward instead of hanging down
  solve(l, foot, tuck, raise) {
    const hipW = this.worldOf(l.hip), up = this.legUp; raise = raise || 0;
    const out = new V3(foot.x - hipW.x, 0, foot.z - hipW.z); if (out.lengthSq() < 1e-6) out.set(0, 0, 1); out.normalize();
    let tdir = null, base = foot;
    if (l.T) { // tarsus: nearly flat on the ground while planted, curls under while swinging
      tdir = out.clone().addScaledVector(up, -.22 - .55 * tuck).normalize().lerp(out.clone().addScaledVector(up, .45).normalize(), raise).normalize();
      base = foot.clone().addScaledVector(tdir, -l.t);
    }
    const ad = up.clone().multiplyScalar(.55 + tuck * .3).addScaledVector(out, -(.83 - tuck * .3)).normalize()
      .lerp(out.clone().negate().addScaledVector(up, -.45).normalize(), raise).normalize();
    const ankle = base.clone().addScaledVector(ad, l.c);
    const dir = ankle.clone().sub(hipW); let d = dir.length(); dir.normalize();
    const dmax = (l.a + l.b) * .998, dmin = Math.abs(l.a - l.b) + 1e-3, dsoft = dmax * .93;
    l.ext = d / dmax;
    // soft IK: ease into full extension instead of letting the knee snap straight
    if (d > dsoft) { const k = dmax - dsoft; d = dsoft + k * (1 - Math.exp(-(d - dsoft) / k)); ankle.copy(hipW).addScaledVector(dir, d); }
    else if (d < dmin) { d = dmin; ankle.copy(hipW).addScaledVector(dir, d); }
    const x = (l.a * l.a - l.b * l.b + d * d) / (2 * d), y = Math.sqrt(Math.max(0, l.a * l.a - x * x));
    const bend = up.clone().addScaledVector(out, .35).normalize(); const perp = bend.sub(dir.clone().multiplyScalar(bend.dot(dir)));
    if (perp.lengthSq() < 1e-8) perp.copy(up); perp.normalize();
    const knee = hipW.clone().addScaledVector(dir, x).addScaledVector(perp, y);
    const tip = ankle.clone().addScaledVector(ad, -l.c);
    this.orient(l.A, hipW, knee); this.orient(l.B, knee, ankle); this.orient(l.C, ankle, tip);
    l.k1.position.copy(knee); l.k2.position.copy(ankle);
    if (l.T) { this.orient(l.T, tip, tip.clone().add(tdir)); l.k3.position.copy(tip); }
  }
  orient(m, a, b) { m.position.copy(a); m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize()); }
  startSwing(l, dur) { l.swing = true; l.st = 0; l.dur = Math.max(.07, dur); l.from.copy(l.foot); }

  update(dt) {
    const L = this.span, st = this.st, w = this.want;
    const rates = { threat: 7, rear: 12, stalk: 3, fang: 9, flip: 1.1, hidden: 2.2, eat: 5 };
    for (const k in rates) st[k] = lerp(st[k], w[k], clamp(dt * rates[k], 0, 1));
    const now = performance.now() / 1000;
    this.poseRoot(dt);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const stride = L * (.24 - .06 * st.stalk);
    // cadence from how fast the feet travel relative to the body: forward speed plus the tangential speed of turning
    const freq = Math.min(5.5, (speed + Math.abs(this.yawRate) * L * .45) / stride);
    const moving = freq > .3 && st.flip < .3;
    if (moving) this.phase += freq * dt;
    const duty = lerp(.66, .52, clamp(speed / (L * 1.6), 0, 1)), swingW = 1 - duty;
    const lift = L * (.04 - .015 * st.stalk);
    let swinging = this.legs.filter(l => l.swing).length;
    const raiseAmt = l => l.i === 0 ? Math.max(st.threat, st.rear) : l.i === 1 ? st.threat * .45 : 0;
    if (this.probe) { this.probe.t += dt; if (this.probe.t > this.probe.dur) this.probe = null; }
    // where a leg's neutral foothold will be `ta` seconds from now (body keeps translating and turning)
    const lead = moving ? duty / freq * .5 : 0;
    const restAt = (l, ta) => { const a = this.yaw + this.yawRate * ta, c = Math.cos(a), sn = Math.sin(a), r = l.rest;
      const v = new V3(this.pos.x + r.x * c + r.z * sn + this.vel.x * ta, 0, this.pos.z - r.x * sn + r.z * c + this.vel.z * ta); v.y = groundY(v.x, v.z); return v; };

    this.legs.forEach(l => {
      const restW = restAt(l, 0);
      if (st.flip > .25) { // molting on its back: legs curl loosely over the sternum, twitching now and then
        const t = this.worldOf(l.rest.clone().multiplyScalar(.42 + .04 * (l.i % 2)).add(new V3(0, -L * (.2 + .03 * Math.sin(now * .7 + l.i + l.s)), 0)));
        l.foot.lerp(t, clamp(dt * 2, 0, 1)); l.swing = false; l.tuck = 0; this.solve(l, l.foot, 0, .6); return;
      }
      if (!l.swing) {
        if (moving) {
          const p = frac(this.phase + l.off);
          if (p < swingW && (l.lastP >= swingW || l.lastP > p)) this.startSwing(l, swingW / freq);
          // a leg stretched to its limit steps early (unless a neighbour is in the air)
          else if (l.ext > 1.02 && swinging < 4 && !this.legs.some(o => o.swing && o.s === l.s && Math.abs(o.i - l.i) === 1)) { this.startSwing(l, swingW / freq); swinging++; }
          l.lastP = p;
        } else {
          l.lastP = frac(this.phase + l.off);
          const d = Math.hypot(l.foot.x - restW.x, l.foot.z - restW.z);
          const nb = this.legs.some(o => o.swing && ((o.s === l.s && Math.abs(o.i - l.i) === 1) || (o.s !== l.s && o.i === l.i)));
          if (d > L * .06 && !nb && swinging < 2 && raiseAmt(l) < .3) { this.startSwing(l, rand(.17, .24)); swinging++; }
        }
        if (!l.swing && Math.hypot(l.foot.x - restW.x, l.foot.z - restW.z) > L * .34) this.startSwing(l, .1);
      }
      if (l.swing) {
        l.st += dt / l.dur; const s = Math.min(1, l.st);
        const tgt = restAt(l, lead);
        // lift-off leads the forward swing and set-down trails it, so the foot peels up and places down instead of sliding
        const e = smooth01(.1, .9, s), hgt = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), .75);
        l.foot.lerpVectors(l.from, tgt, e); l.foot.y += hgt * (lift + Math.max(0, tgt.y - l.from.y) * .6);
        l.foot.y = Math.max(l.foot.y, groundY(l.foot.x, l.foot.z));
        l.tuck = hgt;
        if (s >= 1) { l.swing = false; l.tuck = 0; l.foot.copy(tgt); }
      }
      let foot = l.foot, tuck = l.tuck, raised = 0;
      const ra = raiseAmt(l);
      if (ra > .01) { // front legs lifted: threat display / rearing before a strike
        // held forward-up at ~45° once the body pitches back; legs stay flexed (not poker-straight) and quiver slightly
        const up = this.worldOf(new V3(l.s * L * (l.i ? .3 : .2), L * (l.i ? .08 : .13), L * (l.i ? .2 : .32)));
        up.y += Math.sin(now * 5.3 + l.i * 2 + l.s) * L * .006 * ra;
        foot = l.foot.clone().lerp(up, ra); tuck = tuck * (1 - ra); raised = ra;
      } else if (this.probe && this.probe.leg === l) { // tasting the ground ahead
        const q = Math.sin(Math.PI * clamp(this.probe.t / this.probe.dur, 0, 1));
        foot = l.foot.clone().add(new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(L * .06 * q)); foot.y += L * .05 * q * (1 + .4 * Math.sin(this.probe.t * 18)); tuck = q * .5;
      }
      this.solve(l, foot, tuck, raised);
    });

    // pedipalps: sweep and tap the ground while walking; hold prey when eating
    this.palpT += dt * (moving ? freq * 1.2 : .9);
    this.palps.forEach(p => {
      let t;
      if (st.flip > .25) t = this.worldOf(new V3(p.s * L * .05, -L * .14, L * .16));
      else if (st.threat > .05 || st.rear > .05) { const k = Math.max(st.threat, st.rear); const g = this.worldOf(p.rest); g.y = groundY(g.x, g.z); t = g.lerp(this.worldOf(new V3(p.s * L * .09, L * .14, L * .24)), k); }
      else if (st.eat > .05) t = this.worldOf(new V3(p.s * L * .045, -L * .05, L * .2));
      else { const ph = this.palpT * Math.PI * 2 + (p.s > 0 ? 0 : Math.PI);
        t = this.worldOf(p.rest.clone().add(new V3(0, 0, Math.sin(ph) * L * .03))); t.y = groundY(t.x, t.z) + Math.max(0, Math.sin(ph)) * L * .03; }
      p.foot.lerp(t, clamp(dt * 12, 0, 1)); this.solve(p, p.foot, .35);
    });

    // abdomen: damped spring follows turns and acceleration, plus slow breathing
    const acc = this.vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3)); this.prevVel.copy(this.vel);
    const fwdAcc = acc.x * Math.sin(this.yaw) + acc.z * Math.cos(this.yaw);
    const A = this.abd, kS = 70, cS = 10;
    const gaitSway = moving ? Math.sin(this.phase * Math.PI * 2) * .035 * clamp(speed / (L * .5), 0, 1) : 0; // each tetrapod push nudges the abdomen sideways
    A.yv += ((-this.yawRate * .12 + gaitSway) - A.yaw) * kS * dt - A.yv * cS * dt; A.yaw += A.yv * dt;
    A.pv += ((clamp(fwdAcc / (L * 12), -.25, .25) + Math.sin(now * 1.4) * .015 - st.threat * .25) - A.pitch) * kS * dt - A.pv * cS * dt; A.pitch += A.pv * dt;
    this.abdPivot.rotation.set(A.pitch, A.yaw, 0);
    this.abdMesh.scale.y = L * .08 * (1 + Math.sin(now * 1.4) * .012);
    // fangs unfold, chelicerae saw while feeding
    const fAng = lerp(4.46, 2.55, st.fang);
    this.fangs.forEach(f => f.rotation.x = fAng);
    this.chel.forEach((c, j) => c.rotation.x = st.eat * Math.sin(now * 7 + j * Math.PI) * .12 - st.threat * .2);
    // idle: occasionally probe the ground with a front leg
    if (!moving && st.threat < .1 && st.flip < .1 && !this.probe) { this.probeCD -= dt; if (this.probeCD < 0) { this.probe = { leg: this.legs[Math.random() < .5 ? 0 : 4], t: 0, dur: rand(.7, 1.2) }; this.probeCD = rand(2.5, 6); } }
    HAIR_U.uAgit.value = lerp(HAIR_U.uAgit.value, clamp(speed / (L * 1.2), 0, 1) + st.threat * .6, clamp(dt * 4, 0, 1));
    // freshly molted cuticle is pale and soft; pre-molt darkens as the new skin forms beneath
    // (albedos are small under this rig's strong lights, so "pale" is a gentle lift toward tan, not a blend to white)
    const pale = this.soft, dark = typeof S !== 'undefined' && S && S.phase === 'premolt' ? .7 : 1, paleC = new THREE.Color(.075, .065, .05);
    this.tint.forEach(([mm, base]) => mm.color.copy(base).multiplyScalar(dark * (1 + pale * .5)).lerp(paleC, pale * .35 * (mm.vertexColors ? 0 : 1)));
    this.mats.hair.emissive.setRGB(.012, .011, .009).multiplyScalar(pale); this.mats.legHair.emissive.copy(this.mats.hair.emissive);
    this.mats.fang.color.set(pale > .3 ? 0xd9d2c4 : 0x050403);
  }
}
