'use strict';
/* =====================================================================
   Intro: 10-second hand-drawn 2D cartoon (Canvas 2D only, no images),
   played once per browser session before the name / species card.
   Paper + brown ink look. In the fast quality modes the paper grain,
   line boil (wobbly redrawn lines) and glows are switched off.
   ===================================================================== */
(() => {
  try { if (sessionStorage.getItem('tarantula3d-intro')) return; sessionStorage.setItem('tarantula3d-intro', '1'); } catch (e) {}

  /* ---------- DOM ---------- */
  const css = document.createElement('style');
  css.textContent = `
#intro{position:fixed;inset:0;z-index:20;background:#f2e8d2;transition:opacity .9s ease}
#intro.out{opacity:0;pointer-events:none}
#intro canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
#intro button{position:absolute;z-index:4;cursor:pointer;font-family:"Mitr","Sarabun",sans-serif;color:#3a2a1c}
#intro button:focus-visible{outline:2px solid #c99a38;outline-offset:3px}
#intro .skip{right:calc(14px + env(safe-area-inset-right,0px));top:calc(14px + env(safe-area-inset-top,0px));font-size:14px;line-height:1;
  padding:8px 16px;background:rgba(242,232,210,.85);border:1.5px solid rgba(58,42,28,.45);border-radius:255px 18px 225px 18px/18px 225px 18px 255px}
#intro .skip:hover{background:#eadcbf}
#intro .play{left:50%;transform:translate(-50%,10px);opacity:0;pointer-events:none;transition:opacity .6s ease,transform .6s ease;
  font-size:19px;font-weight:600;line-height:1;padding:14px 36px;color:#f6ecd6;background:#3a2a1c;border:2px solid #3a2a1c;
  border-radius:255px 22px 225px 22px/22px 225px 22px 255px;box-shadow:0 4px 0 #c99a38}
#intro .play.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#intro .play:hover{background:#4d3825}
#intro .say{transition:opacity .45s}`;
  document.head.appendChild(css);
  const font = document.createElement('link'); font.rel = 'stylesheet'; // hand-lettered Thai font for the title (falls back to Mitr offline)
  font.href = 'https://fonts.googleapis.com/css2?family=Itim&display=swap';
  font.onload = () => { try { document.fonts.load('48px Itim'); } catch (e) {} };
  document.head.appendChild(font);
  const root = document.createElement('div'); root.id = 'intro';
  root.innerHTML = '<canvas aria-hidden="true"></canvas><div class="say" aria-live="polite"></div>' +
    '<button type="button" class="skip">ข้าม ⏭</button><button type="button" class="play" tabindex="-1">เริ่มเล่น</button>';
  document.body.appendChild(root);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d');
  const bub = root.querySelector('.say'), skipB = root.querySelector('.skip'), playB = root.querySelector('.play');

  /* ---------- palette + helpers ---------- */
  const C = { paper: '#f2e8d2', ink: '#3a2a1c', wood: '#a0703f', woodD: '#7a5230', woodL: '#c49660', bark: '#6b4529', ring: '#e0c192',
    hole: '#2a1c12', holeD: '#170f09', body: '#35271c', head: '#46331f', bodyD: '#211710', bodyL: '#5d4533', brass: '#c99a38', mustard: '#d9ab45',
    moss: '#7f8d4b', mossD: '#5d6b35', mossL: '#a3ad68', orange: '#e7a06a', eye: '#fbf3e1',
    cri: '#b47c3d', criD: '#8a5a2b', wing: '#6f4a27' };
  const TAU = Math.PI * 2, lerp = (a, b, k) => a + (b - a) * k, cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const seg = (t, a, b) => cl((t - a) / (b - a)), sm = v => v * v * (3 - 2 * v);
  const eio = v => v < .5 ? 4 * v * v * v : 1 - Math.pow(2 - 2 * v, 3) / 2;
  const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  const ell = (cx, cy, rx, ry, n = 32, a0 = 0, a1 = TAU) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  const quad = (a, b, c, n = 10) => { const o = []; for (let i = 0; i <= n; i++) { const s = i / n, u = 1 - s; o.push([u * u * a[0] + 2 * u * s * b[0] + s * s * c[0], u * u * a[1] + 2 * u * s * b[1] + s * s * c[1]]); } return o; };
  // fluffy scalloped outline (hairy body edge): k bumps, amp = bump height
  const fuzz = (cx, cy, rx, ry, k, amp, rot = 0, n = 84) => { const o = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 1 + amp * Math.abs(Math.sin(a * k / 2)), x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r; o.push([cx + x * c - y * s, cy + x * s + y * c]); }
    return o; };

  let W = 0, H = 0, DPR = 1, S0 = 1, OX = 0, OY = 0, lo = false, paper = null, boil = 0, JA = 0, T = 0;
  function wob(pts, seed) { // line boil: every line wobbles a little and is "redrawn" 8x per second
    if (!JA) return pts;
    const o = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) { const k = seed * 13.1 + i * 7.3 + boil * 31.7; o[i] = [pts[i][0] + (hash(k) - .5) * JA, pts[i][1] + (hash(k + 4.1) - .5) * JA]; }
    return o;
  }
  function path(pts, p = 1) { // polyline into the current path; p < 1 draws only the first part (pen still moving)
    if (p <= 0 || pts.length < 2) return;
    let left = 0;
    if (p < 1) { for (let i = 1; i < pts.length; i++) left += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); left *= p; }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      if (p < 1) { const a = pts[i - 1], b = pts[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (s >= left) { const k = s ? left / s : 0; g.lineTo(lerp(a[0], b[0], k), lerp(a[1], b[1], k)); return; } left -= s; }
      g.lineTo(pts[i][0], pts[i][1]);
    }
  }
  const ink = (w = 1.3, col = C.ink) => { g.lineWidth = w / S0; g.strokeStyle = col; };
  function stroke(pts, p, w, col, seed) { if (p <= 0) return; g.beginPath(); path(wob(pts, seed), p); ink(w, col); g.stroke(); }
  function fill(pts, col, seed, a = 1) {
    if (a <= 0) return; const ga = g.globalAlpha; g.globalAlpha = ga * a;
    g.beginPath(); path(wob(pts, seed)); g.closePath(); g.fillStyle = col; g.fill(); g.globalAlpha = ga;
  }
  function oval(cx, cy, rx, ry, col, a = 1, rot = 0) { const ga = g.globalAlpha; g.globalAlpha = ga * a; g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, TAU); g.fillStyle = col; g.fill(); g.globalAlpha = ga; }

  /* ---------- paper ---------- */
  function makePaper() {
    const c = document.createElement('canvas'), w = c.width = Math.max(1, Math.round(W)), h = c.height = Math.max(1, Math.round(H)), x = c.getContext('2d');
    x.fillStyle = C.paper; x.fillRect(0, 0, w, h);
    if (!lo) { // grain, faint ink specks and fibres
      const im = x.getImageData(0, 0, w, h), d = im.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * 15; d[i] += n; d[i + 1] += n; d[i + 2] += n * .9; }
      x.putImageData(im, 0, 0);
      for (let i = 0; i < w * h / 7000; i++) { x.fillStyle = `rgba(58,42,28,${.03 + Math.random() * .1})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, .4 + Math.random() * 1.2, 0, TAU); x.fill(); }
      x.lineWidth = .7;
      for (let i = 0; i < w * h / 16000; i++) { const px = Math.random() * w, py = Math.random() * h, a = Math.random() * TAU, l = 4 + Math.random() * 10;
        x.strokeStyle = `rgba(130,100,65,${.05 + Math.random() * .07})`; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * l, py + Math.sin(a + 1) * l * .5, px + Math.cos(a + .4) * l * 1.6, py + Math.sin(a + .4) * l); x.stroke(); }
    }
    const v = x.createRadialGradient(w / 2, h * .55, Math.min(w, h) * .3, w / 2, h * .55, Math.max(w, h) * .75);
    v.addColorStop(0, 'rgba(150,115,70,0)'); v.addColorStop(1, 'rgba(150,115,70,.17)');
    x.fillStyle = v; x.fillRect(0, 0, w, h);
    return c;
  }
  function resize() {
    W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, lo ? 1 : 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    S0 = Math.min(W / (W < H ? 620 : 700), H * .46 / 300); OX = W / 2 + 25 * S0; OY = H * .68; // scene units: ground at y = 0, ~700 wide
    paper = makePaper();
    playB.style.top = (OY + Math.max(34, (H - OY) * .4)) + 'px';
  }

  /* ---------- static scenery (scene units, y up = negative) ---------- */
  const GROUND = []; for (let x = -450; x <= 450; x += 10) GROUND.push([x, Math.sin(x * .031) * .7 + Math.sin(x * .13) * .3]);
  const LG = { x0: -330, x1: -90, top: -140, cy: -70, ry: 70, erx: 42 }, HOLE = [-88, -66, 30, 52];
  const logTop = []; for (let x = LG.x1; x >= LG.x0; x -= 12) logTop.push([x, LG.top + Math.sin(x * .09) * 1.2]);
  const logBot = []; for (let x = LG.x0; x <= LG.x1; x += 12) logBot.push([x, -Math.abs(Math.sin(x * .07)) * .8]);
  const logSil = [...logTop, ...ell(LG.x0, LG.cy, 24, LG.ry, 16, -Math.PI / 2, -Math.PI * 1.5), ...logBot];
  const logFill = [...logSil, ...ell(LG.x1, LG.cy, LG.erx, LG.ry, 16, Math.PI / 2, -Math.PI / 2)];
  const endE = ell(LG.x1, LG.cy, LG.erx, LG.ry, 40), ringE = ell(LG.x1 - 1, LG.cy + 1, 36, 62, 40);
  const holeE = ell(HOLE[0], HOLE[1], HOLE[2], HOLE[3], 36), holeIn = ell(HOLE[0] - 6, HOLE[1] + 5, HOLE[2] * .76, HOLE[3] * .82, 28);
  const logShade = []; for (let x = LG.x0 - 30; x <= LG.x1 + 50; x += 10) logShade.push([x, -34 + Math.sin(x * .05) * 3]); logShade.push([LG.x1 + 50, 8], [LG.x0 - 30, 8]);
  const logHi = []; for (let x = -312; x <= -118; x += 10) logHi.push([x, -126 + Math.sin(x * .04) * 1.5]);
  const BARK = [[-120, -300, -150], [-104, -250, -118], [-86, -318, -205], [-60, -282, -128], [-42, -212, -110], [-22, -305, -236], [-78, -175, -122]].map(([y, a, b]) => {
    const o = []; for (let x = a; x <= b; x += 9) o.push([x, y + Math.sin(x * .06 + y) * 2.2]); return o; });
  const KNOT = [ell(-236, -76, 10, 6, 20), ell(-236, -76, 4, 2.4, 12)];
  const MOSS = [[-318, -236, 14], [-206, -150, 10]].map(([a, b, hgt], m) => { // moss cushions draped over the top of the log
    const o = []; for (let i = 0; i <= 16; i++) { const s = i / 16; o.push([lerp(a, b, s), LG.top + 2 - hgt * Math.pow(Math.sin(Math.PI * s), .7) * (1 + .3 * Math.abs(Math.sin(s * 9 + m)))]); }
    for (let i = 16; i >= 0; i--) { const s = i / 16; o.push([lerp(a, b, s), LG.top + 6 + Math.abs(Math.sin(s * 11 + m)) * 7 * Math.sin(Math.PI * s)]); }
    return o; });
  function clump(x, n, h0, h1, spread, seed) { // a grass clump: blades fan out from one spot
    return Array.from({ length: n }, (_, i) => { const s = n > 1 ? i / (n - 1) - .5 : 0;
      return { x: x + s * spread + (hash(seed + i) - .5) * 6, h: lerp(h0, h1, hash(seed + i * 2.1)) * (1 - Math.abs(s) * .55), lean: s * .95 + (hash(seed + i * 3.3) - .5) * .3,
        w: 4.5 + hash(seed + i * 4.4) * 2.5, dark: hash(seed + i * 5.5) < .35, ph: hash(seed + i * 6.6) * 6, seed: seed * 10 + i }; }); }
  const GRASS_A = clump(-352, 9, 90, 155, 60, 1), GRASS_B = clump(212, 10, 60, 125, 56, 2), GRASS_C = clump(322, 5, 28, 58, 26, 3);
  const PEBBLES = [[150, -3, 6, 3.5], [168, -2, 4, 2.4], [-24, -2.5, 5, 3], [396, -2.5, 5, 3], [-392, -2, 4, 2.5]];
  const FLIES = Array.from({ length: 7 }, (_, i) => ({ x: lerp(-290, 330, hash(i * 3.1 + .5)), y: lerp(-215, -55, hash(i * 5.7 + .2)), p: hash(i * 7.9) * TAU, s: .6 + hash(i * 9.3) * .6, d: hash(i * 11.3) * .7 }));
  const MIST = Array.from({ length: 7 }, (_, i) => ({ x: lerp(-420, 380, i / 6) + (hash(i * 2.7) - .5) * 60, y: -18 - hash(i * 4.9) * 50, r: 90 + hash(i * 6.1) * 70, v: 5 + hash(i * 8.3) * 7, front: i % 3 === 1 }));
  const LEAVES = [{ t0: 1.7, x: 150, dur: 4.2, c: C.orange, s: 1 }, { t0: 3.4, x: -392, dur: 4.4, c: C.mustard, s: .85 }, { t0: 5.2, x: 272, dur: 4.3, c: C.mossL, s: .9 }];

  /* ---------- ground, log, grass, pebbles, leaves ---------- */
  function ground(t) {
    const p = eio(seg(t, .25, 1)); if (p <= 0) return;
    const gr = g.createLinearGradient(-450, 0, 450, 0);
    gr.addColorStop(0, 'rgba(70,55,42,0)'); gr.addColorStop(.14, 'rgba(70,55,42,.62)'); gr.addColorStop(.86, 'rgba(70,55,42,.62)'); gr.addColorStop(1, 'rgba(70,55,42,0)');
    g.beginPath(); path(wob(GROUND, 3), p); g.lineWidth = 1.1 / S0; g.strokeStyle = gr; g.stroke();
    if (!lo) { g.globalAlpha = .45; g.beginPath(); path(wob(GROUND.map(q => [q[0], q[1] + .7 / S0]), 4), eio(seg(t, .35, 1.1))); g.stroke(); g.globalAlpha = 1; } // second pencil pass
  }
  function logDraw(t) {
    const pS = eio(seg(t, .7, 1.4)), pE = eio(seg(t, .95, 1.4)), pH = eio(seg(t, 1.15, 1.5)), pF = sm(seg(t, 1.35, 2));
    if (pS <= 0) return;
    if (pF > 0) { // paint goes on after the ink, with a left-to-right brush wipe
      oval(-205, 1, 150, 6, C.ink, .12 * pF);
      g.save(); g.beginPath(); g.rect(LG.x0 - 40, -220, (LG.x1 + 90 - LG.x0) * pF, 240); g.clip();
      fill(logFill, C.wood, 11);
      g.save(); g.beginPath(); path(wob(logFill, 11)); g.clip();
      fill(logShade, C.woodD, 12, .9);
      g.beginPath(); path(wob(logHi, 17)); g.lineWidth = 6; g.strokeStyle = C.woodL; g.globalAlpha = .75; g.stroke(); g.globalAlpha = 1;
      g.restore();
      fill(endE, C.bark, 13); fill(ringE, C.ring, 16); fill(holeE, C.hole, 14); fill(holeIn, C.holeD, 15);
      MOSS.forEach((m, i) => { fill(m, C.moss, 30 + i); fill(m.slice(m.length / 2), C.mossD, 30 + i, .8); });
      g.restore();
    }
    stroke(logSil, pS, 1.4, C.ink, 11);
    stroke(endE, pE, 1.4, C.ink, 13); stroke(ringE, pE, 1, 'rgba(58,42,28,.55)', 16); stroke(holeE, pH, 1.3, C.ink, 14);
    BARK.forEach((b, i) => stroke(b, eio(seg(t, 1.2 + i * .05, 1.55 + i * .05)), 1, 'rgba(58,42,28,.5)', 20 + i));
    KNOT.forEach((k, i) => stroke(k, eio(seg(t, 1.35, 1.6)), 1, 'rgba(58,42,28,.6)', 40 + i));
    MOSS.forEach((m, i) => stroke(m, eio(seg(t, 1.3, 1.75)), 1.1, C.ink, 30 + i));
  }
  function grass(cl, t, t0) {
    const pOut = seg(t, t0, t0 + .8), pFill = sm(seg(t, t0 + .5, t0 + 1.1)); if (pOut <= 0) return;
    for (let i = 0; i < cl.length; i++) {
      const b = cl[i], d = i / cl.length * .45, p = eio(seg(pOut, d, d + .55)); if (p <= 0) continue;
      // wind: a slow gust travelling left to right plus each blade's own flutter
      const sw = Math.sin(T * 1.6 + b.ph + b.x * .02) * 2.5 + (Math.sin(T * .75 - b.x * .006) * .5 + .5) * 9 * (b.h / 110);
      const tip = [b.x + Math.sin(b.lean) * b.h + sw, -Math.cos(b.lean) * b.h + Math.abs(sw) * .15];
      const cen = quad([b.x, 0], [b.x + Math.sin(b.lean) * b.h * .3 + sw * .25, -b.h * .6], tip, 10), n = cen.length, L = [], R = [];
      for (let j = 0; j < n; j++) {
        const a = cen[Math.max(0, j - 1)], c = cen[Math.min(n - 1, j + 1)], nx = a[1] - c[1], ny = c[0] - a[0], l = Math.hypot(nx, ny) || 1, w = b.w * .5 * Math.pow(1 - j / (n - 1), .8);
        L.push([cen[j][0] + nx / l * w, cen[j][1] + ny / l * w]); R.push([cen[j][0] - nx / l * w, cen[j][1] - ny / l * w]);
      }
      const poly = wob(L.concat(R.reverse()), b.seed), Lw = poly.slice(0, n), Rw = poly.slice(n).reverse();
      if (pFill > 0) {
        g.globalAlpha = pFill; g.beginPath(); path(poly); g.closePath(); g.fillStyle = b.dark ? C.mossD : C.moss; g.fill();
        if (!b.dark) { g.beginPath(); path(wob(cen, b.seed + 5), .85); ink(.8, C.mossD); g.stroke(); }
        g.globalAlpha = 1;
      }
      g.beginPath(); path(Lw, p); path(Rw, p); ink(1.1); g.stroke();
    }
  }
  function pebbles(t) {
    const p = sm(seg(t, 1.6, 2)); if (p <= 0) return;
    PEBBLES.forEach(([x, y, rx, ry], i) => { const e = ell(x, y, rx, ry, 14); fill(e, i % 2 ? C.ring : C.woodL, 50 + i, p); stroke(e, p, 1, C.ink, 50 + i); });
  }
  function leaves(t) {
    const top = -OY / S0 - 30;
    for (const f of LEAVES) {
      if (t < f.t0) continue;
      const u = seg(t, f.t0, f.t0 + f.dur), x = f.x + Math.sin(u * TAU * 1.4) * 34 * (1 - u * .5), y = lerp(top, -3, 1 - Math.pow(1 - u, 1.2)), r = Math.cos(u * TAU * 1.4) * .9 * (1 - u);
      g.save(); g.translate(x, y); g.rotate(r); g.scale(f.s, f.s * (u < 1 ? .75 + .25 * Math.abs(Math.cos(u * TAU * 1.4)) : .6)); // flips as it tumbles, lies flat on the ground
      const o = []; for (let i = 0; i <= 12; i++) { const s = i / 12; o.push([(s - .5) * 24, -Math.sin(Math.PI * s) * 5 * Math.pow(s, .3)]); }
      for (let i = 12; i >= 0; i--) { const s = i / 12; o.push([(s - .5) * 24, Math.sin(Math.PI * s) * 5 * Math.pow(s, .3)]); }
      fill(o, f.c, 60 + f.t0); stroke(o, 1, 1, C.ink, 60 + f.t0);
      stroke([[-15, 0], [11, 0]], 1, .8, 'rgba(58,42,28,.6)', 61 + f.t0);
      g.restore();
    }
  }

  /* ---------- spider ---------- */
  const LEGS = [{ hx: 30, fx: 84, a: 44, b: 56 }, { hx: 20, fx: 40, a: 38, b: 46 }, { hx: 10, fx: -20, a: 36, b: 44 }, { hx: 0, fx: -66, a: 44, b: 54 }];
  const HIP_Y = -44, X0 = -160, X1 = 50, STRIDE = (X1 - X0) / 4, LIFT = 11, WALK0 = 3, WALK1 = 5, K = 1.2; // K: spider drawn 1.2x (its own space)
  const floorY = x => x < -92 ? -14 : x < -48 ? lerp(-14, 0, sm((x + 92) / 44)) : 0; // log floor inside, then the ground
  const spX = t => lerp(X0, X1, eio(seg(t, WALK0, WALK1)));
  const blink = u => u > 0 && u < .16 ? Math.sin(Math.PI * u / .16) : 0;
  const fY = (st, x) => floorY(st.x + (x - st.x) * K) / K; // ground height in the spider's (scaled) space
  const xf = (st, lx, ly) => { const c = Math.cos(st.rot), s = Math.sin(st.rot); return [st.x + lx * c - ly * s, st.y + lx * s + ly * c]; };
  let tilt = 0, lookX = .3, lookY = .1, lastT = 0;
  function cricketPos(t) { const c = cricketState(t); return c ? [c.x, c.y - 10] : null; }
  function spiderState(t, dt) {
    const x = spX(t), v = (spX(t + .02) - spX(t - .02)) / .04, vN = Math.min(1, Math.abs(v) / 150), dist = x - X0;
    const fA = floorY(x + 40), fB = floorY(x - 40), w = t > 7 ? sm(seg(t, 7.25, 7.55)) * (1 - sm(seg(t, 8.6, 8.95))) : 0;
    const st2 = t - WALK1, settle = st2 > 0 ? Math.exp(-st2 * 5) * Math.sin(st2 * 16) * .07 : 0;
    const st = { x, dist, vN, wave: w, rot: Math.atan2(fA - fB, 80) * .7 - .06 * w,
      y: (fA + fB) / 2 / K - 2 * Math.abs(Math.sin(Math.PI * dist / (STRIDE / 2))) + settle * 20,
      sqx: 1 + .05 * vN - settle * .6, sqy: 1 - .04 * vN + settle, breath: Math.sin(t * 2.3) * .025,
      dark: .93 * (1 - sm(seg(x, -160, -75))), eyeA: sm(seg(t, 2, 2.3)) };
    let lid = sm(seg(t, 2, 2.35)); for (const b of [2.75, 3.1, 6.95, 9.35]) lid *= 1 - blink(t - b);
    if (t > 10) lid *= 1 - blink((t - 10) % 3.4 - 1.6);
    st.lid = lid;
    // where the eyes look and how the head tilts
    let tx = .3, ty = .1, tt = 0; const cp = t > 5.1 && t < 7.25 ? cricketPos(t) : null;
    if (t > WALK0 && t < WALK1 + .2) { tx = 1; ty = .15; }
    if (cp) { const e = xf(st, 46, -55), dx = cp[0] - (st.x + (e[0] - st.x) * K), dy = cp[1] - e[1] * K, l = Math.hypot(dx, dy) || 1; tx = dx / l; ty = dy / l; tt = Math.max(-.3, Math.min(.1, dy / l * .3)); if (t > 5.55 && t < 6.05) tt = .2; if (t > 6.95) tt += .16; }
    if (t >= 7.25) { tx = 0; ty = .1; tt = -.07; }
    const k = 1 - Math.exp(-dt * 8), k2 = 1 - Math.exp(-dt * 5);
    lookX += (tx - lookX) * k; lookY += (ty - lookY) * k; tilt += (tt - tilt) * k2;
    st.lookX = lookX; st.lookY = lookY; st.tilt = tilt;
    return st;
  }
  function foot(st, i, far) { // tetrapod gait: legs R1 L2 R3 L4 swing together, then the other four
    const L = LEGS[i], grp = (i + (far ? 1 : 0)) % 2, u = ((st.dist / STRIDE + grp * .5) % 1 + 1) % 1;
    const sS = STRIDE / K, off = u < .5 ? sS * (.25 - u) : sS * (-.25 + .5 * sm((u - .5) * 2)), lift = u < .5 ? 0 : Math.sin(Math.PI * (u - .5) * 2) * LIFT;
    const fx = st.x + L.fx + off + (far ? 6 : 0);
    return [fx, fY(st, fx) - lift - (far ? 3 : 0)];
  }
  function leg(Hp, F, a, b, col, w, seed, hairy) { // 2-bone IK (knee up) + a small extra joint = 3 visible segments
    let dx = F[0] - Hp[0], dy = F[1] - Hp[1], d = Math.hypot(dx, dy); const m = a + b - .5;
    if (d > m) { F = [Hp[0] + dx / d * m, Hp[1] + dy / d * m]; dx = F[0] - Hp[0]; dy = F[1] - Hp[1]; d = m; }
    const ang = Math.atan2(dy, dx), kk = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))), s = dx >= 0 ? -1 : 1;
    const K = [Hp[0] + Math.cos(ang + s * kk) * a, Hp[1] + Math.sin(ang + s * kk) * a];
    const ex = F[0] - K[0], ey = F[1] - K[1], el = Math.hypot(ex, ey) || 1, nx = ex >= 0 ? ey / el : -ey / el, ny = ex >= 0 ? -ex / el : ex / el;
    const J = [(K[0] + F[0]) / 2 + nx * 3, (K[1] + F[1]) / 2 + ny * 3];
    const P = wob([Hp, K, J, F], seed), ws = [w, w * .82, w * .62];
    g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < 3; j++) { // ink outline first, then colour
      g.beginPath(); g.moveTo(P[j][0], P[j][1]); g.lineTo(P[j + 1][0], P[j + 1][1]);
      g.lineWidth = ws[j] + (pass ? 0 : 2.4 / S0); g.strokeStyle = pass ? col : C.ink; g.stroke();
    }
    g.beginPath(); // pale "knee" bands like real tarantulas
    for (const [q, r, wj] of [[P[1], P[2], ws[0]]]) { const bx = r[0] - q[0], by = r[1] - q[1], bl = Math.hypot(bx, by) || 1, px = -by / bl * wj * .45, py = bx / bl * wj * .45, cx = q[0] + bx / bl * 3, cy = q[1] + by / bl * 3; g.moveTo(cx - px, cy - py); g.lineTo(cx + px, cy + py); }
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(201,154,56,.8)'; g.stroke();
    if (hairy) { g.beginPath(); // short bristles on thigh and shin
      for (let j = 0; j < 2; j++) { const q = P[j], r = P[j + 1], bx = r[0] - q[0], by = r[1] - q[1], bl = Math.hypot(bx, by) || 1, sx = bx > 0 ? 1 : -1;
        for (const f of [.3, .55, .8]) { const cx = q[0] + bx * f, cy = q[1] + by * f, hx = -by / bl * sx, hy = bx / bl * sx; g.moveTo(cx - hx * ws[j] * .4, cy - hy * ws[j] * .4); g.lineTo(cx - hx * (ws[j] * .4 + 4) - bx / bl * 2, cy - hy * (ws[j] * .4 + 4) - by / bl * 2); } }
      ink(1, 'rgba(40,28,20,.85)'); g.stroke(); }
  }
  function hairs(cx, cy, rx, ry, n, len, seed, col, a0, a1) { // hair strands poking out of the fluffy outline, swaying a little
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = lerp(a0, a1, (i + hash(seed + i) * .7) / n), c = Math.cos(a), s = Math.sin(a), x = cx + c * rx * 1.04, y = cy + s * ry * 1.04;
      const L = len * (.6 + hash(seed + i * 2.3) * .7), cu = (hash(seed + i * 5.1) - .5) * .9 + Math.sin(T * 2 + i) * .12;
      g.moveTo(x, y); g.quadraticCurveTo(x + c * L * .6, y + s * L * .6, x + Math.cos(a + cu) * L, y + Math.sin(a + cu) * L);
    }
    ink(1, col); g.stroke();
  }
  function blob(cx, cy, rx, ry, k, amp, seed, rot = 0, col = C.body) { // hairy body part: flat fill, one shade, one highlight, ink edge
    const P = wob(fuzz(cx, cy, rx, ry, k, amp, rot), seed);
    g.beginPath(); path(P); g.closePath(); g.fillStyle = col; g.fill();
    g.save(); g.clip();
    oval(cx + rx * .1, cy + ry * .78, rx * 1.2, ry * .72, C.bodyD, 1, rot);
    oval(cx - rx * .28, cy - ry * .5, rx * .42, ry * .2, C.bodyL, .9, rot - .25);
    g.restore();
    g.beginPath(); path(P); g.closePath(); ink(1.4); g.stroke();
  }
  function bodyXf(st) { g.translate(st.x, st.y); g.rotate(st.rot); g.translate(0, HIP_Y); g.scale(st.sqx, st.sqy); g.translate(0, -HIP_Y); }
  const headXf = st => { g.translate(10, -46); g.rotate(st.tilt); g.translate(-10, 46); };
  function spiderBody(st, t) {
    oval(st.x - 5, fY(st, st.x) + 1, 88, 6, C.ink, .13 * (1 - st.dark)); // contact shadow
    const hipsFar = LEGS.map(L => xf(st, L.hx + 5, HIP_Y - 3)), hipsNear = LEGS.map(L => xf(st, L.hx, HIP_Y));
    const palp = far => { const h = xf(st, far ? 46 : 42, far ? -43 : -40), fx = st.x + 66 + (far ? 5 : 0), lift = 3 * Math.max(0, Math.sin(st.dist / STRIDE * TAU + (far ? Math.PI : 0))) + (t > 9 ? 2 * Math.max(0, Math.sin(t * 3)) : 0);
      leg(h, [fx, fY(st, fx) - lift - (far ? 3 : 0)], 24, 28, far ? C.bodyD : C.body, 4.4, far ? 97 : 98, false); };
    for (let i = 3; i >= 0; i--) leg(hipsFar[i], foot(st, i, true), LEGS[i].a, LEGS[i].b, C.bodyD, 6.2, 70 + i, false);
    palp(true);
    g.save(); bodyXf(st);
    // abdomen: lags a little behind when walking, breathes when resting
    const ax = -42 - 4 * st.vN, ary = 31 * (1 + st.breath);
    oval(-80 - 4 * st.vN, -45, 6, 4, C.body); blob(ax, -48, 38, ary, 16, .06, 80);
    g.save(); g.globalAlpha = .55; for (let i = 0; i < 3; i++) stroke([[ax - 20 + i * 12, -68 + i * 1.5], [ax - 14 + i * 12, -62 + i * 1.5], [ax - 8 + i * 12, -68 + i * 1.5]], 1, 1.2, C.bodyL, 85 + i); g.restore();
    hairs(ax, -48, 38, ary, 18, 8, 81, 'rgba(40,28,20,.8)', Math.PI * .75, Math.PI * 2.1);
    hairs(ax, -48, 38, ary, 6, 9, 82, C.brass, Math.PI * 1.05, Math.PI * 1.9);
    // head: carapace, jaws, little eye bump, blush
    g.save(); headXf(st);
    blob(16, -52, 32, 23, 20, .035, 83, -.06, C.head);
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI * (1.05 + i * .18); g.moveTo(12, -54); g.lineTo(12 + Math.cos(a) * 20, -54 + Math.sin(a) * 13); } ink(.9, 'rgba(120,95,70,.55)'); g.stroke();
    hairs(16, -52, 32, 23, 10, 5, 84, 'rgba(40,28,20,.8)', Math.PI * 1.05, Math.PI * 1.85);
    blob(43, -37, 10, 9, 10, .07, 86);
    oval(25, -73, 9, 5, C.bodyL); g.beginPath(); g.ellipse(25, -73, 9, 5, 0, Math.PI, TAU); ink(1); g.stroke();
    for (const [ex, ey] of [[19, -74], [23, -76.5], [27.5, -76.5], [31.5, -74]]) { oval(ex, ey, 1.9, 1.9, '#140d08'); oval(ex - .5, ey - .6, .6, .6, C.eye); }
    oval(31, -41, 6.5, 3.2, C.orange, .55);
    g.restore(); g.restore();
    palp(false);
    for (let i = 3; i >= 1; i--) leg(hipsNear[i], foot(st, i, false), LEGS[i].a, LEGS[i].b, C.body, 7, 90 + i, true);
    // front leg: walks, then waves hello
    let f = foot(st, 0, false);
    if (st.wave > 0) { const h = hipsNear[0], ph = (t - 7.25) * 13, wt = [h[0] + 30 + Math.sin(ph) * 10, h[1] - 62 + Math.cos(ph) * 4]; f = [lerp(f[0], wt[0], st.wave), lerp(f[1], wt[1], st.wave)]; }
    leg(hipsNear[0], f, LEGS[0].a, LEGS[0].b, C.body, 7, 90, true);
  }
  function eyes(st) {
    g.save(); bodyXf(st); headXf(st);
    if (st.dark > .05 && !lo) { const gr = g.createRadialGradient(47, -56, 2, 47, -56, 34); gr.addColorStop(0, `rgba(240,200,90,${.45 * st.dark * st.eyeA})`); gr.addColorStop(1, 'rgba(240,200,90,0)'); g.fillStyle = gr; g.fillRect(10, -94, 76, 76); }
    g.globalAlpha = st.eyeA;
    for (const [ex, ey, r] of [[54, -58, 9.5], [42, -54, 13]]) {
      g.save(); g.translate(ex, ey);
      if (st.lid < .18) { g.beginPath(); g.arc(0, r * .5, r * .8, Math.PI * 1.2, Math.PI * 1.8); ink(1.6); g.stroke(); g.restore(); continue; } // closed: a happy little arc
      g.scale(1, st.lid);
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = C.eye; g.fill(); ink(1.3); g.stroke();
      const px = st.lookX * r * .28, py = st.lookY * r * .28;
      oval(px, py, r * .7, r * .7, '#1f150f');
      oval(px - r * .26, py - r * .28, r * .26, r * .26, '#fffaf0'); oval(px + r * .24, py + r * .22, r * .1, r * .1, '#fffaf0');
      g.restore();
    }
    g.restore();
  }
  function spiderDraw(st, t) {
    if (t < 1.9) return;
    const inside = st.x < 40, clip = () => { g.beginPath(); g.ellipse(HOLE[0], HOLE[1], HOLE[2], HOLE[3], 0, 0, TAU); g.rect(LG.x1, -400, 900, 460); g.clip(); };
    const sc = () => { g.translate(st.x, 0); g.scale(K, K); g.translate(-st.x, 0); };
    g.save(); if (inside) clip(); sc(); spiderBody(st, t); g.restore();
    if (st.dark > .01) oval(HOLE[0], HOLE[1], HOLE[2], HOLE[3], 'rgb(22,15,10)', st.dark); // still in the dark log: only the eyes show
    g.save(); if (inside) clip(); sc(); eyes(st); g.restore();
  }

  /* ---------- cricket ---------- */
  function cricketState(t) {
    if (t < 4.9) return null;
    const xs = Math.max(440, (W - OX) / S0 + 40), cx = Math.min(330, (W - OX) / S0 - 45), top = LG.top + Math.sin(-236 * .09) * 1.2;
    const at = u => u < 5.5 ? (s => [lerp(xs, cx, s), -4 * 42 * s * (1 - s)])(seg(u, 4.9, 5.5)) :
      u < 6.05 ? [cx, 0] : u < 6.95 ? (s => [lerp(cx, -236, s), lerp(0, top, s) - 4 * 170 * s * (1 - s)])(seg(u, 6.05, 6.95)) : [-236, top];
    const [x, y] = at(t), air = (t < 5.5) || (t >= 6.05 && t < 6.95);
    let rot = 0; if (air) { const a = at(t - .01), b = at(t + .01); rot = Math.atan2(b[1] - a[1], Math.abs(b[0] - a[0])) * .7; }
    const crouch = t < 6.05 ? Math.max(sm(seg(t, 5.5, 5.6)) * (1 - sm(seg(t, 5.6, 5.75))) * .6, sm(seg(t, 5.8, 6.05))) : t > 6.95 ? (1 - sm(seg(t, 6.95, 7.2))) * .7 : 0;
    const kick = t >= 6.05 && t < 6.95 ? 1 - seg(t, 6.05, 6.3) : 0, chirp = t > 7.3 && (t - 7.3) % 4 < 1.5;
    return { x, y, rot, crouch, air, kick, chirp };
  }
  function cricketDraw(c, t) {
    if (!c.air) oval(c.x, c.y + 1, 22, 3, C.ink, .12);
    g.save(); g.translate(c.x, c.y); g.scale(-1, 1); g.rotate(c.rot); // drawn facing right, mirrored to hop left
    const by = -9 + c.crouch * 3.5;
    const hind = far => { // big jumping leg: drumstick thigh + thin spiny shin
      const hip = [-4 + (far ? 3 : 0), by + 1], kn = c.kick > 0 ? [lerp(-18, -20, c.kick), lerp(by - 10, by - 1, c.kick)] : c.air ? [-17, by - 11] : [lerp(-18, -14, c.crouch), lerp(by - 10, by - 13, c.crouch)];
      const ft = c.kick > 0 ? [lerp(-24, -38, c.kick), lerp(0, by + 5, c.kick)] : c.air ? [-24, by + 3] : [lerp(-27, -11, c.crouch), 0];
      if (far) { kn[0] += 3; ft[0] += 3; kn[1] -= 1; }
      const P = wob([hip, kn, ft], far ? 120 : 121);
      g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.lineWidth = 6.5 + 2.2 / S0; g.strokeStyle = C.ink; g.stroke(); g.lineWidth = 6.5; g.strokeStyle = far ? C.criD : C.cri; g.stroke();
      g.beginPath(); g.moveTo(P[1][0], P[1][1]); g.lineTo(P[2][0], P[2][1]); ink(2.4); g.lineWidth = 2.2; g.stroke();
      g.beginPath(); for (const f of [.3, .55, .8]) { const x = lerp(P[1][0], P[2][0], f), y = lerp(P[1][1], P[2][1], f); g.moveTo(x, y); g.lineTo(x + 2, y - 2.5); } ink(.9); g.stroke();
    };
    const small = (hx, fx, far) => { const k = c.air ? [hx + 4, by + 5] : [hx + 2, by + 6], f = c.air ? [hx + 8, by + 8] : [fx, 0]; stroke([[hx, by + 2], k, f], 1, 1.4, far ? C.criD : C.ink, 125 + hx); };
    hind(true); small(9, 13, true); small(3, 1, true);
    oval(-5, by, 13, 6.8, C.cri); g.save(); g.beginPath(); g.ellipse(-5, by, 13, 6.8, 0, 0, TAU); g.clip(); oval(-5, by + 5, 14, 4, C.criD); g.restore();
    g.beginPath(); g.ellipse(-5, by, 13, 6.8, 0, 0, TAU); ink(1.2); g.stroke();
    stroke([[-17, by], [-25, by - 3]], 1, 1, C.ink, 126); stroke([[-17, by + 1], [-24, by + 2]], 1, 1, C.ink, 127);
    g.save(); g.translate(5, by - 5); g.rotate(c.chirp ? -.28 * Math.abs(Math.sin(t * 38)) : 0); // wings rub together to chirp
    const wg = [[0, 0], [-22, 2], [-21, 6], [-1, 4]]; fill(wg, C.wing, 128); stroke([...wg, wg[0]], 1, 1.1, C.ink, 128);
    stroke([[-3, 2], [-19, 3.5]], 1, .8, 'rgba(242,232,210,.5)', 129); g.restore();
    oval(8, by - 1, 6.5, 6, C.cri); g.beginPath(); g.ellipse(8, by - 1, 6.5, 6, 0, 0, TAU); ink(1.2); g.stroke();
    oval(15, by - 1, 5.5, 5.5, C.cri); oval(15, by + 2, 5, 2.5, C.criD); g.beginPath(); g.arc(15, by - 1, 5.5, 0, TAU); ink(1.2); g.stroke();
    oval(16.5, by - 3, 2, 2, '#1f150f'); oval(16, by - 3.6, .7, .7, '#fffaf0');
    for (const s of [0, 1]) { const sw = Math.sin(t * (3 + s) + s * 2) * 6; stroke(quad([18, by - 5], [30 + sw * .5, by - 26], [8 + sw, by - 40 + s * 4], 12), 1, 1, C.ink, 130 + s); } // antennae sweep
    hind(false); small(11, 16, false); small(5, 3, false);
    g.restore();
    if (c.chirp) { const k = ((t - 7.3) % 4) / 1.5; g.globalAlpha = Math.sin(Math.PI * k); // "cri-cri" sound arcs
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(c.x, c.y - 16, 12 + i * 7 + k * 6, -Math.PI * .8, -Math.PI * .55); g.arc(c.x, c.y - 16, 12 + i * 7 + k * 6, -Math.PI * .45, -Math.PI * .2, false); ink(1, C.ink); g.stroke(); }
      g.globalAlpha = 1; }
  }

  /* ---------- fireflies, mist, title ---------- */
  function flies(t) {
    for (const f of FLIES) {
      const a = sm(seg(t, 5 + f.d, 5.8 + f.d)); if (a <= 0) continue;
      const x = f.x + Math.sin(t * .45 * f.s + f.p) * 45 + Math.sin(t * 1.3 + f.p * 2) * 10, y = f.y + Math.sin(t * .6 * f.s + f.p * 1.7) * 28 + Math.cos(t * 1.7 + f.p) * 6;
      const pulse = .55 + .45 * Math.sin(t * 2.2 * f.s + f.p);
      if (!lo) { const gr = g.createRadialGradient(x, y, 0, x, y, 24); gr.addColorStop(0, `rgba(246,206,80,${.6 * pulse * a})`); gr.addColorStop(1, 'rgba(246,206,80,0)'); g.fillStyle = gr; g.fillRect(x - 24, y - 24, 48, 48); }
      g.globalAlpha = a; oval(x, y, 2.6, 2.6, `rgb(${Math.round(lerp(214, 250, pulse))},${Math.round(lerp(160, 214, pulse))},70)`);
      g.beginPath(); g.arc(x, y, 2.6, 0, TAU); ink(.8, 'rgba(58,42,28,.6)'); g.stroke(); g.globalAlpha = 1;
    }
  }
  function mist(t, front) {
    const a = sm(seg(t, 5, 6.5)) * (front ? .35 : .55); if (a <= 0) return;
    MIST.forEach((m, i) => {
      if (m.front !== !!front || (lo && i % 2)) return;
      const x = m.x + (t - 5) * m.v, y = m.y + Math.sin(t * .4 + i) * 4;
      g.save(); g.translate(x, y); g.scale(1, .42);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, m.r); gr.addColorStop(0, `rgba(255,251,241,${a})`); gr.addColorStop(1, 'rgba(255,251,241,0)');
      g.fillStyle = gr; g.fillRect(-m.r, -m.r, m.r * 2, m.r * 2); g.restore();
    });
  }
  function title(t) {
    const p = seg(t, 8.2, 9.5); if (p <= 0) return;
    const fs = Math.round(Math.min(W * .13, H * .11, 84)), ty = Math.max(fs * .9 + 10, (OY - 280 * S0) * .5);
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.font = `${fs}px Itim, Mitr, sans-serif`; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const a = 'บึ้งไทย ', b = '3D', wa = g.measureText(a).width, wb = g.measureText(b).width, x0 = W / 2 - (wa + wb) / 2, span = wa + wb + 40;
    const jx = JA ? (hash(boil * 3.3) - .5) * .9 : 0, jy = JA ? (hash(boil * 5.1) - .5) * .9 : 0;
    const reveal = (q, fn) => { if (q <= 0) return; g.save(); g.beginPath(); g.rect(x0 - 20, ty - fs, span * q, fs * 2); g.clip(); fn(); g.restore(); };
    const outline = () => { g.lineWidth = Math.max(1, fs / 48); g.strokeStyle = C.ink; g.strokeText(a, x0 + jx, ty + jy); g.strokeText(b, x0 + wa + jx, ty + jy); };
    const q1 = eio(p), q2 = eio(seg(t, 8.45, 9.75));
    reveal(q1, outline); // pen outline first ...
    reveal(q2, () => { g.fillStyle = C.ink; g.fillText(a, x0 + jx, ty + jy); g.fillStyle = C.brass; g.fillText(b, x0 + wa + jx, ty + jy); outline(); }); // ... then ink fills in
    if (q1 < 1) { oval(x0 - 20 + span * q1, ty + Math.sin(q1 * 40) * fs * .25, 2.5, 2.5, C.ink); } // pen nib
    const u = eio(seg(t, 9.2, 9.9));
    if (u > 0) { const sw = []; for (let i = 0; i <= 24; i++) { const s = i / 24; sw.push([x0 + (wa + wb) * (.08 + .84 * s), ty + fs * .62 + Math.sin(s * Math.PI) * fs * .08 - s * fs * .06]); }
      g.beginPath(); path(wob(sw, 140), u); g.lineWidth = Math.max(2, fs / 26); g.strokeStyle = C.brass; g.lineCap = 'round'; g.stroke(); }
  }

  /* ---------- run ---------- */
  let t0 = 0, raf = 0, done = false, said = false, shown = false;
  function draw(t) {
    const dt = Math.min(.1, Math.max(0, t - lastT)); lastT = t; T = t;
    const q = typeof quality !== 'undefined' && quality !== 'high'; // the game's quality setting (fast modes = no grain / boil / glow)
    if (q !== lo || !paper) { lo = q; resize(); }
    boil = lo ? 0 : Math.floor(t * 8); JA = lo ? 0 : 1.1 / S0;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalAlpha = 1; g.drawImage(paper, 0, 0, W, H);
    g.setTransform(DPR * S0, 0, 0, DPR * S0, DPR * OX, DPR * OY); g.lineCap = g.lineJoin = 'round';
    mist(t, 0); ground(t); grass(GRASS_A, t, 1); logDraw(t); pebbles(t);
    const st = spiderState(t, dt); spiderDraw(st, t);
    grass(GRASS_B, t, 1.2); grass(GRASS_C, t, 1.35);
    const c = cricketState(t); if (c) cricketDraw(c, t);
    leaves(t); flies(t); mist(t, 1); title(t);
    // the game's speech bubble, over the spider's head
    if (t >= 8 && !said) { said = true; const L = typeof VOICE !== 'undefined' && VOICE.chatter || ['ข้าคือสไปเดอร์แมนตัวจริง!']; bub.textContent = L[Math.floor(Math.random() * L.length)]; bub.classList.add('on'); }
    if (said) { bub.style.left = Math.max(130, Math.min(W - 130, OX + (st.x + 25) * S0)) + 'px'; bub.style.top = Math.max(60, OY + (st.y - 90) * K * S0) + 'px'; }
    if (t >= 9.5 && !shown) { shown = true; playB.classList.add('on'); playB.tabIndex = 0; try { playB.focus({ preventScroll: true }); } catch (e) {} }
  }
  function frame(now) {
    if (!t0) t0 = now;
    draw((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  }
  function finish() { // fade out into the real 3D game (name / species card underneath)
    if (done) return; done = true;
    root.classList.add('out'); bub.classList.remove('on');
    removeEventListener('keydown', onKey, true); removeEventListener('resize', resize);
    setTimeout(() => { cancelAnimationFrame(raf); root.remove(); css.remove(); }, 950);
  }
  function onKey(e) { if (e.key === 'Escape' || (shown && e.key === 'Enter')) { e.preventDefault(); finish(); } }
  skipB.onclick = finish; playB.onclick = finish;
  addEventListener('keydown', onKey, true); addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(frame);
  window.INTRO = { draw, finish }; // test hook: draw(seconds) renders one frame
})();
