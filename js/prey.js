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
    const geo = seg(len, k).clone(); geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d))); batch.add(j, geo);
    joints.push(j); par = j; p = d.multiplyScalar(len); });
  return joints;
}
const PREY_KINDS = {};

/* ---------- Blaptica dubia: 1 merged shell mesh (canvas texture) + 1 LimbBatch mesh for 6 legs and 2 antennae ----------
   Flat glossy oval. The pronotum shield hides the head from above. Females: no wings, the abdomen is a stack of
   overlapping dark-chocolate plates with faint tan edges. Males (~40 %): slimmer, long mottled tan wings. */
// body outline: t = 0 tail … 1 front of the pronotum; plates = rear edges of the overlapping plates (pronotum first)
const DUBIA_SHAPE = {
  f: { L: 1.95, W: .64, H: .23, B: .08, Y: .14, tc: .42, pr: 2.2, pf: 2.7, et: .75, plates: [.66, .59, .52, .45, .385, .32, .255, .19, .13, .07] },
  m: { L: 2.12, W: .5, H: .19, B: .1, Y: .15, tc: .5, pr: 3.4, pf: 2.4, et: .95, plates: [.68] } };
const DUBIA_TEX = {}, DUBIA_BW = 224;          // atlas: x < 224 = shell (around the body × along it), right strip = solid patches
// which plate t sits on: [k, q] with q = 0 at the plate's rear edge … 1 at its front edge
function dubiaPlate(pl, t) { let prev = 1; for (let i = 0; i < pl.length; i++) { if (t > pl[i]) return [i, (t - pl[i]) / (prev - pl[i])]; prev = pl[i]; } return [pl.length, t / prev]; }
function dubiaTex(male) {
  const key = male ? 'm' : 'f'; if (DUBIA_TEX[key]) return DUBIA_TEX[key];
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data, pl = DUBIA_SHAPE[key].plates;
  const C = { dk: [15, 7, 3], warm: [40, 18, 7], tan: [104, 52, 20], edge: [120, 68, 30], amber: [98, 54, 22], b1: [40, 21, 11], b2: [72, 40, 20],
    wing: [70, 45, 24], wdk: [34, 21, 11], wpale: [104, 74, 42], head: [36, 19, 10], eye: [6, 4, 3], cer: [44, 24, 12] };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  for (let y = 0; y < H; y++) { const t = 1 - (y + .5) / H, [k, q] = dubiaPlate(pl, t);
    for (let x = 0; x < W; x++) { let col;
      if (x >= DUBIA_BW) col = y < 128 ? C.head : y < 256 ? C.eye : y < 384 ? C.cer : C.b1;          // head / eyes / cerci patches
      else { const a = (x + .5) / DUBIA_BW * 6.2832, side = Math.abs(Math.cos(a)), n = fbm(side * 5 + (male ? 9 : 0), t * 16, .5, 3), fine = fbm(side * 40, t * 90, 2.5, 2);
        if (a > Math.PI) {                                                 // belly: reddish-brown sternites, darker seams
          col = mix(C.b2, C.b1, side); if (t < .7 && q < .08) col = mul(col, .55 + q * 5);
          if (t > .72) col = mul(col, .75);
        } else if (k === 0) {                                              // pronotum: smooth dark shield, amber rim
          col = mix(C.dk, C.warm, side * side * side * .7);
          col = mix(col, C.amber, Math.max(sstep(.8, .985, side), sstep(.93, .995, t)) * (male ? .8 : .65));
          col = mul(col, 1 + n * .35 + fine * .12);
        } else if (male) {                                                 // wings: mottled tan, veins, dark overlap seam
          col = mix(C.wing, C.wdk, clamp(.45 + n * 1.4, 0, 1) * .7);
          const v = Math.abs(frac(side * 7 - (.7 - t) * 1.6) - .5); col = mul(col, 1 - .12 * sstep(.05, .01, v));
          col = mix(col, C.wpale, sstep(.86, .99, side) * .55 + sstep(.14, .02, t) * .3);
          col = mix(col, C.dk, sstep(.035, .005, side) * .7 + sstep(.8, 1, q) * .5);
          col = mul(col, 1 + fine * .1);
        } else {                                                           // female tergites: chocolate plates, tan lateral edges
          col = mix(C.dk, C.warm, side * side * .8);
          col = mix(col, C.tan, sstep(.7, .97, side) * (.35 + .5 * (1 - q)));
          if (q < .08) col = mix(col, C.edge, (1 - q / .08) * (.2 + .5 * side * side));
          col = mul(col, (1 - .25 * sstep(.8, 1, q)) * (1 + n * .4 + fine * .12));
        }
      }
      const o = (y * W + x) * 4; d[o] = clamp(col[0], 0, 255); d[o + 1] = clamp(col[1], 0, 255); d[o + 2] = clamp(col[2], 0, 255); d[o + 3] = 255; } }
  g.putImageData(im, 0, 0);
  const tx = DUBIA_TEX[key] = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding; tx.anisotropy = MAX_ANISO; return tx;
}
// join static pieces (position, normal, uv) into one geometry
function mergeGeos(list) {
  let nv = 0, ni = 0; list.forEach(g => { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
  let v = 0, o = 0; list.forEach(g => { const n = g.attributes.position.count; P.set(g.attributes.position.array, v * 3); N.set(g.attributes.normal.array, v * 3); U.set(g.attributes.uv.array, v * 2);
    if (g.index) g.index.array.forEach(i => I[o++] = i + v); else for (let i = 0; i < n; i++) I[o++] = i + v; v += n; g.dispose(); });
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(P, 3)); G.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  G.setAttribute('uv', new THREE.BufferAttribute(U, 2)); G.setIndex(new THREE.BufferAttribute(I, 1)); return G;
}
// the shell: rings around the body from tail to head; each plate's rear rim rises a little over the next one (the overlap step)
function dubiaBody(male) {
  const sh = DUBIA_SHAPE[male ? 'm' : 'f'], { L, W, H, B, Y, tc, pr, pf, et, plates } = sh, z0 = 1 - L, M = 36;
  const wAt = t => t < tc ? W * Math.pow(Math.max(0, 1 - Math.pow((tc - t) / tc, pr)), 1 / pr) : W * Math.pow(Math.max(0, 1 - Math.pow((t - tc) / (1 - tc), pf)), 1 / pf);
  const ts = []; for (let i = 0; i <= 40; i++) ts.push(i / 40); ts.push(.006, .016, .984, .994);
  plates.forEach(b => ts.push(b - .004, b + .004, b + .02)); ts.sort((a, b) => a - b);
  const P = [], UV = [], I = [];
  ts.forEach(t => { const w0 = wAt(t), e = w0 / W, [k, q] = dubiaPlate(plates, t), f = k < plates.length ? Math.pow(1 - q, 1.6) : 0;
    const lw = k === 0 ? .06 : .018, lh = k === 0 ? .04 : .012;
    const w = w0 * (1 + lw * f), ht = (H * Math.pow(e, .6) * (1 - .9 * (t - .5) ** 2) + lh * f * Math.pow(e, .6)) * (male && k > 0 ? .95 : 1);
    const hb = B * Math.pow(e, .5) * (1 - .75 * sstep(.74, .97, t)), yc = Y + .07 * sstep(.68, 1, t) - .03 * (1 - sstep(0, .25, t)), z = z0 + t * L, ef = et + .45 * sstep(.64, .8, t);   // the pronotum gets a flat brim
    for (let j = 0; j <= M; j++) { const a = j / M * 6.2832, ca = Math.cos(a), sa = Math.sin(a);
      P.push(w * ca, sa >= 0 ? yc + ht * Math.pow(sa, 2 * ef) : yc - hb * Math.pow(-sa, .9), z); UV.push(j / M * DUBIA_BW / 256, t); } });
  for (let r = 0; r < ts.length - 1; r++) for (let j = 0; j < M; j++) { const a = r * (M + 1) + j, b = a + M + 1; I.push(a, a + 1, b, b, a + 1, b + 1); }
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); G.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  G.setIndex(I); G.computeVertexNormals();
  const N = G.attributes.normal, last = ts.length - 1;
  for (let r = 0; r <= last; r++) { const a = r * (M + 1), b = a + M; // close the seam, point the two tips along the body
    const n = r === 0 ? [0, .3, -1] : r === last ? [0, .3, 1] : [N.getX(a) + N.getX(b), N.getY(a) + N.getY(b), N.getZ(a) + N.getZ(b)], l = Math.hypot(...n);
    N.setXYZ(a, n[0] / l, n[1] / l, n[2] / l); N.setXYZ(b, n[0] / l, n[1] / l, n[2] / l);
    if (r === 0 || r === last) for (let j = 1; j < M; j++) N.setXYZ(a + j, 0, .29, r ? .96 : -.96); }
  // solid-coloured pieces point their uv at a patch of the atlas
  const piece = (geo, u, v, m) => { geo.applyMatrix4(m); const U = geo.attributes.uv; for (let i = 0; i < U.count; i++) U.setXY(i, u, v); return geo; };
  const mat = (x, y, z, rx, sx, sy, sz, ry) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry || 0, 0)), new V3(sx, sy, sz));
  const parts = [G, piece(new THREE.SphereGeometry(1, 12, 8), .94, .88, mat(0, .16, .76, .9, .18, .12, .14))];   // head, tucked under the shield, face down
  [-1, 1].forEach(s => {
    parts.push(piece(new THREE.SphereGeometry(1, 6, 4), .94, .62, mat(s * .12, .2, .8, .3, .045, .035, .07)));                    // kidney eyes
    const cer = new THREE.ConeGeometry(.028, .17, 5); cer.translate(0, .085, 0);                                                        // cerci
    parts.push(piece(cer, .94, .38, new THREE.Matrix4().compose(new V3(s * .08, Y - .01, z0 + .07), new THREE.Quaternion().setFromUnitVectors(UP, new V3(s * .4, .12, -1).normalize()), new V3(1, 1, 1)))); });
  return mergeGeos(parts);
}
// a tapered tube along pts (legs, antennae) with vertex colours; flat < 1 squashes it; spines = little cones leaning toward the tip
function dubiaTube(pts, radii, col, flat, spines, spCol, spLen) {
  const n = 5, P = [], Nn = [], Cc = [], I = [], m = pts.length, put = (p, nr, c) => { P.push(p.x, p.y, p.z); Nn.push(nr.x, nr.y, nr.z); Cc.push(c.r, c.g, c.b); return P.length / 3 - 1; };
  const T = new V3(), u = new V3(), w = new V3(), q = new V3(), nr = new V3();
  pts.forEach((p, k) => { T.subVectors(pts[Math.min(k + 1, m - 1)], pts[Math.max(k - 1, 0)]).normalize(); u.crossVectors(Math.abs(T.y) > .9 ? new V3(1, 0, 0) : UP, T).normalize(); w.crossVectors(T, u);
    for (let j = 0; j < n; j++) { const a = j / n * 6.2832; nr.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      put(q.copy(p).addScaledVector(u, Math.cos(a) * radii[k]).addScaledVector(w, Math.sin(a) * radii[k] * flat), nr, col); } });
  for (let k = 0; k < m - 1; k++) for (let j = 0; j < n; j++) { const a = k * n + j, b = k * n + (j + 1) % n; I.push(a, b, a + n, b, b + n, a + n); }
  const tip = put(q.copy(pts[m - 1]).addScaledVector(T, radii[m - 1]), T, col), o = (m - 1) * n;
  for (let j = 0; j < n; j++) I.push(o + j, o + (j + 1) % n, tip);
  for (let s = 0; s < (spines || 0); s++) { const k = s / Math.max(1, spines - 1) * .75 + .15, a = s * 2.4 + 1, base = pts[0].clone().lerp(pts[m - 1], k), r = lerp(radii[0], radii[m - 1], k) * .8;
    T.subVectors(pts[m - 1], pts[0]).normalize(); u.crossVectors(Math.abs(T.y) > .9 ? new V3(1, 0, 0) : UP, T).normalize(); w.crossVectors(T, u);
    const out = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)), ax = out.clone().multiplyScalar(.6).addScaledVector(T, .8).normalize(); base.addScaledVector(out, r);
    const e1 = new V3().crossVectors(ax, out).normalize(), e2 = new V3().crossVectors(ax, e1), b = [];
    for (let i = 0; i < 3; i++) { const an = i * 2.094; nr.copy(e1).multiplyScalar(Math.cos(an)).addScaledVector(e2, Math.sin(an)); b.push(put(q.copy(base).addScaledVector(nr, .009), nr, spCol)); }
    const ti = put(q.copy(base).addScaledVector(ax, spLen), ax, spCol);
    for (let i = 0; i < 3; i++) I.push(b[i], b[(i + 1) % 3], ti); }
  const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  G.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); G.setIndex(I); return G;
}
// legs: hip (under the body), [femur dir + len], tibia dir (its length is solved so the tarsus lands on the ground), [tarsus dir + len], spines
const DUBIA_LEGS = [
  [[.12, .1, .5], [.8, .05, .6, .5], [.5, -.4, .6], [.2, -.1, 1, .2], 3],
  [[.17, .1, .3], [1, .05, .05, .56], [.6, -.35, -.4], [.35, -.1, -.6, .2], 4],
  [[.19, .1, .12], [.75, .04, -.6, .62], [.45, -.2, -.9], [.3, -.08, -1, .25], 5]];
