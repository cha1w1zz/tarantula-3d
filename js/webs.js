'use strict';
/* Decorative spider webs (phase 5.5): built once at load from a fixed seed; not solid, no shadows.
   orb = spokes + spiral (walls, eaves, poles, rocks, ferns, the log's back end); sheet = funnel webs in ground crevices;
   tangle = cobwebs in corners; hang = threads under eaves, signs, wires (some with a drop).
   Anchors = ray casts on the real meshes + soil. 3 draw calls: LineSegments (threads), Mesh (sheet film), Points (dew).
   Fibre glints, backlit glow, neon at night, dew after misting / at dawn, sway on the grass wind clock (TURF_U.uTime). */
const WEBS = (() => {
  let R = seeded(5505), cN = 0;   // one seeded stream per placement group (see tries)
  const { min, max, abs, hypot, round, pow, floor, PI } = Math, t0 = performance.now(), rr = (a, b) => a + R() * (b - a), TAU = PI * 2, UP = new V3(0, 1, 0);
  const pick = a => a[R() * a.length | 0], mod = a => (a % TAU + TAU) % TAU, V = (x, y, z) => new V3(x, y, z), ad = (a, d, s) => a.clone().addScaledVector(d, s), cs = Math.cos, sn = Math.sin, gy = p => soilY(p.x, p.z), ang = () => rr(0, TAU);

  // ---- 1. all solid triangles in a 1-unit xz grid (for ray casts)
  const skip = new Set();
  if (spider) spider.root.traverse(o => skip.add(o));
  prey.forEach(p => p.mesh && p.mesh.traverse(o => skip.add(o)));
  scene.updateMatrixWorld(true);
  const src = [], stems = [];
  scene.traverse(o => { const m = o.material;
    if (!o.isMesh || o.isInstancedMesh || skip.has(o) || !m || !m.isMeshStandardMaterial || !(o.castShadow || o === CITY.meshes[1])) return;
    (o.geometry.attributes.aRoot ? stems : src).push(o); });   // fern stems: only for fern webs (world.js places them randomly)
  let nT = 0; src.forEach(o => { const g = o.geometry; nT += (g.index ? g.index.count : g.attributes.position.count) / 3 | 0; });
  const TRI = new Float32Array(nT * 9), v = V(); let n = 0;
  src.forEach(o => { const g = o.geometry, p = g.attributes.position, ix = g.index, c = (ix ? ix.count : p.count) / 3 * 3 | 0;
    for (let i = 0; i < c; i++) { v.fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(o.matrixWorld); TRI[n++] = v.x; TRI[n++] = v.y; TRI[n++] = v.z; } });
  const GW = TW, GD = TD, CNT = new Int32Array(GW * GD + 1);
  const mm = (b, f, o, h, M) => clamp(floor(f(TRI[b + o], TRI[b + o + 3], TRI[b + o + 6]) + h), 0, M - 1);
  const cells = (i, fn) => { const b = i * 9; if (min(TRI[b + 1], TRI[b + 4], TRI[b + 7]) > TH - 3) return;   // skip the lid fixtures
    for (let z = mm(b, min, 2, TD / 2, GD); z <= mm(b, max, 2, TD / 2, GD); z++) for (let x = mm(b, min, 0, TW / 2, GW); x <= mm(b, max, 0, TW / 2, GW); x++) fn(z * GW + x); };
  for (let i = 0; i < nT; i++) cells(i, c => CNT[c + 1]++);
  for (let c = 0; c < GW * GD; c++) CNT[c + 1] += CNT[c];
  const IDX = new Int32Array(CNT[GW * GD]), fill = CNT.slice();
  for (let i = 0; i < nT; i++) cells(i, c => IDX[fill[c]++] = i);

  // ray/triangle (both faces): distance or 1e9
  function triT(i, o, d) {
    const b = i * 9, ax = TRI[b], ay = TRI[b + 1], az = TRI[b + 2];
    const e1x = TRI[b + 3] - ax, e1y = TRI[b + 4] - ay, e1z = TRI[b + 5] - az, e2x = TRI[b + 6] - ax, e2y = TRI[b + 7] - ay, e2z = TRI[b + 8] - az;
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x, det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-10 && det < 1e-10) return 1e9;
    const inv = 1 / det, sx = o.x - ax, sy = o.y - ay, sz = o.z - az, u = (sx * px + sy * py + sz * pz) * inv; if (u < 0 || u > 1) return 1e9;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, w = (d.x * qx + d.y * qy + d.z * qz) * inv; if (w < 0 || u + w > 1) return 1e9;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv; return t > 1e-4 ? t : 1e9;
  }
  const triNy = i => { const b = i * 9, e = o => V(TRI[b + o] - TRI[b], TRI[b + o + 1] - TRI[b + 1], TRI[b + o + 2] - TRI[b + 2]); return abs(e(3).cross(e(6)).normalize().y); };
  const stamp = new Int32Array(nT); let rid = 0, hitW = false, hitNy = 0;
  // distance along unit d to the first surface (soil or mesh) within L, else -1 (hitW: it was the water)
  function ray(o, d, L) {
    rid++; hitW = false; hitNy = 1;
    const ex = (p, q, m) => q > 1e-9 ? (m - p) / q : q < -1e-9 ? (-m - p) / q : 1e9;
    L = min(L, ex(o.x, d.x, TW / 2 - 1.2), ex(o.z, d.z, TD / 2 - 1.2), d.y > 1e-9 ? (TH - 4 - o.y) / d.y : 1e9);
    let best = L, bt = -1;
    if (d.y < .3) for (let t = .2; t < best + .2; t += .2) { const s = min(t, best);
      if (o.y + d.y * s < soilY(o.x + d.x * s, o.z + d.z * s)) { let a = s - .2, b = s;
        for (let k = 0; k < 7; k++) { const m = (a + b) / 2; if (o.y + d.y * m < soilY(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        best = b; hitW = inPond(o.x + d.x * b, o.z + d.z * b, .3); break; } }
    const fx = o.x + TW / 2, fz = o.z + TD / 2, sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    let ix = floor(fx), iz = floor(fz);
    const dx = abs(d.x) > 1e-9 ? abs(1 / d.x) : 1e9, dz = abs(d.z) > 1e-9 ? abs(1 / d.z) : 1e9;
    let tx = dx < 1e9 ? (d.x > 0 ? ix + 1 - fx : fx - ix) * dx : 1e9, tz = dz < 1e9 ? (d.z > 0 ? iz + 1 - fz : fz - iz) * dz : 1e9, tc = 0;
    while (tc <= best) {
      if (ix >= 0 && iz >= 0 && ix < GW && iz < GD) { const c = iz * GW + ix;
        for (let k = CNT[c], e = CNT[c + 1]; k < e; k++) { const i = IDX[k]; if (stamp[i] === rid) continue; stamp[i] = rid;
          const t = triT(i, o, d); if (t < best) { best = t; bt = i; hitW = false; } } }
      if (tx < tz) { tc = tx; tx += dx; ix += sx; } else { tc = tz; tz += dz; iz += sz; }
    }
    if (bt >= 0) hitNy = triNy(bt);
    return best < L ? best : -1;
  }
  const _d = V();
  const clear = (a, b) => { _d.subVectors(b, a); const L = _d.length(); return ray(a, _d.divideScalar(L), L - .03) < 0; };
  // open air? (not in soil, rock, building, pond, log; away from the log mouth and behind the back rows)
  function solidAt(p) {
    const { x, y, z } = p;
    if (!inTank(x, z, 2) || z < -35 || x > 52 || y > TH - 5 || y < soilY(x, z) + .2 || inPond(x, z, .6)) return true;
    for (const k of ROCKS) if (k.grid && gridY(k.grid, x, z) > y - .15) return true;
    for (const k of SOLIDS) if (solidNear(k, x, z).d < .08 && gridY(k.grid, x, z) > y) return true;
    if (hypot(x - LOG_ENTRY.x, z - LOG_ENTRY.z) < 6) return true;
    return underLog(x, z) && y < LOG.y + LOG.R + .5 && abs(logLocal(x, z).al) < LOG.len / 2 - .8;
  }

  // ---- 2. vertex streams per web (sorted by rank later: density = a draw range)
  // 13 floats/vertex: position, tangent (film: normal), sway vector, (sway weight, seed, fern #, alpha | dew size)
  const webs = []; let W = null, FERN = 0, SEED = 0; const SW = V(), _t = V(), ZERO = V();
  const begin = (rank, town, fern) => { W = { rank, L: [], F: [], D: [] }; webs.push(W); FERN = fern || 0; SEED = R() + (town ? 1 : 0); };
  const vtx = (A, p, t, w, a) => A.push(p.x, p.y, p.z, t.x, t.y, t.z, SW.x, SW.y, SW.z, w, SEED, FERN, a);
  const seg = (a, b, wa, wb, al) => { _t.subVectors(b, a).normalize(); vtx(W.L, a, _t, wa, al); vtx(W.L, b, _t, wb, al); };
  const dew = (p, w, s) => vtx(W.D, p, ZERO, w, s);
  const tri = (a, b, c, wa, wb, wc, aa, ab, ac) => { _t.subVectors(b, a).cross(v.subVectors(c, a)).normalize();
    vtx(W.F, a, _t, wa, aa); vtx(W.F, b, _t, wb, ab); vtx(W.F, c, _t, wc, ac); };
  const hubs = [], roomy = (p, r) => hubs.every(h => h.p.distanceTo(p) > h.r + r);

  // ---- 3. orb web: anchors P (points on surfaces) around hub C, plane normal nrm
  const xy = h => [h.r * cs(h.a), h.r * sn(h.a)];
  const margin = H => { if (H.length < 3) return 0; let m = 1e9;
    for (let i = 0; i < H.length; i++) { const A = H[i], B = H[(i + 1) % H.length], da = mod(B.a - A.a) || TAU; if (da > PI * .9) return 0;
      const [ax, ay] = xy(A), [bx, by] = xy(B); m = min(m, abs(ax * by - ay * bx) / hypot(bx - ax, by - ay)); } return m; };
  const basis = n => { const u = abs(n.y) > .95 ? V(1, 0, 0) : UP.clone().cross(n).normalize(), w = n.clone().cross(u); return [u, w, a => u.clone().multiplyScalar(cs(a)).addScaledVector(w, sn(a))]; };
  function orbFrom(C, nrm, P, Rmax, o) {
    const [u, vv, dir] = basis(nrm);
    let H = P.map(p => { const q = p.clone().sub(C); return { p, a: mod(Math.atan2(q.dot(vv), q.dot(u))), t: q.length() }; }).filter(h => h.t > .3).sort((a, b) => a.a - b.a);
    if (H.length < 3) return 0;
    const Rw = min(Rmax, H.map(h => h.t).sort((a, b) => a - b)[H.length * .6 | 0] * .9);
    H.forEach(h => h.r = min(h.t * rr(.6, .85), Rw * rr(.85, 1.1)));
    for (const want = 4 + (R() * 4 | 0); H.length > want;) { let bi = 0, bm = -1;
      for (let i = 0; i < H.length; i++) { const m = margin(H.filter((_, j) => j !== i)); if (m > bm) { bm = m; bi = i; } } H.splice(bi, 1); }
    const rm = H.reduce((s, h) => s + h.r, 0) / H.length;
    if (rm < (o.minR || .45) || margin(H) < .33 * rm) return 0;
    const F = H.map(h => ad(C, dir(h.a), h.r));
    if (!o.fern) for (let i = 0; i < F.length; i++) if (!clear(F[i], F[(i + 1) % F.length]) || !clear(F[i], H[i].p)) return 0;
    const rad = a => { for (let i = 0; i < H.length; i++) { const A = H[i], B = H[(i + 1) % H.length], da = mod(B.a - A.a) || TAU;
        if (mod(a - A.a) <= da) { const [ax, ay] = xy(A), [bx, by] = xy(B), qx = bx - ax, qy = by - ay;
          return (ax * qy - ay * qx) / (cs(a) * qy - sn(a) * qx); } } return rm; };
    const Ns = clamp(round(10 + rm * 5), 12, 30), S = [];
    for (let k = 0; k < Ns; k++) { const a = (k + rr(-.2, .2)) / Ns * TAU, r = rad(a) * .985, d = dir(a); S.push({ a, r, d });
      if (!o.fern && k % 3 === 0 && !clear(C, ad(C, d, r))) return 0; }
    begin(o.rank == null ? R() : o.rank, inCity(C.x, C.z), o.fern);
    hubs.push({ p: C.clone(), r: rm * 1.05, n: nrm, k: 'orb' });
    SW.copy(nrm).multiplyScalar(rm * rr(.035, .07));
    const al = rr(.55, 1), Rin = min(...S.map(s => s.r)), pt = (k, f) => ad(C, S[k].d, f * lerp(Rin, S[k].r, f));
    H.forEach((h, i) => { seg(F[i], F[(i + 1) % F.length], 0, 0, al); seg(F[i], h.p.clone().sub(C).setLength(h.t + .05).add(C), 0, 0, al * .9); });   // frame + moorings
    const holes = []; for (let i = R() < .55 ? R() * 3 | 0 : 0; i-- > 0;) holes.push([ang(), rr(.3, .9), rr(.12, .3)]);   // torn patches
    const torn = (a, f) => holes.some(([ha, hf, hr]) => { const da = abs(mod(a - ha + PI) - PI); return hypot(da * f, f - hf) < hr; });
    const f0 = rr(.16, .26), f1 = rr(.86, .94), sp = rr(.075, .13) * (.8 + rm * .12), Nt = clamp(round(rm * (f1 - f0) / sp), 5, 34);
    S.forEach((s, k) => { let fe = 1; for (let f = .1; f < 1; f += .05) if (torn(s.a, f)) { fe = f; break; }
      seg(C, pt(k, fe), 1, 1 - fe, al);
      if (fe < 1 && R() < .5) { const e = pt(k, fe), q = e.clone().add(V(rr(-.1, .1), -rr(.2, .6) * rm * .3, rr(-.1, .1))); seg(e, q, 1 - fe, 1.2, al * .8); } });   // broken spoke curls down
    for (let r = 0; r < 3; r++) { const f = .03 + r * .035 + rr(0, .02); for (let k = 0; k < Ns; k++) if (R() < .8) seg(pt(k, f), pt((k + 1) % Ns, f + rr(-.01, .01)), 1, 1, al); }   // hub mesh
    const pd = rr(.3, .7);
    let prev = null;
    for (let j = 0; j <= Nt * Ns; j++) { const k = j % Ns, f = f0 + (j / Ns + rr(-.1, .1)) * (f1 - f0) / Nt, p = pt(k, f);
      if (prev && !torn(S[k].a, f)) { seg(prev, p, 1 - prev.f, 1 - f, al * .8); if (R() < pd) dew(prev.clone().lerp(p, R()), 1 - f, rr(.018, .034) * (.9 + rm * .05)); }
      prev = p; p.f = f; }
    return 1;
  }
  // anchors = where 16 rays in the web's plane touch something
  function orb(C, nrm, Rmax, o) {
    if (solidAt(C) || !roomy(C, Rmax * .6)) return 0;
    const dir = basis(nrm)[2], P = [];
    for (let i = 0; i < 16; i++) { const a = (i + rr(-.3, .3)) / 16 * TAU, d = dir(a), t = ray(C, d, Rmax * (d.y < -.5 ? 3 : 1.7));
      if (t > .3 && !hitW) P.push(ad(C, d, t)); }
    return orbFrom(C, nrm, P, Rmax, o || {});
  }
  // web plane: across the narrowest gap, else straight out from the nearest wall
  function orient(C, L) {
    const hs = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + .1, d = V(cs(a), 0, sn(a)), t = ray(C, d, L); if (t > 0 && !hitW) hs.push({ a, t, d }); }
    if (!hs.length) return null;
    let best = null, bs = 1e9;
    for (const A of hs) for (const B of hs) if (abs(mod(B.a - A.a + PI) - PI) > 2.1 && A.t + B.t < bs) { bs = A.t + B.t; best = [A, B]; }
    const s = best ? best[1].d.clone().multiplyScalar(best[1].t).sub(best[0].d.clone().multiplyScalar(best[0].t)) : hs.reduce((m, h) => h.t < m.t ? h : m).d.clone();
    const nrm = V(-s.z, 0, s.x).normalize().applyAxisAngle(UP, rr(-.25, .25)); nrm.y = rr(-.3, .3); return nrm.normalize();
  }

  // ---- 4. sheet / funnel web: O = funnel mouth, just above the ground by a wall
  function sheet(O) {
    if (solidAt(O) || !roomy(O, 2)) return 0;
    const K = 14, a0 = ang(), B = []; let fi = -1, ft = 1e9;
    for (let i = 0; i < K; i++) { const a = a0 + i / K * TAU, d = V(cs(a), -.04, sn(a)).normalize(), t = ray(O, d, 3.4), wall = t > 0 && !hitW;
      const b = { a, r: wall ? t : rr(1.2, 2.8), wall, lift: wall ? rr(0, .25) : rr(-.05, .15) };
      if (!wall && inPond(O.x + d.x * b.r, O.z + d.z * b.r, .4)) return 0; B.push(b); if (wall && t < ft) { ft = t; fi = i; } }
    if (fi < 0 || ft > 1.7 || B.filter(b => b.wall).length < 2) return 0;
    const sh = (a, f) => { const x = mod(a - a0) / TAU * K, i = x | 0, s = x - i, A = B[i % K], C = B[(i + 1) % K], r = lerp(A.r, C.r, s), l = lerp(A.lift, C.lift, s);
      const p = V(O.x + cs(a) * r * f, O.y + l * f * f - .12 * f * (1 - f), O.z + sn(a) * r * f); p.y = max(p.y, gy(p) + .05); return p; };
    begin(R(), inCity(O.x, O.z)); hubs.push({ p: O.clone(), r: 2, k: 'sheet' });
    SW.set(0, rr(.03, .06), 0);
    const al = rr(.5, .85), mR = rr(.22, .4), fs = [.12, .35, .6, .82, 1], wt = f => f * (1 - f) * 2;
    // film: milky in the middle, fading at the free edges
    for (let r = 0; r < 4; r++) for (let i = 0; i < K; i++) { const a = B[i].a, b = B[(i + 1) % K].a, f = fs[r], g = fs[r + 1];
      const ed = c => r === 3 ? (c.wall ? .3 : .04) : .45 - g * .25, ea = ed(B[i]), eb = ed(B[(i + 1) % K]), ia = .5 - f * .25;
      tri(sh(a, f), sh(b, f), sh(b, g), wt(f), wt(f), wt(g), ia, ia, eb); tri(sh(a, f), sh(b, g), sh(a, g), wt(f), wt(g), wt(g), ia, eb, ea); }
    // funnel: tube from the mouth down into the crevice at the wall base
    const wd = V(cs(B[fi].a), 0, sn(B[fi].a)), E = ad(O, wd, ft + .1); E.y = gy(E) + .08;
    const ax = E.clone().sub(O), b1 = ax.clone().cross(UP).normalize(), b2 = b1.clone().cross(ax).normalize(), ring = (s, a) => O.clone().lerp(E, s).addScaledVector(b1, cs(a) * mR * (1 - s * .8)).addScaledVector(b2, sn(a) * mR * (1 - s * .8));
    for (let s = 0; s < 4; s++) for (let k = 0; k < 10; k++) { const a = k / 10 * TAU, b = (k + 1) / 10 * TAU, p = s / 4, q = (s + 1) / 4;
      tri(ring(p, a), ring(p, b), ring(q, b), 0, 0, 0, .4, .4, .45); tri(ring(p, a), ring(q, b), ring(q, a), 0, 0, 0, .4, .45, .45);
      seg(ring(p, a), ring(q, a), 0, 0, al * .7); if (s % 2 === 0) seg(ring(p, a), ring(p, b), 0, 0, al * .6); }
    // threads: radials, random mesh, lines up to the walls and down to the ground
    for (let i = 0; i < K; i++) { const a = a0 + (i + rr(-.3, .3)) / K * TAU; let q = sh(a, fs[0]); for (let r = 1; r < 5; r++) { const p = sh(a + rr(-.08, .08), fs[r]); seg(q, p, wt(fs[r - 1]), wt(fs[r]), al * .7); q = p; } }
    for (let i = 0; i < 170; i++) { const a = ang(), f = Math.sqrt(rr(.02, 1)), p = sh(a, f), q = sh(a + rr(-.5, .5), clamp(f + rr(-.25, .25), .1, 1)); seg(p, q, wt(f), wt(f), al * .55); }
    for (let i = 0; i < 10; i++) { const p = sh(ang(), rr(.3, .95)), d = V(rr(-1, 1), rr(.6, 1.6), rr(-1, 1)).normalize(), t = ray(p, d, 4);
      if (t > .3 && !hitW) seg(p, ad(p, d, t + .04), .2, 0, al * .7); }
    B.forEach(b => { if (b.wall || R() < .4) return; const p = sh(b.a, 1), q = p.clone().add(V(cs(b.a) * .3, 0, sn(b.a) * .3)); q.y = gy(q) - .02; seg(p, q, 0, 0, al * .7); });
    for (let i = 0; i < 60; i++) { const f = Math.sqrt(R()); dew(sh(ang(), f).add(V(0, .02, 0)), wt(f), rr(.02, .04)); }
    return 1;
  }

  // ---- 5. tangle, hanging thread
  function tangle(C, L, force) {
    if (!force && (solidAt(C) || !roomy(C, 1.2))) return 0;
    const H = []; for (let i = 0; i < 40; i++) { const d = V(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), t = ray(C, d, L);
      if (t > .15 && !hitW) H.push([ad(C, d, t - .04), ad(C, d, t + .04)]); }
    if (H.length < 14) return 0;
    begin(R(), inCity(C.x, C.z)); hubs.push({ p: C.clone(), r: L * .6, k: 'tangle' });
    SW.set(rr(-1, 1), rr(-.3, .3), rr(-1, 1)).setLength(rr(.04, .08));
    const al = rr(.45, .8), T = [];
    for (let i = 0, n = 0; i < 300 && n < 50; i++) { const A = pick(H), B = pick(H); if (A === B || A[0].distanceTo(B[0]) < .5 || !clear(A[0], B[0])) continue;
      const m = A[1].clone().lerp(B[1], .5); seg(A[1], m, 0, .6, al); seg(m, B[1], .6, 0, al); T.push([A[1], B[1]]); n++; }
    const on = ([a, b], s) => [a.clone().lerp(b, s), .6 * (1 - abs(2 * s - 1))];
    for (let i = 0; i < 70 && T.length > 1; i++) { const [p, wp] = on(pick(T), rr(.15, .85)), [q, wq] = on(pick(T), rr(.15, .85)); if (p.distanceTo(q) < 2) { seg(p, q, wp, wq, al * .8); if (R() < .15) dew(p, wp, rr(.02, .03)); } }
    return 1;
  }
  // look up from P for an underside (eave, sign, wire), hang 1-3 threads
  function hang(P, maxUp) {
    if (solidAt(P)) return 0;
    const t = ray(P, UP, maxUp); if (t < 0 || hitNy < .6) return 0;
    const top = ad(P, UP, t - .02), room = ray(top, V(0, -1, 0), 12); if (room > 0 && room < .8) return 0;
    begin(R(), inCity(P.x, P.z));
    for (let n = R() < .4 ? 1 : 1 + (R() * 3 | 0), i = 0; i < n; i++) {
      const o = i ? top.clone().add(V(rr(-.3, .3), 0, rr(-.3, .3))) : top, L = min(rr(.5, 4.5), (room > 0 ? room : 12) * .85), c = rr(-.04, .04) * L;
      const side = V(rr(-1, 1), 0, rr(-1, 1)).normalize(); SW.copy(side).multiplyScalar(L * rr(.08, .16));
      let q = o; for (let s = 1; s <= 6; s++) { const f = s / 6, p = o.clone().add(V(side.x * c * sn(PI * f), -L * f, side.z * c * sn(PI * f))); seg(q, p, pow((s - 1) / 6, 1.3), pow(f, 1.3), .9); q = p; }
      if (R() < .35) dew(q, 1, -rr(.05, .08));
    }
    return 1;
  }

  // ---- 6. placing them
  const at = (k, lx, lz, y) => V(k.x + lx * k.c + lz * k.s, y, k.z - lx * k.s + lz * k.c);
  const topOf = k => { let m = -1e9; for (const h of k.grid.H) m = max(m, h); return m; };
  const B = SOLIDS.map(k => ({ k, top: topOf(k), garden: k.b.garden }));
  // a point just outside a building (mostly the street side), fy = fraction of its height
  const around = (b, off, fy) => { const { k } = b, e = b.garden ? R() * 4 | 0 : pick([1, 1, 1, 2, 3, 2, 3, 0]), s = R() < .5 ? pick([-1, 1]) * rr(.8, 1) : rr(-1, 1);
    const [lx, lz] = e < 2 ? [s * k.hw, (e ? 1 : -1) * (k.hd + off)] : [(e === 2 ? 1 : -1) * (k.hw + off), s * k.hd];
    const p = at(k, lx, lz, 0), g = gy(p); p.y = g + .6 + (min(b.top, g + 18) - g - .6) * fy; return p; };
  const FERNS = [[24, -15, 9], [-2, -16.5, 8], [-25, 14, 7], [25, 13.5, 6.5], [13, -16.5, 6.5], [-27, -4, 6]].map(([x, z, s]) => { const [X, Z] = nat(x, z); return new THREE.Vector4(X, soilY(X, Z), Z, s * NS); });
  const POLES = CITY.props.filter(p => p.r === .6).map(p => [p.x, p.z]);
  const logEnd = ad(LOG.c, LOG.a, -LOG.len / 2 + .6);
  const orbAt = (p, L, Rm, o) => { const n = orient(p, L); return n && orb(p, n, Rm, o || {}); };
  const circ = (x, z, r, a, h) => { const p = V(x + cs(a) * r, 0, z + sn(a) * r); p.y = gy(p) + h; return p; };
  const tries = (n, max, fn) => { R = seeded(5505 + ++cN * 101); for (let i = 0, k = 0; i < max && k < n; i++) k += fn() ? 1 : 0; };

  // hero webs (always shown): the log's back end, a big one in the back street
  orb(V(logEnd.x, gy(logEnd) + 2.6, logEnd.z), LOG.a.clone(), 5.2, { rank: -1 });
  tries(1, 200, () => orbAt(around(pick(B.slice(0, 9)), rr(.5, 1.5), rr(.2, .5)), 9, 5.5, { rank: -1, minR: 2.2 }));
  // orbs: town, garden ruins, poles, rocks, log sides, ferns
  tries(40, 900, () => { const b = pick(B), g = b.garden; return orbAt(around(b, rr(.3, g ? 1.5 : 3), g ? rr(.05, .9) : pow(R(), 1.6)), g ? 4 : 8, g ? rr(1, 2.4) : rr(1.8, 5)); });
  tries(12, 250, () => { const [x, z] = pick(POLES); return orbAt(circ(x, z, rr(.5, 2.5), ang(), rr(3, 14.5)), 7, rr(1.5, 4)); });
  tries(8, 200, () => { const k = pick(ROCKS); return orbAt(circ(k.x, k.z, k.r * rr(.9, 1.6), ang(), rr(.5, k.h + .8)), 4, rr(.9, 2.2)); });
  tries(3, 80, () => { const p = logWorld(rr(-LOG.len / 2, LOG.len / 2 - 3), pick([-1, 1]) * (LOG.R + rr(.4, 1.5))); p.y = gy(p) + rr(.6, 3); return orbAt(p, 4, rr(1, 2.2)); });
  // sheet / funnel webs at ground level
  tries(6, 150, () => { const k = pick(ROCKS), a = ang(); for (let s = .7; s < 1.6; s += .1) { const p = circ(k.x, k.z, k.r * s, a, rr(.25, .6)); if (!solidAt(p)) return sheet(p); } return 0; });
  tries(9, 250, () => { const b = pick(B), p = around(b, rr(.4, 1.2), 0); p.y = gy(p) + rr(.3, .8); return sheet(p); });
  tries(4, 100, () => { const p = logWorld(rr(-LOG.len / 2, LOG.len / 2 - 3), pick([-1, 1]) * (LOG.R + rr(.5, 1.2))); p.y = gy(p) + rr(.3, .7); return sheet(p); });
  tries(2, 60, () => { const p = V(-1.2 + rr(-7, 7), 0, -23.2 + rr(-6, 6)); p.y = gy(p) + rr(.3, .8); return sheet(p); });   // rubble pile
  // cobwebs: under eaves, garden ruins, inside the log's back end
  tangle(ad(logEnd, LOG.a, 1.8).setY(LOG.y + LOG_RI - 1.2), 2.6, 1);
  tries(20, 500, () => { const b = pick(B), p = around(b, rr(.2, .9), b.garden ? rr(.1, .9) : pick([rr(.85, 1), rr(.15, .35), rr(0, 1)])); return tangle(p, 2.4); });
  // hanging threads: eaves, awnings, signs, wires
  tries(110, 1500, () => { const b = pick(B), p = around(b, rr(.1, 1.2), rr(.05, 1)); return hang(p, 3); });
  tries(18, 250, () => { const k = R() * 8 | 0, [x0, z0] = POLES[k], [x1, z1] = POLES[k + 1], o = pick([1.25, -1.25, 0, .85, -.85]), f = rr(.1, .9);
    const p = V(lerp(x0, x1, f) + (k >= 6 ? o : 0), 0, lerp(z0, z1, f) + (k < 6 ? o : 0)); p.y = gy(p) + 7; return hang(p, 8); });

  { // fern webs: two fronds + the ground (sway with the fern; last, as their stems are random)
    const fr = stems.map(o => { const p = o.geometry.attributes.position, r = o.geometry.attributes.aRoot, pts = [];
      for (let i = 0; i + 6 <= p.count; i += 6) { const c = V(); for (let j = 0; j < 6; j++) c.add(v.fromBufferAttribute(p, i + j)); pts.push(c.multiplyScalar(1 / 6)); }
      return { pts, f: FERNS.findIndex(F => hypot(F.x - r.getX(0), F.z - r.getZ(0)) < .5) }; }).filter(f => f.f >= 0);
    tries(5, 120, () => { const A = pick(fr), Bs = fr.filter(b => b !== A && b.f === A.f), iA = 6 + (R() * 12 | 0); if (!Bs.length) return 0;
      const P1 = A.pts[iA], B = Bs.reduce((m, b) => b.pts[iA].distanceTo(P1) < m.pts[iA].distanceTo(P1) ? b : m), P2 = B.pts[clamp(iA + (R() * 5 | 0) - 2, 4, 20)];
      const dd = P1.distanceTo(P2); if (dd < 1 || dd > 4) return 0;
      const G = P1.clone().lerp(P2, .5); G.y = gy(G) - .03; const C = P1.clone().add(P2).add(G).multiplyScalar(1 / 3); C.y += .15;
      const nrm = P2.clone().sub(P1).cross(G.clone().sub(P1)).normalize(); if (solidAt(C) || !roomy(C, .8)) return 0;
      return orbFrom(C, nrm, [P1, P2, G, A.pts[iA - 3], B.pts[iA - 3]], 1.3, { fern: A.f + 1 }); });
  }
  // ---- 7. buffers, materials
  webs.sort((a, b) => a.rank - b.rank);
  const u = v => ({ value: v }), U = { uTime: TURF_U.uTime, uFern: u(FERNS), uLd: u([0, 1, 2, 3].map(() => V())), uLc: u([0, 1, 2, 3].map(() => new THREE.Color())),
    uLp: u(V()), uLs: u(V()), uLpc: u(new THREE.Color()), uAmb: u(new THREE.Color()), uNight: u(0), uDew: u(0), uTw: u(1), uPx: u(600), uLw: u(1), uRes: u(new THREE.Vector2(1, 1)) };
  const VS=`uniform float uTime,uPx,uDew,uLw;uniform vec4 uFern[6];uniform vec2 uRes;
attribute vec3 aT,aN;attribute vec4 aP;
varying vec3 vW,vT;varying float vA,vS;
#include <fog_pars_vertex>
void main(){
 vec3 p=position;
 if (aP.z>.5) for (int i=0;i<6;i++) if (abs(aP.z-float(i+1))<.1){vec4 f=uFern[i];  // = world.js fernSway
 float fk=pow(clamp(length(p.xz-f.xz)/f.w,0.,1.2),2.),g=sin(dot(f.xz,vec2(.19,.13))-uTime*1.7)*.55+sin(uTime*2.3+f.x)*.25+.45+sin(uTime*5.+p.x*.8+p.z*.6)*.1;
 p+=vec3(.82*fk*f.w*.07*g,-fk*f.w*.02*abs(g),.57*fk*f.w*.07*g);}
 p+=aN*aP.x*(sin(dot(position.xz,vec2(.19,.13))-uTime*1.7)*.55+sin(uTime*2.3+position.x*.31+position.z*.2)*.3+sin(uTime*4.3+position.y*.9+position.x)*.15);
 vec4 mvPosition=viewMatrix*vec4(p,1.);
 gl_Position=projectionMatrix*mvPosition;
 vW=p;vT=aT;vS=aP.y;float d=max(-mvPosition.z,.1);
#ifdef DEW
 float s=abs(aP.w)*uPx/d*(aP.w<0. ? 1. : .5+.8*uDew);gl_PointSize=clamp(s,1.,9.);
 vA=(aP.w<0. ? .85 : .06+.94*uDew)*min(1.,s*s*.5);
#elif defined(FILM)
 vA=aP.w*clamp(22./d,.3,1.);
#else
 if (aP.w<0.){vec4 q=projectionMatrix*viewMatrix*vec4(p+aT*.1,1.);vec2 e=(q.xy/q.w-gl_Position.xy/gl_Position.w)*uRes;  // 2nd copy: 1 px to the side
 e=vec2(-e.y,e.x)/max(length(e),1e-5);gl_Position.xy+=e/uRes*2.*gl_Position.w;}
 vA=abs(aP.w)*clamp(20./d,.08,1.)*mix(.55,1.,smoothstep(3.,25.,d))*uLw*.6;  // thinner look up close
#endif
#include <fog_vertex>
}`;
  const FS=`uniform vec3 uLd[4],uLc[4],uLp,uLs,uLpc,uAmb;uniform float uNight,uTime,uDew,uTw;
varying vec3 vW,vT;varying float vA,vS;
#include <fog_pars_fragment>
vec3 V,N;
float term(vec3 L){
 float f=pow(max(dot(-V,L),0.),4.);  // backlit silk glows
#if defined(FILM)
 return abs(dot(N,L))*.25+f*2.4;
#elif defined(DEW)
 return .45+f*4.;
#else
 float tl=dot(N,L),th=dot(N,normalize(L+V));  // fibre sheen + glint
 return .3*sqrt(max(1.-tl*tl,0.))+1.6*pow(max(1.-th*th,0.),24.)+2.6*f;
#endif
}
void main(){
 V=normalize(cameraPosition-vW);N=normalize(vT+vec3(0.,1e-5,0.));
 vec3 c=uAmb;
 for (int i=0;i<4;i++) c+=uLc[i]*term(uLd[i]);
 vec3 L=normalize(uLp-vW);c+=uLpc*smoothstep(.8,1.,dot(-L,uLs))*term(L);  // heat lamp cone
 if (vS>1.) c+=uNight*uNight*.45*mix(vec3(1.,.3,.62),vec3(.25,.8,1.),step(.55,fract(vS*7.)));  // neon in town
 float lum=dot(c,vec3(.3,.55,.15));
#if defined(FILM)
 float fr=1.-abs(dot(N,V)),nz=.55+.45*sin(vW.x*13.+sin(vW.z*7.)*2.)*sin(vW.z*11.+vW.x*3.);  // streaky silk
 vec3 col=c*.8;float a=vA*nz*(.35+fr*fr*.9)*(.5+.5*smoothstep(0.,2.,lum))*(1.+uDew*.4);
#elif defined(DEW)
 float r=length(gl_PointCoord-.5)*2.;if (r>1.) discard;
 float tw=uTw*pow(.5+.5*sin(uTime*(1.3+fract(vS*13.)*3.)+vS*70.),24.);
 vec3 col=c*(.6+smoothstep(.6,0.,r)*1.5+tw*5.);float a=vA*(1.-r*r)*(.6+tw);
#else
 vec3 col=mix(vec3(lum),c,.55)*.85;float a=vA*(.2+.8*smoothstep(.2,3.,lum))*(1.+uDew*.5)*(.8+.2*sin(dot(vW,vec3(9.,7.,8.))));
#endif
 gl_FragColor=vec4(col,clamp(a,0.,1.));
#include <tonemapping_fragment>
#include <encodings_fragment>
#include <fog_fragment>
}`;
  const mat = (defines, x) => new THREE.ShaderMaterial(Object.assign({ uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), U),
    vertexShader: VS, fragmentShader: FS, defines, transparent: true, depthWrite: false, fog: true }, x));
  const group = new THREE.Group(), cut = { L: [0], F: [0], D: [0] };
  const build = (key, Type, m, order) => {
    const k2 = key === 'L' ? 2 : 1, A = new Float32Array(webs.reduce((s, w) => s + w[key].length * k2, 0)); let o = 0;   // threads twice: 2 px wide lines
    webs.forEach(w => { const a = w[key]; for (let c = 0; c < k2; c++) { A.set(a, o); if (c) for (let i = o + 12; i < o + a.length; i += 13) A[i] = -A[i]; o += a.length; } cut[key].push(o / 13); w[key] = null; });
    const ib = new THREE.InterleavedBuffer(A, 13), g = new THREE.BufferGeometry();
    [['position', 3, 0], ['aT', 3, 3], ['aN', 3, 6], ['aP', 4, 9]].forEach(([k, s, off]) => g.setAttribute(k, new THREE.InterleavedBufferAttribute(ib, s, off)));
    const obj = new Type(g, m); obj.frustumCulled = false; obj.renderOrder = order; obj.matrixAutoUpdate = false; group.add(obj); return obj;
  };
  const film = build('F', THREE.Mesh, mat({ FILM: '' }, { side: THREE.DoubleSide }), 3);
  const lines = build('L', THREE.LineSegments, mat({}), 4);
  const drops = build('D', THREE.Points, mat({ DEW: '' }), 5);
  scene.add(group);
  // hidden in the DOF depth pass (no sharp holes in the blur)
  const br = bokeh.render; bokeh.render = function (...a) { const vis = group.visible; group.visible = false; br.apply(this, a); group.visible = vis; };

  // ---- 8. quality + per-frame uniforms
  const NW = webs.length, heroes = webs.filter(w => w.rank < 0).length;
  function setDensity(k) {
    const n = k >= 1 ? NW : max(heroes, round(NW * (k >= .5 ? .12 : .08)));   // fast / lowest modes: only the top-ranked webs (fast mode stays as quick as before)
    lines.geometry.setDrawRange(0, cut.L[n]); film.geometry.setDrawRange(0, cut.F[n]); drops.geometry.setDrawRange(0, cut.D[n]);
    U.uTw.value = k >= .5 ? 1 : 0; api.shown = n;
  }
  const LS = [led, sun, rim, moon];
  function update(dt, night) {
    LS.forEach((l, i) => { U.uLd.value[i].copy(l.position).sub(l.target.position).normalize(); U.uLc.value[i].copy(l.color).multiplyScalar(l.intensity * .8); });
    U.uLp.value.copy(lamp.position); U.uLs.value.copy(lamp.target.position).sub(lamp.position).normalize(); U.uLpc.value.copy(lamp.color).multiplyScalar(lamp.intensity * .7);
    U.uAmb.value.copy(hemi.color).multiplyScalar(hemi.intensity * .55 + .02);
    const h = S ? S.hour % 24 : 12, dawn = sstep(4.5, 5.5, h) * (1 - sstep(8, 9.5, h));
    U.uNight.value = night; U.uDew.value = clamp(.1 + haze * .9 + dawn * .75, 0, 1);
    U.uPx.value = renderer.getDrawingBufferSize(U.uRes.value).y / (2 * Math.tan(camera.fov * PI / 360)); U.uLw.value = clamp(renderer.getPixelRatio(), 1, 1.6);
  }
  const api = { group, lines, film, drops, hubs, setDensity, update, shown: NW, ms: round(performance.now() - t0) };
  return api;
})();
{ // hooks: quality (setMeadowDensity) + per-frame uniforms (CITY.update)
  const smd = window.setMeadowDensity; window.setMeadowDensity = k => { smd(k); WEBS.setDensity(k); };
  WEBS.setDensity(quality === 'high' ? 1 : quality === 'min' ? .35 : .6);
  const cu = CITY.update; CITY.update = (dt, n) => { cu(dt, n); WEBS.update(dt, n); };
  WEBS.update(0, 0);
}
