'use strict';
/* =====================================================================
   City, part 2: extra kinds for the lots in js/lots.js (ruins in the garden, rubble, block walls). city.js calls CITY_EXT(kit)
   with its builders and merges `kinds` into KIND; decorate(kit) runs after the streets, before the meshes are merged.
   Story: something enormous walked through here; houses crushed, walls knocked flat, the garden taking it all back.
   ===================================================================== */
function CITY_EXT(K) {
  const { T, TS, R, rr, pick, lin, hash, BODY, MOSSB, MC, face, box, cyl, tube, lump, sides, at, onWall, wallBox,
    windowAt, acUnit, roofAC, shutter, awning, projSign, withM, tr, M4, WINR, RECTS, ROOFC, SHUTBOX, FRAME, ACC, RUST } = K;
  const ctx = () => K.ctx(), { abs, cos, sin, hypot, min, max, round, sqrt } = Math;
  const V = (x, y, z) => new V3(x, y, z);
  const eul = (x, y, z) => M4().makeRotationFromEuler(new THREE.Euler(x, y, z));
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const mo = (x, y, z, a, b, c) => lump(MOSSB, x, y, z, a, b, c, MC()), dim = (c, k) => c.clone().multiplyScalar(k);
  const put = (x, y, z, a, b, c, fn) => withM(tr(x, y, z).multiply(eul(a, b, c)), fn);
  const each = (S, fn) => Object.keys(S).forEach((k, i) => fn(S[k], k, i));
  const VINE = () => [(6 + (R() < .5)) * 128, 768, 128, 256];
  const RUBC = lin('#8a867d'), SLABC = lin('#a09d94'), DARKW = lin('#4a3a2c'), KAWC = lin('#5f666e'), WD = { tile: T.WOOD, col: DARKW };

  /* ---------- helpers ---------- */
  // like K.wall (thick slab, caps on broken edges) but the back face is only a bit darker (free-standing ruins are lit on both sides)
  function slab(o, ex, ey, t, O, backK) {
    const k = O.keep || (() => true), { nu, nv, n } = face(o, ex, ey, O), din = [-n.x * t, -n.y * t, -n.z * t];
    face(add(add(o, ex), din), sc(ex, -1), ey, Object.assign({}, O, { col: dim(O.col, backK || .8), keep: (i, j) => k(nu - 1 - i, j, nu, nv) }));
    const cu = sc(ex, 1 / nu), cv = sc(ey, 1 / nv), cap = { col: O.col, uo: 0 };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (k(i, j, nu, nv)) {
      const P = add(add(o, sc(ex, i / nu)), sc(ey, j / nv));
      if (j === nv - 1 || !k(i, j + 1, nu, nv)) face(add(P, cv), cu, din, cap);
      if (j > 0 && !k(i, j - 1, nu, nv)) face(add(P, cu), sc(cu, -1), din, cap);
      if (i === nu - 1 || !k(i + 1, j, nu, nv)) face(add(P, cu), din, cv, cap);
      if (i === 0 || !k(i - 1, j, nu, nv)) face(P, cv, din, cap);
    }
  }
  // a broken wall on side s from height y0 to y1; ok(a, y, x, z) keeps the cell at distance a along the side
  function side(s, y0, y1, t, O, ok, backK) {
    const L = s.L;
    slab(at(s, 0, y0, 0), [s.r[0] * L, 0, s.r[2] * L], [0, y1 - y0, 0], t, Object.assign({}, O, { keep: (i, j, nu, nv) => {
      const a = (i + .5) / nu * L; return ok(a, y0 + (j + .5) / nv * (y1 - y0), s.o[0] + s.r[0] * a, s.o[2] + s.r[2] * a, i, j); } }), backK);
  }
  // ブロック塀: the TILE atlas cell (.24 × .12) scaled to 40 × 20 cm concrete blocks. From (x, y, z) along (dx, dz);
  // P[i] = blocks still standing in column i; rebar pokes out of broken columns
  const BK = 1 / .6;
  function blockWall(x, y, z, dx, dz, P, col, O = {}) {
    const n = P.length, nv = max(1, ...P), s = .6;
    withM(M4().makeScale(BK, BK, BK), () => slab([x * s, y * s, z * s], [dx * n * .24, 0, dz * n * .24], [0, nv * .12, 0], .09,
      { tile: T.TILE, col, su: .24, sv: .12, uo: 0, vo: 0, keep: (i, j) => j < P[i] && !(O.hole && O.hole(i, j)) }, .85));
    for (let i = 0; i < n; i++) { if (!P[i]) continue;
      const a = (i + .5) * .4, px = x + dx * a + dz * .075, pz = z + dz * a - dx * .075, py = y + P[i] * .2;
      if (R() < (O.moss == null ? .18 : O.moss)) mo(px, py, pz, rr(.14, .26), rr(.07, .13), rr(.12, .18));
      if (i % 2 === 0 && P[i] < nv - 1 && P[i] > 3 && R() < .6) { const lx = rr(-.2, .2), lz = rr(-.2, .2);
        tube([V(px, py - .2, pz), V(px + lx * .3, py + rr(.25, .4), pz + lz * .3), V(px + lx, py + rr(.5, .8), pz + lz)], .022, RUST); }
    }
  }
  // rows per column: full height `top`, stepped V breaks cuts = [[centre column, half width, rows left]]
  function steps(n, top, cuts) {
    const P = [];
    for (let i = 0; i < n; i++) { let h = top - (R() < .15 ? 1 : 0);
      for (const [c, hw, lo] of cuts) { const q = abs(i - c) / hw; if (q < 1) h = min(h, round(lerp(lo, top, q * q) + rr(-.7, .7))); }
      P.push(clamp(h, 0, top)); }
    return P;
  }
  const rows = (g, h) => round((g + h - .4) / .2);  // block rows of a wall standing on y = .4 (just under the lowest soil)
  // rubble heap: low core, broken chunks piled on it (O.mix = [tile, colour] bits mixed in), moss cushions
  function heap(cx, y0, cz, rx, rz, h, n, O = {}) {
    lump(BODY, cx, y0, cz, rx * .62, h * .62, rz * .62, dim(RUBC, .75), 0);
    const mix = O.mix || [], sm = min(1, min(rx, rz) / 1.2) * (O.s || 1);
    for (let i = 0; i < n; i++) { const a = R() * 6.283, q = sqrt(R()), x = cx + cos(a) * q * rx * .72, z = cz + sin(a) * q * rz * .72,
        y = y0 + h * .82 * sqrt(max(0, 1 - q * q)) * rr(.75, 1), s = rr(.3, .75) * sm, m = R() < .35 && mix.length ? pick(mix) : null;
      put(x, y, z, rr(-.7, .7), rr(0, 6), rr(-.7, .7), () =>
        box(0, -s * .25, 0, s * rr(1, 1.9), s * rr(.22, .45), s * rr(.8, 1.4), { tile: m ? m[0] : 0, col: m ? m[1] : dim(RUBC, rr(.65, 1.1)), nb: 1 }));
      if (R() < (O.moss || .2)) mo(x, y + .05, z, rr(.3, .6) * sm, rr(.12, .22), rr(.3, .6) * sm);
    }
  }
  const rebar = (x, y, z, dx, dy, dz) => tube([V(x, y, z), V(x + dx * .5 + rr(-.1, .1), y + dy * .5, z + dz * .5 + rr(-.1, .1)), V(x + dx, y + dy, z + dz)], .03, RUST);
  // bendable sheet (crushed roofs): one face per cell so each cell has its own normal; Pf(a, b) → [x, y, z]
  function sheet(nx, ny, Pf, O, keep) {
    const G = [], S = TS[O.tile || 0];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) G.push(Pf(i / nx, j / ny));
    const P = (i, j) => G[j * (nx + 1) + i];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { if (keep && !keep(i, j)) continue;
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), e = P(i + 1, j + 1);
      face(a, sub(b, a), sub(c, a), Object.assign({}, O, { uo: i * O.cu / S, vo: j * O.cv / S,
        bend: (Q, s, t) => [0, 1, 2].map(k => a[k] * (1 - s) * (1 - t) + b[k] * s * (1 - t) + c[k] * (1 - s) * t + e[k] * s * t) })); }
  }
  // ivy hanging from a ragged top: top(a) = wall top at distance a along side s
  function vinesTop(s, n, top, len, off) {
    for (let k = 0; k < n; k++) { const w = rr(.9, 1.8), a = rr(w / 2, s.L - w / 2), y = min(top(a - w / 3), top(a + w / 3)) - .15, h = min(y - .3, rr(.4, 1) * len);
      if (h > .6) onWall(s, a, y - h, w, h, VINE(), 0, 0, (off || 0) + .06, R() < .5); }
  }
  // stone lantern (tōrō): hexagonal base, post, fire box, wide cap, jewel, moss on every ledge
  function lantern(x, y, z, col, tilt) {
    put(x, y, z, tilt, rr(0, 1), tilt * .6, () => {
      const O = { col };
      cyl(0, 0, 0, .46, .28, 6, O); cyl(0, .28, 0, .16, .85, 8, O, .14); cyl(0, 1.13, 0, .38, .16, 6, O, .32);
      box(0, 1.29, 0, .44, .42, .44, O);
      for (const [ox, oz, ex, ez] of [[-.11, .225, .22, 0], [.225, .11, 0, -.22]]) K.decal([ox, 1.38, oz], [ex, 0, ez], [0, .24, 0], WINR(9));
      cyl(0, 1.71, 0, .62, .1, 6, O, .6); cyl(0, 1.81, 0, .6, .22, 6, O, .12); lump(BODY, 0, 2.03, 0, .1, .12, .1, col, 0);
      mo(.05, 1.85, 0, .5, .12, .45); mo(0, .3, 0, .42, .08, .4); mo(-.1, 1.28, .05, .3, .06, .3);
    });
  }

  /* ---------- the new kinds (local frame: front = +z, y = 0 at the sunk base, g = ground floor level) ---------- */
  const kinds = {
    // roofless 2-storey husk swallowed by the garden: walls torn down toward the front-left, empty windows, a floor slab hanging in
    husk(D, w, d, g, S) {
      const col = lin(D.col), low = lin(D.col2 || '#a19e95'), H = g + 6.4, t = .28, fl = g + 3.1;
      D.h = 6.4; ctx().top = D.base + g + 5.4;
      const Hf = (x, z) => { const a = x / w + .5, b = z / d + .5; return g + 1.1 + 5.3 * clamp(1.2 - .62 * b - .62 * (1 - a) + .45 * fbm(x * .35, z * .35, 4.1, 2), 0, 1); };
      const win = (s, a, y) => { const n = max(1, round(s.L / 3.1));
        for (let k = 0; k < n; k++) if (abs(a - s.L * (k + .5) / n) < .6 && ((y > g + .95 && y < g + 2.3) || (y > fl + .9 && y < fl + 2.2))) return true;
        return s === S.F && abs(a - s.L * .5) < .55 && y < g + 2.3; };
      each(S, (s, key, si) => {
        const ok = (a, y, x, z, i, j) => y < Hf(x, z) + 1.6 * fbm(a * .45 + si * 7, y * .3, 1.3, 2) + (hash(i + si * 31, j) - .5) * .45 && !win(s, a, y);
        side(s, 0, fl, t, { tile: T.CONC, col: low, su: .7, sv: .7 }, ok, .55);
        side(s, fl, H, t, { tile: T.PLAST, col, su: .7, sv: .7 }, ok, .55);
        // moss on the broken tops, ivy down the tall walls
        for (let a = .3; a < s.L; a += rr(.6, 1.2)) if (R() < .25) { const p = at(s, a, 0, -t / 2), y = min(Hf(p[0], p[2]), H) - .1;
          if (y > g + .8) mo(p[0], y, p[2], rr(.25, .5), rr(.08, .16), rr(.25, .5)); }
        if (key === 'B' || key === 'R') vinesTop(s, 3, a => { const p = at(s, a, 0, 0); return min(Hf(p[0], p[2]), H); }, 4.5);
      });
      // upper floor: what is left of it, and one piece hanging down into the rubble
      slab([-w / 2 + t, fl, d / 2 - t], [w - 2 * t, 0, 0], [0, 0, -(d - 2 * t)], .25, { col: low, su: .7, sv: .7, keep: (i, j, nu, nv) => {
        const x = -w / 2 + t + (i + .5) / nu * (w - 2 * t), z = d / 2 - t - (j + .5) / nv * (d - 2 * t); return Hf(x, z) > fl + 1.3 + (hash(i, j + 50) - .5) * 1.4; } }, .6);
      put(-w * .05, fl, -d * .08, .8, .35, .12, () => { box(0, -.25, 1.25, 2.6, .25, 2.5, { col: low, su: 1 });
        for (let k = 0; k < 4; k++) rebar(rr(-1.2, 1.2), -.1, 2.5, rr(-.2, .2), rr(-.1, .2), rr(.3, .6)); mo(.3, 0, 1.6, .8, .12, .7); });
      ctx().inner = 1; face([-w / 2 + t, g + .02, d / 2 - t], [w - 2 * t, 0, 0], [0, 0, -(d - 2 * t)], { tile: T.CONC, col: low, su: 3 }); ctx().inner = 0;
      heap(-w * .2, g - .25, d * .12, 2.4, 1.9, 1.8, 24, { moss: .2, mix: [[T.PLAST, col], [T.TILE, col]] });
      for (let k = 0; k < 4; k++) mo(rr(-w / 2 + .8, w / 2 - .8), g + .05, rr(-d / 2 + .8, d / 2 - .8), rr(.5, 1.1), rr(.1, .2), rr(.5, 1));
      for (let k = 0; k < 9; k++) { const s = S[pick(['F', 'R', 'B', 'Lf'])], a = rr(.4, s.L - .4), p = at(s, a, 0, -t / 2), y = min(Hf(p[0], p[2]), H);
        if (y > g + 1.5 && y < H - .3) rebar(p[0], y - .3, p[2], rr(-.25, .25), rr(.5, .9), rr(-.25, .25)); }
      // the garden pours over the back corner
      for (let k = 0; k < 4; k++) mo(w / 2 - rr(.1, 1.6), H - rr(0, .7), -d / 2 + rr(.1, 1.6), rr(.4, .8), rr(.2, .4), rr(.4, .8));
    },
    // a house that was stepped on: right gable still standing, roof crushed into a V toward the left, flat on the rubble
    crushed(D, w, d, g, S) {
      const col = lin(D.col), kaw = lin(D.kaw || '#5f666e'), eave = g + 2.8, pitch = .55, ov = .7, ridge = eave + d / 2 * pitch, Lx = w + 2 * ov, zs = d / 2 + ov;
      D.h = ridge + .5 - g; ctx().top = D.base + eave;
      const cr = x => sstep(w * .2, -w * .42, x);
      const eaveTop = x => lerp(eave, g + 1, cr(x));
      const roofY = (x, za) => { const c = cr(x), vy = za <= d / 2 ? lerp(g + .9, eaveTop(x), za / (d / 2)) : eaveTop(x) - (za - d / 2) * .8;
        return lerp(eave + (d / 2 - za) * pitch, vy, c) + c * .35 * fbm(x * .6, za * .6, 2.2, 2) + .12; };
      const lowO = { tile: T.WOOD, col: K.WOODC, su: .75, sv: .7 }, upO = { tile: T.PLAST, col, su: .75, sv: .7 };
      each(S, (s, key, si) => {
        const topAt = (x, z) => key === 'R' ? eave + (d / 2 - abs(z)) * pitch : key === 'Lf' ? g + 1 : eaveTop(x);
        const ok = (a, y, x, z, i, j) => y < topAt(x, z) + (hash(i + si * 17, j + 3) - .5) * (key === 'R' ? .5 : 1.1);
        side(s, 0, eave, .22, lowO, ok, .5);
        if (key === 'R') side(s, eave, ridge, .22, upO, ok, .5);
      });
      // roof: kawara sheet on top, dark boards underneath, torn open where it folds
      const nx = 12, ny = 7, cu = Lx / nx, cv = hypot(zs, d / 2 * pitch) / ny;
      for (const sd of [1, -1]) {
        const Pf = (a, b) => { const x = sd * (-Lx / 2 + a * Lx), za = zs * (1 - b); return [x, roofY(x, za), sd * za]; };
        const keep = (i, j) => { const x = sd * (-Lx / 2 + (i + .5) * cu), c = cr(x), tear = sin(Math.PI * clamp((c - .05) / .8, 0, 1));
          return hash(i * 1.7 + sd * 13, j * 2.3) > .6 * tear + (j >= ny - 2 ? .3 * c : 0); };
        sheet(nx, ny, Pf, { tile: T.KAWARA, col: kaw, cu, cv }, keep);
        sheet(nx, ny, (a, b) => { const p = Pf(1 - a, b); p[1] -= .17; return p; }, { tile: T.WOOD, col: DARKW, cu, cv }, (i, j) => { const I = nx - 1 - i, k = (a, b) => a < 0 || a >= nx || b >= ny || keep(a, b); return keep(I, j) && (j < 2 || !k(I - 1, j) || !k(I + 1, j) || !k(I, j - 1) || !k(I, j + 1)); });
      }
      const RO = { tile: T.KAWARA, col: dim(kaw, .7) }, x0 = w * .22;
      box((x0 + Lx / 2) / 2, ridge + .05, 0, Lx / 2 - x0, .4, .5, RO); box(Lx / 2, ridge - .05, 0, .45, .75, .7, RO);
      withM(tr(x0, ridge - .25, 0).multiply(M4().makeRotationZ(.5)), () => box(-1.6, 0, 0, 3.2, .26, .26, WD));  // snapped ridge beam
      for (let k = 0; k < 7; k++) { const x = rr(-w * .3, w * .15), z = rr(-d / 2, d / 2);
        withM(tr(x, roofY(x, abs(z)) - .2, z).multiply(eul(rr(-.9, .9), rr(-.4, .4), rr(-.6, .6))), () => box(0, 0, 0, .18, .18, rr(1.8, 3.2), WD)); }
      for (let k = 0; k < 12; k++) { const x = rr(-w / 2, w * .1), z = rr(-d / 2 + .3, d / 2 - .3);
        withM(tr(x, roofY(x, abs(z)) + .02, z).multiply(eul(rr(-.4, .4), rr(0, 6), rr(-.4, .4))), () => box(0, 0, 0, rr(.4, .8), rr(.1, .2), rr(.3, .6), RO)); }
      for (let k = 0; k < 7; k++) { const x = rr(-w / 2, w * .2), z = rr(-d / 2 + .2, d / 2 - .2);
        mo(x, roofY(x, abs(z)) + .02, z, rr(.5, 1.1), rr(.12, .25), rr(.5, 1)); }
      K.mossAlong([x0, 0], [w / 2 + ov, 0], ridge + .3, .7, .55);
      // front: sliding door + shoji where the wall still stands
      const Fx = a => -w / 2 + a;
      if (eaveTop(Fx(w * .78 + .9)) > g + 2.4) onWall(S.F, w * .78, g, 1.8, 2.3, RECTS.DOORW);
      for (const a of [w * .5, w * .25]) if (eaveTop(Fx(a - .95)) > g + 2.2) windowAt(S.F, a, g + .9, 1.9, 1.15, 'shoji');
      windowAt(S.R, d / 2, eave + .3, 1.2, 1, 'shoji'); acUnit(S.B, w * .3, g + 1.1);
      vinesTop(S.R, 2, a => eave + (d / 2 - abs(d / 2 - a)) * pitch, 3.5); vinesTop(S.B, 2, a => eaveTop(w / 2 - a), 2.2);
      heap(-w / 2 + .9, g - .3, -d * .1, .8, 2.4, 1, 14, { mix: [[T.WOOD, DARKW], [T.KAWARA, kaw]] });
    },
    // the house was swept away: broken block wall L, footing, tiled genkan floor, a step
    yard(D, w, d, g, S) {
      const col = lin(D.col), H = 2.2, top = rows(g, H);
      D.h = H; ctx().top = D.base + g + H;
      blockWall(-w / 2 + .05, .4, -d / 2 + .2, 1, 0, steps(16, top, [[11.5, 4, rows(g, .5)]]), col);
      blockWall(-w / 2 + .05, .4, -d / 2 + .2, 0, 1, steps(11, top, [[9.5, 4.5, 0]]), col, { hole: (i, j) => j === top - 3 && i % 3 === 1 && i < 7 });
      const F = { col: SLABC, su: 1.2 }, fy = g + .35, xa = -1.2, xb = w / 2 - .3, za = -d / 2 + 1.1, zb = d / 2 - .5;
      box(-.15, 0, zb, 2.1, fy, .28, F); box(xb - .75, 0, zb, 1.5, fy, .28, F);
      box(xb, 0, (za + zb) / 2 + .6, .28, fy, zb - za - 1.2, F); box(xa + .7, 0, za, 1.6, fy, .28, F); box(xb - .6, 0, za, 1.2, fy - .15, .28, F);
      box(xa, 0, za + 1.2, .28, fy, 1.8, F);
      box(-.3, 0, zb - .75, 1.5, fy - .01, 1.2, F);  // raised genkan with its mosaic tiles
      face([-1.05, fy, zb - .15], [1.5, 0, 0], [0, 0, -1.2], { tile: T.TILE, col: lin('#8e948c'), su: .3, sv: .3, keep: (i, j) => hash(i, j + 9) > .25 });
      box(-.3, 0, zb + .35, .9, fy - .17, .4, { col: RUBC });
      heap(xb - 1.3, g - .35, za + 1.2, 1.1, .9, .9, 12, { moss: .3 });
      for (let k = 0; k < 7; k++) mo(rr(xa + .4, xb - .4), g + .05, rr(za + .3, zb - .3), rr(.4, .8), rr(.08, .16), rr(.4, .8));
    },
    // walkable rubble mound: concrete slabs, a fallen piece of block wall, roof tiles, a beam, lots of moss
    mound(D, w, d, g, S) {
      const col = lin(D.col), h = 2.1;
      D.h = h + .2; ctx().top = D.base + g + h; ctx().moss = .55;
      heap(0, g - .45, 0, w / 2 - .45, d / 2 - .45, h, 34, { moss: .25, mix: [[T.KAWARA, KAWC], [T.TILE, col], [T.WOOD, DARKW], [T.PLAST, col]] });
      put(-.9, g + .5, .4, .15, .5, .5, () => { box(0, 0, 0, 2.2, .22, 1.5, { col: SLABC, su: 1 }); rebar(1.1, .1, .3, .5, .2, .1); rebar(1.1, .1, -.3, .6, -.1, 0); });
      put(1.1, g + .2, -.6, -.3, -.4, -.35, () => box(0, 0, 0, 1.8, .2, 1.3, { col: dim(SLABC, .9), su: 1 }));
      put(.4, g - .3, 1, -.55, .3, .08, () => blockWall(-.8, 0, 0, 1, 0, steps(4, 9, [[3, 2, 5]]), lin('#74736d'), { moss: .6 }));
      put(-.3, g + 1.2, -.9, .1, .9, .35, () => box(0, 0, 0, .22, .22, 3, WD));
      for (let k = 0; k < 3; k++) mo(rr(-1.6, 1.6), g + rr(.6, 1.4), rr(-1.2, 1.2), rr(.6, 1), rr(.15, .3), rr(.5, .9));
    },
    // long low block wall at the front glass: one section toppled flat toward the viewer, loose blocks
    fence(D, w, d, g, S) {
      const col = lin(D.col), H = 2.1, top = rows(g, H), n = Math.floor(w / .4), z0 = -d / 2 + .3, gy = (x, z) => soilY(K.worldOf(x, 0, z).x, K.worldOf(x, 0, z).z) - D.base;
      D.h = H; ctx().top = D.base + g + H;
      const P = steps(n, top, [[n * .45, 3.6, -4], [n - 2.5, 2.2, top - 5]]);
      blockWall(-n * .2, .4, z0, 1, 0, P, col, { hole: (i, j) => j === top - 2 && (i % 4 === 1) && i < n * .3 });
      const m0 = ctx().moss; ctx().moss = .3;  // the toppled pieces: only a little moss yet
      for (let k = 0; k < 3; k++) { const c0 = round(n * .45 - 3.5 + k * 2.4), m = k === 1 ? 2 : 3;
        const x = -n * .2 + c0 * .4 + rr(-.05, .05), z = z0 + .2 + rr(-.05, .15);
        withM(tr(x, min(gy(x, z + .8), gy(x + .6, z + .8)) - .16, z).multiply(eul(rr(1.4, 1.52), rr(-.12, .12), rr(-.06, .06))),
          () => blockWall(0, 0, 0, 1, 0, steps(m, 10, [[m, 1.5, 7]]), col, { moss: 0 })); }
      ctx().moss = m0;
      for (let k = 0; k < 7; k++) { const x = rr(-w / 2 + .5, w / 2 - .5), z = rr(z0 + .5, d / 2 - .4);
        put(x, gy(x, z) - .06, z, rr(-.2, .2), rr(0, 3), rr(-.2, .2), () => box(0, 0, 0, .4, .2, .15, { tile: T.TILE, col })); }
      box(-n * .2 + .17, 0, z0 - .08, .34, g + H + .1, .34, { col: SLABC }); mo(-n * .2 + .17, g + H + .1, z0 - .08, .3, .1, .3);
    },
    // 2-storey shop-house at the edge of the town, its upper corner torn off, awning hanging, rubble spilling out front
    rowx(D, w, d, g, S0) {
      const col = lin(D.col), db = d - 1.5, zc = -.75, top = g + 6.7, t = .3, S = sides(w, db), fy = g + 3.6;
      D.h = top + .9 - g; ctx().top = D.base + top + .9;
      const B = [w / 2 - .4, top + .6, db / 2 - .3];
      const bite = (x, y, z, j) => hypot(x - B[0], (y - B[1]) * .8, z - B[2]) < 3.3 + (j || 0);
      withM(tr(0, 0, zc), () => {
        each(S, (s, key, si) => { const ok = (a, y, x, z, i, j) => !bite(x, y, z, (hash(i + si * 13, j) - .5) * 1.2);
          side(s, 0, top, t, { tile: D.tile, col, su: .85, sv: .85 }, ok, .45);
          side(s, top, top + .9, t, { tile: D.tile, col, su: .85, sv: .9 }, ok, .7); });
        const cell = (y, e) => (i, j, nu, nv) => !bite(-w / 2 + t + (i + .5) / nu * (w - 2 * t), y, db / 2 - t - (j + .5) / nv * (db - 2 * t), e + (hash(i, j + 7) - .5));
        slab([-w / 2 + t, top, db / 2 - t], [w - 2 * t, 0, 0], [0, 0, -(db - 2 * t)], .25, { col: ROOFC, su: .7, sv: .7, keep: cell(top, 0) }, .5);
        slab([-w / 2 + t, fy, db / 2 - t], [w - 2 * t, 0, 0], [0, 0, -(db - 2 * t)], .25, { col: lin('#8c8a84'), su: .7, sv: .7, keep: cell(fy, -1.3) }, .5);
        heap(B[0] - 1.3, fy - .1, B[2] - 1.4, .9, .9, .7, 8);
        for (let k = 0; k < 8; k++) { const a = rr(3.4, 5.9), y = R() < .5 ? top : fy, r = sqrt(max(0, 3.3 * 3.3 - ((y - B[1]) * .8) ** 2)) - .1, x = B[0] + cos(a) * r, z = B[2] + sin(a) * r;
          if (x > -w / 2 + .3 && z > -db / 2 + .3) rebar(x, y - .1, z, cos(a) * .6 + rr(-.2, .2), rr(-.4, .3), sin(a) * .6 + rr(-.2, .2)); }
        box(-w * .2, g + 3.45, db / 2 + .15, w * .6, .2, .3, { col: dim(col, .9) });  // cornice, broken off at the bite
        const shc = lin('#8a8e90'); shutter(S.F, w * .4, w * .55, g, shc); onWall(S.F, w * .84, g, 1.1, 2.3, RECTS.DOORS);
        withM(tr(-w / 2, g + 3.3, 0).multiply(M4().makeRotationZ(-.2)).multiply(tr(w / 2, -g - 3.3, 0)), () => awning(w, db, g + 3.3, lin('#3f6b52')));
        for (const s of [S.F, S.Lf, S.R]) for (const a of [s.L * .28, s.L * .7]) { const p = at(s, a, fy + .8, .1);
          if (!bite(p[0], fy + 2.6, p[2], .6)) windowAt(s, a, fy + .8, s === S.F ? 1.5 : 1.1, 1.4, 'sash'); }
        acUnit(S.Lf, db * .45, fy + .4); projSign(S.F, .45, g + 3.9, 2.8, D.sign || 0, 0, 0); roofAC(-w * .22, top, -db * .2);
        K.mossAlong([-w / 2 + .15, -db / 2 + .15], [w * .1, -db / 2 + .15], top + .9, .6, .5); K.mossAlong([-w / 2 + .15, -db / 2 + .15], [-w / 2 + .15, db * .2], top + .9, .6, .5);
        vinesTop(S.Lf, 2, () => top + .9, 6); vinesTop(S.B, 2, () => top + .9, 7);
      });
      heap(w * .22, g - .35, d / 2 - 1, 2.2, .8, 1.1, 20, { moss: .3, mix: [[D.tile, col]] });
      D.anchor = [-w * .2, top - 1.2, -d / 2];
    },
    // corner kiosk (tobacco + sundries): half-down shutter, the front half of the flat roof has dropped into the shop
    kiosk(D, w, d, g, S) {
      const col = lin(D.col), top = g + 3.3, t = .22;
      D.h = top + .6 - g; ctx().top = D.base + top;
      const topAt = (x, z) => top - 1.4 * sstep(2.8, .2, hypot(x + w / 2, z + d / 2));
      const open = (a, y) => a > .45 && a < w - 1.75 && y < g + 2.6;
      each(S, (s, key, si) => {
        side(s, 0, top, t, { tile: T.PLAST, col, su: .6, sv: .6 }, (a, y, x, z, i, j) => y < topAt(x, z) + (hash(i + si * 7, j) - .5) * .8 && !(key === 'F' && open(a, y)), .4); });
      const sw = w - 2.2;
      face(at(S.F, .45, g + 1.5, .04), [sw, 0, 0], [0, 1.1, 0], { tile: T.SHUT, col: lin('#8a7a62'), su: 1, sv: 1, vo: 0 }); wallBox(S.F, .45 + sw / 2, g + 2.6, sw + .3, .45, .4, { col: SHUTBOX });
      onWall(S.F, w - 1.05, g, 1.1, 2.3, RECTS.DOORS); projSign(S.F, w - .3, g + 1.2, 2, D.sign != null ? D.sign : 2, 0, 0);
      ctx().inner = 1; face([-w / 2 + t, g + .02, d / 2 - t], [w - 2 * t, 0, 0], [0, 0, -(d - 2 * t)], { tile: T.CONC, col: lin('#9c9890'), su: 3 });
      box(w / 2 - .5, g, -d * .1, .5, 1.8, d * .6, { col: FRAME }); box(-w * .15, g, d * .15, 1.8, .9, .7, { col: ACC }); ctx().inner = 0;
      slab([-w / 2, top, d / 2], [w, 0, 0], [0, 0, -d / 2], .2, { col: ROOFC, su: .7, sv: .7, keep: (i, j, nu, nv) => j < nv - 1 || hash(i, 3) > .4 }, .5);
      withM(tr(0, top - .05, 0).multiply(M4().makeRotationX(-.5)), () => {
        slab([-w / 2 + t, 0, -.02], [w - 2 * t, 0, 0], [0, 0, -(d / 2 - t)], .2, { col: ROOFC, su: .7, sv: .7, keep: (i, j) => j > 0 || hash(i, 8) > .45 }, .5);
        for (let k = 0; k < 4; k++) rebar(rr(-w / 2 + .5, w / 2 - .5), -.1, -.1, rr(-.1, .1), rr(.2, .5), rr(.2, .5));
        for (let k = 0; k < 4; k++) mo(rr(-w / 2 + .6, w / 2 - .6), 0, rr(-d / 2 + .5, -.5), rr(.4, .8), rr(.1, .2), rr(.4, .7));
      });
      withM(tr(w / 2, g + 2.95, 0).multiply(M4().makeRotationZ(.24)).multiply(tr(-w / 2, -g - 2.95, 0)), () => awning(w, d, g + 2.95, lin('#9c3b30')));
      for (let k = 0; k < 4; k++) mo(rr(-w / 2 + .5, w / 2 - .5), top, rr(.4, d / 2 - .5), rr(.5, 1), rr(.12, .25), rr(.5, .9));
      acUnit(S.B, w * .3, g + 1); vinesTop(S.R, 2, () => top, 2.5); vinesTop(S.Lf, 2, a => topAt(-w / 2, -d / 2 + a), 2.8);
    },
    // block-wall corner with a concrete post and a heap of rubble in the angle
    corner(D, w, d, g, S) {
      const col = lin(D.col), H = 1.8, top = rows(g, H);
      D.h = H + .1; ctx().top = D.base + g + H;
      blockWall(-w / 2 + .05, .4, -d / 2 + .2, 1, 0, steps(11, top, [[9.5, 3.5, rows(g, .4)]]), col);
      blockWall(-w / 2 + .05, .4, -d / 2 + .2, 0, 1, steps(10, top, [[10, 5, 0]]), col, { hole: (i, j) => j === top - 2 && i % 3 === 2 && i < 6 });
      box(-w / 2 + .22, 0, -d / 2 + .22, .38, g + H + .1, .38, { col: SLABC }); mo(-w / 2 + .22, g + H + .1, -d / 2 + .22, .35, .12, .35);
      heap(-w / 2 + 1.5, g - .3, -d / 2 + 1.5, 1.2, 1.2, 1.1, 14, { moss: .25, mix: [[T.TILE, col]] });
    },
    // short block wall by the front glass with a gate post and an old stone lantern, all mossy
    lantern(D, w, d, g, S) {
      const col = lin(D.col), H = 1.7, top = rows(g, H), z0 = -d / 2 + .35;
      D.h = 2.1; ctx().top = D.base + g + H;
      blockWall(-w / 2 + .2, .4, z0, 1, 0, steps(12, top, [[1, 2.5, rows(g, .6)], [8, 1.6, top - 3]]), col, { hole: (i, j) => j === top - 2 && i % 3 === 0 && i > 3 });
      box(-w / 2 + 5.05, 0, z0 - .08, .36, g + H + .3, .36, { col: SLABC }); box(-w / 2 + 5.05, g + H + .3, z0 - .08, .44, .08, .44, { col: SLABC });
      mo(-w / 2 + 5.05, g + H + .38, z0 - .08, .3, .1, .3);
      lantern(w / 2 - .65, g - .15, .55, lin('#8e9088'), .07);
      for (let k = 0; k < 4; k++) mo(rr(-w / 2 + .5, w / 2 - 1.8), g + .02, rr(z0 + .4, d / 2 - .3), rr(.35, .7), rr(.06, .12), rr(.3, .6));
    },
  };

  /* ---------- flat bits that stitch the zones together (not solid: all ≤ .3 high) ---------- */
  function decorate() {
    const ok = (x, z) => inTank(x, z, 1.5) && !lotInside(x, z, .4) && !underLog(x, z) && hypot(x - LOG_ENTRY.x, z - LOG_ENTRY.z) > 4.5 &&
      hypot(x - dishPos.x, z - dishPos.z) > 6.5 && groundY(x, z) < soilY(x, z) + .1;
    const MIX = [[0, SLABC], [0, RUBC], [0, RUBC], [T.ASPH, lin('#9a9a96')], [T.ASPH, lin('#8e8e8a')], [T.TILE, lin('#8d8b84')], [T.KAWARA, KAWC]];
    const piece = (x, z, big) => { if (!ok(x, z)) return;
      const m = pick(MIX), s = big ? rr(.7, 1.4) : rr(.3, .7), h = m[0] === T.ASPH ? .09 : rr(.1, .2);
      put(x, soilY(x, z) - .04, z, rr(-.08, .08), rr(0, 6.3), rr(-.08, .08), () => box(0, 0, 0, s * rr(1, 1.6), h, s, { tile: m[0], col: dim(m[1], rr(.8, 1.1)), nb: 1 }));
      if (R() < .2) mo(x + rr(-.2, .2), soilY(x, z) + h, z + rr(-.2, .2), rr(.25, .5), rr(.05, .1), rr(.25, .5)); };
    // around each garden ruin
    for (const L of LOTS) if (L.garden) for (let k = 0; k < 4; k++) { const a = R() * 6.283, r = max(L.w, L.d) / 2 + rr(.4, 2.4); piece(L.x + cos(a) * r, L.z + sin(a) * r, R() < .3); }
    // along the town edge (pavement slabs and asphalt broken off into the moss), plus an old curb line
    for (let k = 0; k < 15; k++) piece(rr(-55, 17), rr(-15.5, -12), R() < .4);
    for (let k = 0; k < 10; k++) piece(rr(17, 20.5), rr(-11, 37), R() < .4);
    for (let k = 0; k < 7; k++) { const x = -48 + k * 9 + rr(-2, 2), z = -14.6 + rr(-.3, .3); if (ok(x, z))
      put(x, soilY(x, z) - .05, z, rr(-.05, .05), rr(-.25, .25), rr(-.05, .05), () => box(0, 0, 0, rr(.9, 1.4), .26, .3, { col: lin('#b5b1a6'), nb: 1 })); }
    // stepping stones: the old garden path from the lost house to the front
    for (let k = 0; k < 6; k++) { const x = -8.6 + k * .9 + rr(-.3, .3), z = 24.4 + k * 1.45; if (ok(x, z)) {
      cyl(x, soilY(x, z) - .08, z, rr(.4, .55), .2, 7, { col: lin('#8f8e86') }); if (R() < .4) mo(x + .2, soilY(x, z) + .12, z, .3, .05, .25); } }
  }
  return { kinds, decorate };
}