PREY_KINDS.dubia = (p, g) => {
  const male = p.male = Math.random() < .4;
  const shell = track(new THREE.MeshPhysicalMaterial({ map: dubiaTex(male), roughness: male ? .7 : .72, reflectivity: .25, clearcoat: male ? .75 : 1, clearcoatRoughness: male ? .18 : .07 }), .3);
  shell.color.setScalar(rand(.85, 1.1));
  g.add(new THREE.Mesh(dubiaBody(male), shell));
  const legMat = track(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .5, clearcoat: .5, clearcoatRoughness: .25 }), .3), batch = new LimbBatch(g, legMat);
  const cFem = lin(0x24120a), cTib = lin(0x3c1f0e), cTar = lin(0x522e15), cSp = lin(0x0e0704), cAnt = lin(0x1e110a);
  [-1, 1].forEach(s => {
    DUBIA_LEGS.forEach(([h, f, tb, ta, sp], i) => {
      const fd = new V3(f[0], f[1], f[2]).normalize(), td = new V3(tb[0], tb[1], tb[2]).normalize(), ad = new V3(ta[0], ta[1], ta[2]).normalize();
      const tl = (h[1] + fd.y * f[3] + ad.y * ta[3] - .01) / -td.y;           // tibia length that puts the foot on the ground
      const segs = [dubiaTube([new V3(), new V3(0, f[3] * .3, 0), new V3(0, f[3], 0)], [.085, .062, .044], cFem, .6),
        dubiaTube([new V3(), new V3(0, tl, 0)], [.038, .027], cTib, .8, sp, cSp, .08), dubiaTube([new V3(), new V3(0, ta[3] * .5, 0), new V3(0, ta[3], 0)], [.02, .016, .01], cTar, 1)];
      const J = limbJoints(g, new V3(s * h[0], h[1], h[2]), [[s * f[0], f[1], f[2], f[3]], [s * tb[0], tb[1], tb[2], tl], [s * ta[0], ta[1], ta[2], ta[3]]], batch, (len, k) => segs[k]);
      p.legs.push({ j: [J[0], J[1]], s, i }); });
    // long thin antennae from under the front of the shield, arching out and forward
    const pv = new THREE.Group(); pv.position.set(s * .08, .2, .9); g.add(pv);
    const pts = [], rad = [], len = male ? 1.45 : 1.3;
    for (let k = 0; k <= 11; k++) { const t = k / 11; pts.push(new V3(s * len * (.16 * t + .2 * t * t), len * (.26 * t - .17 * t * t), len * (t - .12 * t * t))); rad.push(.016 * (1 - t) + .005); }
    batch.add(pv, dubiaTube(pts, rad, cAnt, 1)); p.ant.push({ pv, s }); });
  p.limbs = batch; batch.build();
  g.scale.setScalar(1.3 * (male ? rand(.95, 1.03) : rand(.93, 1.05)));   // adult ≈ 2.5 units long
  p.value = 35; p.speed = 3.2; p.vib = .9;
};
setTimeout(() => { dubiaTex(false); dubiaTex(true); }, 4000);   // paint both shell textures early, so the first roach doesn't hitch

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
// prey steering: is (x, z) blocked for a prey body (tank edge, rocks + pond, building walls, the log)?
function preyBlocked(x, z, k) {
  if (!inTank(x, z, 2)) return true;
  for (const o of preyObs) if (Math.hypot(x - o.x, z - o.z) < o.r * 1.1 + .4) return true;
  for (const b of SOLIDS) if (solidNear(b, x, z).d < .5 * (k || 1) + .2) return true;
  const q = logLocal(x, z); return Math.abs(q.al) < LOG_HL + .6 && Math.abs(q.sd) < LOG_HW + .6;
}
// best heading out of here: open ground ahead (up to R), and when fleeing, away from the spider (open space vs distance)
function openDir(p, sp, flee, R) {
  R = R || 7; let best = p.face, bs = -1e9; const ax = p.pos.x - sp.pos.x, az = p.pos.z - sp.pos.z, al = Math.hypot(ax, az) || 1;
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.2832 + rand(-.12, .12), dx = Math.sin(a), dz = Math.cos(a); let free = 0;
    for (let r = .7; r <= R; r += .7) { if (preyBlocked(p.pos.x + dx * r, p.pos.z + dz * r, p.k)) break; free = r; }
    const s = free / R * 2 - (free < 1.5 ? 3 : 0) + (flee ? (dx * ax + dz * az) / al * 1.7 : .4 * Math.cos(a - p.face)) - (p.stuckA != null ? .8 * Math.max(0, Math.cos(a - p.stuckA)) : 0);
    if (s > bs) { bs = s; best = a; } }
  return best;
}
class Prey {
  constructor(kind, who, at) {
    this.kind = kind; if (kind === 'human') { this.who = who || 'chai'; const P = PEOPLE[this.who]; this.name = P.name; this.nervous = P.nervous; } this.burrowed = 0; this.rising = false; this.vibT = 0; this.eaten = false; this.held = false; this.heldT = 0; this.walk = 0; this.gaitK = 0;
    let x, z, k = 0; do { x = rand(-TW / 2 + 3, TW / 2 - 3); z = rand(-TD / 2 + 3, TD / 2 - 3); } while ((!clearSpot(x, z) || (spider && Math.hypot(x - spider.pos.x, z - spider.pos.z) < spider.span * 1.6)) && k++ < 60);
    if (kind === 'human') { const h = at || humanSpawn(prey.filter(q => q.kind === 'human' && !q.eaten).map(q => q.pos)); x = h.x; z = h.z; this.spawnName = h.name; }   // never a random spot (could be inside a building / out of sight)
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
        if ((this.fleeDT = (this.fleeDT || 0) - dt) <= 0) { this.fleeDT = .5; this.yaw = openDir(this, sp, true); } this.v = this.speed * 1.6;
        if (Math.random() < dt * .35) { this.burrowed = .01; this.t = rand(8, 16); log('ดูเบียมุดลงดินหนีผู้ล่า แมงมุมจึงจับแรงสั่นไม่ได้', true); }
      } else if (this.t < 0) { this.t = rand(1, 4); this.v = Math.random() < .55 ? this.speed * rand(.4, 1) : 0; if (!(this.unstuckT > 0)) this.yaw += rand(-1.5, 1.5); }
    } else {
      if (this.hop > 0) this.hop -= dt;
      if (this.crouch > 0) { this.crouch -= dt * tm; if (this.crouch <= 0) { this.crouch = 0; this.v = this.jv; this.vy = this.jvy; this.hop = .5; this.kick = .14; } }
      else if (this.t < 0) { this.t = rand(.6, 2.5); const turn = !(this.unstuckT > 0);
        if (Math.random() < .5) { if (turn) this.yaw += rand(-1.5, 1.5); this.jump(this.speed * rand(1.2, 2), rand(5, 9)); } else { this.v = Math.random() < .5 ? this.speed * .4 : 0; if (turn) this.yaw += rand(-1, 1); } }
      if (threatNear && sp.mode === 'hunt' && !(this.flushT > 0) && this.hop <= 0 && Math.random() < dt * .5) { this.yaw = this.face = openDir(this, sp, true); this.jump(this.speed * 2.2, 8); }
      // males chirp at night: forewings raised and rubbed together
      if (this.chirp > 0) this.chirp -= dt; else if (isNight() && this.v < .3 && this.y <= 0 && !threatNear && Math.random() < dt * .06) this.chirp = rand(1.2, 3);
    }
    // the body turns toward where it wants to go (fast while squatting to jump) instead of snapping round
    if (this.flushT > 0) this.flushT -= dt;
    const air = this.y > .05, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    if (!air) { const tr = (this.crouch > 0 ? 14 : this.kind === 'cricket' ? 5 : this.kind === 'human' ? HUM.turn : 4) * dt * tm; this.face += clamp(wrap(this.yaw - this.face), -tr, tr); }
    const v = air ? this.v : this.crouch > 0 ? 0 : this.v * clamp(Math.cos(wrap(this.yaw - this.face)) * .85 + .15, .1, 1);
    this.pos.x += Math.sin(this.face) * v * dt * tm; this.pos.z += Math.cos(this.face) * v * dt * tm;
    if (!inTank(this.pos.x, this.pos.z, 2)) { this.yaw += Math.PI; this.pos.x = clamp(this.pos.x, -TW / 2 + 2, TW / 2 - 2); this.pos.z = clamp(this.pos.z, -TD / 2 + 2, TD / 2 - 2); }
    for (const o of preyObs) { const dx = this.pos.x - o.x, dz = this.pos.z - o.z, dd = Math.hypot(dx, dz) || 1, rr = o.r * 1.1 + .4;
      if (dd < rr && this.y < o.h) { this.pos.x = o.x + dx / dd * rr; this.pos.z = o.z + dz / dd * rr; this.yaw = Math.atan2(dx, dz) + rand(-1, 1); } }
    for (const k of SOLIDS) { const n = solidNear(k, this.pos.x, this.pos.z), rr = .5 * this.k;      // building walls
      if (n.d < rr && this.y < k.h) { this.pos.x += n.nx * (rr - n.d); this.pos.z += n.nz * (rr - n.d); this.yaw = Math.atan2(n.nx, n.nz) + rand(-1, 1); } }
    if (pushOutOfLog(this.pos, .6)) this.yaw += Math.PI * rand(.6, 1.4);
    // stuck watchdog: it wants to move but hardly gets anywhere (a corner, a wall) → turn out toward open ground, away from
    // the way it was trying to go, and keep that heading for a moment (corners are fine to enter, never to stay in)
    if (this.unstuckT > 0) this.unstuckT -= dt * tm;
    if (this.sx == null) { this.sx = this.pos.x; this.sz = this.pos.z; this.want = 0; this.watchT = 0; }
    this.want += (air ? 0 : v) * dt * tm; this.watchT += dt * tm;
    if (this.watchT > 1.2) { const moved = Math.hypot(this.pos.x - this.sx, this.pos.z - this.sz);
      if (this.want > .6 && moved < this.want * .3 && this.burrowed <= 0) { this.stuckA = this.face; this.yaw = this.face = openDir(this, sp, threatNear && sp.mode === 'hunt');
        this.unstuckT = 1.5; this.fleeDT = 1.5; this.t = Math.max(this.t, 1.5); this.stuckN = (this.stuckN || 0) + 1;
        if (this.ai) { const R = this.ai.route; this.ai.repl = 0; if (R.length) this.ai.route = humanRoute(this.pos, R[R.length - 1]); } } else this.stuckA = null;
      this.sx = this.pos.x; this.sz = this.pos.z; this.want = 0; this.watchT = 0; }
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
  // a person (ชัยภัทร 1.78 / ตุ้ย 1.70, town scale): the survival round's AI drives them (js/survive.js)
  human(dt, sp, d) { if (this.ai) humanAI(this, dt, sp, d); }
  setOpacity(op) { // materials only go transparent while the roach is digging in, so normal rendering keeps depth sorting
    if (Math.abs(op - this.opacity) < .005) return; this.opacity = op;
    this.mats.forEach(m => { const tr = op < .999; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; m.depthWrite = !tr; });
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = op > .5; });
  }
  remove() { this.eaten = true; this.held = false; if (this.bubble) { this.bubble.remove(); this.bubble = null; } scene.remove(this.mesh); this.mesh.traverse(o => o.geometry && o.geometry.dispose()); this.mats.forEach(m => { envMats.delete(m); m.dispose(); }); }
}

