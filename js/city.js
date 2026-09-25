'use strict';
/* =====================================================================
   City: an abandoned Showa-era back-street town, reclaimed by moss (kaiju-movie mood).
   Lives in the back strip + right strip of the tank (inCity). Seeded: the same town every load.
   The whole town is only three merged meshes (few draw calls):
     BODY  walls, roofs, rubble, props, poles, wires: one tile atlas; the only shadow caster
     DECO  windows, signs, doors, vending fronts, vines, road paint: one atlas; glows at night
     MOSS  moss cushions on roofs, ledges and rubble
   ===================================================================== */
const CITY = (() => {
  const R = seeded(1954), rr = (a, b) => a + R() * (b - a), pick = a => a[R() * a.length | 0];
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  const hash = (a, b) => frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);
  const JP = '"Hiragino Sans","Yu Gothic","Meiryo","Noto Sans JP","Noto Sans CJK JP","IPAGothic","IPAPGothic",sans-serif';
  const JM = '"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP","Noto Serif CJK JP","IPAMincho",' + JP;

  /* ---------- BODY atlas: 4×2 tiles of 256 px (240 px seamless + 8 px wrapped border, so repeats never seam) ---------- */
  const T = { CONC: 0, PLAST: 1, TILE: 2, WOOD: 3, KAWARA: 4, SHUT: 5, CORR: 6, ASPH: 7 };
  const TS = [4, 3.2, 2.4, 3, 2.8, 2.4, 2.6, 6];            // world units per texture repeat
  const BA = cnv(1024, 512), ba = BA.getContext('2d');
  {
    const big = tileFbm(4, 4), fine = tileFbm(32, 2), col = tileFbm(20, 2), N = 240;
    const rust = (c, k) => [lerp(c[0], .42, k), lerp(c[1], .24, k), lerp(c[2], .12, k)];
    // note: texture row 0 = bottom of the repeat in the world (flipY off)
    const paint = [
      (u, v) => { let l = .64 + big(u, v) * .22 + fine(u, v) * .08 - .12 * Math.max(0, col(u, .5));          // concrete: seams, tie holes
        if (frac(v * 2) < .012 || u < .006) l -= .1; if (Math.hypot(frac(u * 3) - .5, (frac(v * 2) - .5) * .66) < .03) l -= .25; return [l, l, l * .96]; },
      (u, v) => { const l = .76 + big(u, v) * .14 + fine(u, v) * .1; return [l, l * .98, l * .92]; },             // mortar / plaster
      (u, v) => { const gr = frac(u * 10) < .09 || frac(v * 20) < .16;                                                   // small facade tiles
        const l = gr ? .5 : .66 + hash(Math.floor(u * 10), Math.floor(v * 20)) * .16 + fine(u, v) * .05 + big(u, v) * .1; return [l, l * .97, l * .93]; },
      (u, v) => { const f = frac(u * 5); const l = f < .05 ? .12 : .44 + hash(Math.floor(u * 5), 3) * .12 + .07 * Math.sin((u * 60 + big(u, v) * 3) * 6.283) + fine(u, v) * .1;
        return [l, l * .82, l * .66]; },                                                                            // wooden boards
      (u, v) => { const t = frac(v * 4), s = frac(u * 7); let l = .34 + .4 * Math.sin(s * Math.PI) + big(u, v) * .12;   // kawara rows
        l *= t > .86 ? .45 : t < .07 ? 1.12 : 1 - .18 * t; return [l * .92, l * .97, l * 1.05]; },
      (u, v) => { const l = .52 + .16 * Math.cos(v * 30 * 6.283) + fine(u, v) * .08; return rust([l, l, l * 1.02], clamp(big(u, v) * 2.2 + .15, 0, .9)); },   // rolling shutter
      (u, v) => { const l = .5 + .18 * Math.sin(u * 12 * 6.283) + fine(u, v) * .06; return rust([l, l, l], clamp(big(u, v) * 2 + col(u, .2) * 1.2 - .05, 0, .85)); }, // corrugated sheet
      (u, v) => { let l = .3 + big(u, v) * .08 + fine(u, v) * .08; if (hash(u * 999, v * 777) > .92) l += .12; return [l, l, l * 1.02]; },   // asphalt
    ];
    paint.forEach((fn, k) => {
      const c = cnv(N, N), g = c.getContext('2d'), id = g.createImageData(N, N), d = id.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const p = fn(x / N, y / N), o = (y * N + x) * 4;
        d[o] = clamp(p[0], 0, 1) * 255; d[o + 1] = clamp(p[1], 0, 1) * 255; d[o + 2] = clamp(p[2], 0, 1) * 255; d[o + 3] = 255; }
      g.putImageData(id, 0, 0);
      if (k === 0 || k === 1 || k === 7) for (let i = 0; i < (k === 7 ? 14 : 6); i++) {                  // hairline cracks
        let x = R() * N, y = R() * N, a = R() * 6.28; const pts = [[x, y]];
        for (let s = 0; s < 14; s++) { a += rr(-.7, .7); x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
        g.strokeStyle = `rgba(20,18,16,${k === 7 ? .8 : .45})`; g.lineWidth = k === 7 ? 1.8 : 1;
        for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke(); }
      }
      const cx = (k % 4) * 256, cy = (k >> 2) * 256; ba.save(); ba.beginPath(); ba.rect(cx, cy, 256, 256); ba.clip();
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) ba.drawImage(c, cx + 8 + ox, cy + 8 + oy); ba.restore();
    });
  }

  /* ---------- DECO atlas: 1024², 128 px cells ----------
     row 0-1: windows (10) + footprint, manhole, AC grille, 止まれ road paint | rows 2-4: vertical signs (5 painted, 3 neon)
     row 5: store band, 2 shop signs | rows 6-7: 2 vending fronts, 2 doors, shop front, 2 vine strips */
  const DA = cnv(1024, 1024), g = DA.getContext('2d');
  const cell = (x, y, w, h, fn) => { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); fn(x, y, w, h); g.restore(); };
  const grime = (x, y, w, h, a) => {                        // rust drips + dirty blotches
    for (let i = 0; i < 7; i++) { const sx = x + R() * w, len = h * rr(.2, .8), gr = g.createLinearGradient(0, y, 0, y + len);
      gr.addColorStop(0, `rgba(60,40,25,${a})`); gr.addColorStop(1, 'rgba(60,40,25,0)'); g.fillStyle = gr; g.fillRect(sx, y, rr(2, 6), len); }
    for (let i = 0; i < 5; i++) blob(g, x + R() * w, y + R() * h, rr(6, 20), 'rgba(35,30,20,.9)', a * .8);
  };
  const glass = (x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w * .4, y + h);
    gr.addColorStop(0, '#4a5662'); gr.addColorStop(.5, '#1c232b'); gr.addColorStop(1, '#0d1116'); g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(x + w * .2, y); g.lineTo(x + w * .45, y); g.lineTo(x + w * .1, y + h); g.lineTo(x - w * .15, y + h); g.fill(); };
  const shards = (cx, cy, r) => { g.fillStyle = '#040405'; g.beginPath();
    for (let k = 0; k < 11; k++) { const a = k / 11 * 6.283, q = r * rr(.45, 1.1); g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.fill();
    g.strokeStyle = 'rgba(220,230,240,.4)'; g.lineWidth = 1; g.beginPath();
    for (let k = 0; k < 7; k++) { const a = rr(0, 6.283); g.moveTo(cx + Math.cos(a) * r * .8, cy + Math.sin(a) * r * .8); g.lineTo(cx + Math.cos(a) * r * 2.2, cy + Math.sin(a) * r * 2.2); } g.stroke(); };
  const WIN = ['dark', 'curtain', 'broken', 'shoji', 'boards', 'blinds', 'torn', 'frosted', 'lit', 'hole'];
  WIN.forEach((kind, i) => cell((i % 8) * 128, (i >> 3) * 128, 128, 128, (x, y) => {
    const shoji = kind === 'shoji', frame = shoji ? '#3b2a1c' : '#8e9497';
    g.fillStyle = frame; g.fillRect(x, y, 128, 128);
    [x + 8, x + 66].forEach((X, side) => { const Y = y + 8, W = 54, H = 112;
      if (kind === 'curtain' || (kind === 'torn' && !side)) { const gr = g.createLinearGradient(X, 0, X + W, 0);
        for (let s = 0; s <= 6; s++) gr.addColorStop(s / 6, s % 2 ? '#ecc792' : '#c98f55'); g.fillStyle = gr; g.fillRect(X, Y, W, H);
        if (kind === 'torn') { g.fillStyle = '#0d1116'; g.beginPath(); g.moveTo(X + W, Y); for (let t = 0; t <= 8; t++) g.lineTo(X + W * rr(.3, .75), Y + H * t / 8); g.lineTo(X + W, Y + H); g.fill(); } }
      else if (shoji || kind === 'blinds' || kind === 'frosted') {
        g.fillStyle = shoji ? '#eee4c9' : kind === 'blinds' ? '#d3dce2' : '#b5c2c0'; g.fillRect(X, Y, W, H);
        g.strokeStyle = shoji ? '#5a4630' : 'rgba(80,95,105,.6)'; g.lineWidth = shoji ? 3 : 1.2; g.beginPath();
        if (shoji) { for (let k = 1; k < 3; k++) { g.moveTo(X + W * k / 3, Y); g.lineTo(X + W * k / 3, Y + H); } for (let k = 1; k < 5; k++) { g.moveTo(X, Y + H * k / 5); g.lineTo(X + W, Y + H * k / 5); } }
        else if (kind === 'blinds') for (let k = 4; k < H; k += 6) { g.moveTo(X, Y + k); g.lineTo(X + W, Y + k + (side && k > 60 && k < 84 ? 5 : 0)); }
        else for (let k = -H; k < W + H; k += 10) { g.moveTo(X + k, Y); g.lineTo(X + k + H, Y + H); g.moveTo(X + k, Y + H); g.lineTo(X + k + H, Y); }
        g.stroke(); }
      else if (kind === 'lit') { const gr = g.createLinearGradient(0, Y, 0, Y + H); gr.addColorStop(0, '#ffe2a8'); gr.addColorStop(1, '#b0602e'); g.fillStyle = gr; g.fillRect(X, Y, W, H);
        blob(g, X + W / 2, Y + 18, 22, 'rgba(255,250,230,1)', .9); g.fillStyle = 'rgba(40,20,10,.85)'; g.fillRect(X, Y + H * .72, W, H * .28); }
      else if (kind === 'boards' || kind === 'hole') { g.fillStyle = '#060607'; g.fillRect(X, Y, W, H); }
      else glass(X, Y, W, H);
    });
    g.fillStyle = frame; g.fillRect(x + 60, y, 8, 128);
    if (kind === 'broken') shards(x + 94, y + 62, 24);
    if (kind === 'hole') { g.fillStyle = 'rgba(170,190,200,.55)'; for (let k = 0; k < 9; k++) { const X = x + 8 + R() * 112, Y = R() < .5 ? y + 8 : y + 120; g.beginPath(); g.moveTo(X - 8, Y); g.lineTo(X + 8, Y); g.lineTo(X + rr(-6, 6), Y + (Y > y + 60 ? -1 : 1) * rr(12, 30)); g.fill(); } }
    if (kind === 'boards') for (let k = 0; k < 4; k++) { g.save(); g.translate(x + 64, y + 22 + k * 28); g.rotate(rr(-.25, .25)); g.fillStyle = hsl(28, 30, rr(22, 34)); g.fillRect(-72, -9, 144, 18); g.restore(); }
    grime(x, y, 128, 128, .25);
  }));
  // footprint of something enormous pressed into the asphalt (cells 10-11, toes point right)
  cell(256, 128, 256, 128, (x, y) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(x, y, 256, 128);
    const pad = (cx, cy, rx, ry, a) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, a, 0, 6.283); g.fill(); };
    g.fillStyle = '#1b1a18'; pad(x + 92, y + 64, 70, 46, 0); pad(x + 190, y + 26, 48, 15, -.35); pad(x + 204, y + 64, 50, 16, 0); pad(x + 190, y + 102, 48, 15, .35);
    g.fillStyle = '#2c2a26'; pad(x + 92, y + 64, 50, 30, 0);
    g.strokeStyle = 'rgba(8,8,8,.9)'; g.lineWidth = 2; g.beginPath();
    for (let k = 0; k < 16; k++) { const a = R() * 6.283; let X = x + 92 + Math.cos(a) * 60, Y = y + 64 + Math.sin(a) * 40; g.moveTo(X, Y); for (let s = 0; s < 4; s++) { X += Math.cos(a + rr(-.6, .6)) * 10; Y += Math.sin(a + rr(-.6, .6)) * 8; g.lineTo(X, Y); } }
    g.stroke();
  });
  cell(512, 128, 128, 128, (x, y) => {                                     // manhole
    g.clearRect(x, y, 128, 128); g.fillStyle = '#3d3630'; g.beginPath(); g.arc(x + 64, y + 64, 58, 0, 6.283); g.fill();
    g.strokeStyle = '#1e1b18'; g.lineWidth = 3; for (const r of [52, 36, 20]) { g.beginPath(); g.arc(x + 64, y + 64, r, 0, 6.283); g.stroke(); }
    g.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; g.moveTo(x + 64 + Math.cos(a) * 20, y + 64 + Math.sin(a) * 20); g.lineTo(x + 64 + Math.cos(a) * 52, y + 64 + Math.sin(a) * 52); } g.stroke();
    blob(g, x + 50, y + 70, 30, 'rgba(120,60,25,1)', .5);
  });
  cell(640, 128, 128, 128, (x, y) => {                                     // AC outdoor unit front
    g.fillStyle = '#cfcfc8'; g.fillRect(x, y, 128, 128); g.fillStyle = '#26282a'; g.beginPath(); g.arc(x + 50, y + 64, 44, 0, 6.283); g.fill();
    g.strokeStyle = '#8a8c8c'; g.lineWidth = 2; for (let r = 8; r < 44; r += 7) { g.beginPath(); g.arc(x + 50, y + 64, r, 0, 6.283); g.stroke(); }
    g.fillStyle = '#9fa19d'; for (let k = 0; k < 9; k++) g.fillRect(x + 102, y + 18 + k * 10, 18, 4); grime(x, y, 128, 128, .4);
  });
  cell(768, 128, 256, 128, (x, y) => {                                     // 止まれ + a white bar for edge lines
    g.clearRect(x, y, 256, 128); g.fillStyle = '#eeeeea'; g.font = `bold 92px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('止まれ', x + 128, y + 54, 244); g.fillRect(x, y + 114, 256, 14);
    g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 70; k++) blob(g, x + R() * 256, y + R() * 128, rr(3, 12), '#000', .8); g.globalCompositeOperation = 'source-over';
  });
  const VSIGN = [['喫茶', '#7a1f1a', '#f3ead8'], ['薬局', '#1d3f7a', '#ffffff'], ['たばこ', '#f1ede2', '#c0231d'], ['理容', '#12284a', '#f5f5f5'], ['酒', '#1f3a26', '#f0e6c8'],
    ['スナック', '#ff4fa8'], ['麻雀', '#39ff8a'], ['ホテル', '#5fb4ff']];
  VSIGN.forEach(([txt, bg, fg], i) => cell(i * 128, 256, 128, 384, (x, y) => {
    const neon = i >= 5, n = txt.length, fs = Math.min(96, 330 / n);
    g.fillStyle = neon ? '#0d0d10' : bg; g.fillRect(x, y, 128, 384);
    if (!neon) { g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 9, y + 9, 110, 366); }
    g.font = `bold ${fs}px ${neon ? JP : JM}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    [...txt].forEach((ch, k) => { const cy = y + 192 + (k - (n - 1) / 2) * fs * 1.05;
      if (neon) { g.shadowColor = bg; g.shadowBlur = 16; g.strokeStyle = bg; g.lineWidth = 7; g.strokeText(ch, x + 64, cy); g.shadowBlur = 0; g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeText(ch, x + 64, cy); }
      else { g.fillStyle = fg; g.fillText(ch, x + 64, cy); } });
    if (!neon) { g.fillStyle = 'rgba(210,205,190,.12)'; g.fillRect(x, y, 128, 384); grime(x, y, 128, 384, .35); }
  }));
  const hsign = (x, w, bg, fg, txt, font) => cell(x, 640, w, 128, (x, y) => {
    g.fillStyle = bg; g.fillRect(x, y, w, 128); g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x + w / 2, y + 66, w - 30);
    grime(x, y, w, 128, .3); });
  hsign(512, 256, '#f1efe6', '#1f4f9a', 'クリーニング', `bold 44px ${JP}`);
  hsign(768, 256, '#7c1d18', '#f6ecd6', '食堂', `bold 84px ${JM}`);
  cell(0, 640, 512, 128, (x, y) => {                                       // convenience store band (made-up name)
    g.fillStyle = '#f2f1ea'; g.fillRect(x, y, 512, 128); g.fillStyle = '#2f8a4a'; g.fillRect(x, y + 10, 512, 16); g.fillStyle = '#f07a2a'; g.fillRect(x, y + 102, 512, 14);
    g.fillStyle = '#2a7342'; g.font = `bold 62px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ヨロズマート', x + 282, y + 64, 420);
    grime(x + 40, y, 472, 128, .3); });
  [['#e6e6e0', '#1f5fae'], ['#b8332a', '#f0f0ea']].forEach(([body, acc], k) => cell(k * 128, 768, 128, 256, (x, y) => {   // vending machines
    g.fillStyle = body; g.fillRect(x, y, 128, 256); g.fillStyle = '#f7f7f0'; g.fillRect(x + 8, y + 10, 112, 118);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { g.fillStyle = hsl(R() * 360, 70, 50); g.fillRect(x + 12 + c * 18, y + 16 + r * 38, 12, 26); g.fillStyle = '#222'; g.fillRect(x + 13 + c * 18, y + 45 + r * 38, 10, 3); }
    g.fillStyle = acc; g.fillRect(x + 8, y + 136, 112, 60); g.fillStyle = body; g.font = `bold 20px ${JP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('つめた〜い', x + 64, y + 166, 104);
    g.fillStyle = '#151515'; g.fillRect(x + 16, y + 212, 96, 28); grime(x, y, 128, 256, .25); }));
  cell(256, 768, 128, 256, (x, y) => {                                     // wooden sliding door
    g.fillStyle = '#3a2a1c'; g.fillRect(x, y, 128, 256);
    for (const X of [x + 8, x + 66]) for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) { g.fillStyle = r === 4 ? '#4a3726' : '#1b2026'; g.fillRect(X + c * 27 + 2, y + 8 + r * 48, 23, 42); }
    grime(x, y, 128, 256, .3); });
  cell(384, 768, 128, 256, (x, y) => {                                     // steel door
    g.fillStyle = '#6b7275'; g.fillRect(x, y, 128, 256); g.fillStyle = '#5a6164'; g.fillRect(x + 10, y + 10, 108, 236);
    g.fillStyle = '#1b2026'; g.fillRect(x + 40, y + 40, 48, 60); g.fillStyle = '#c9c9c0'; g.fillRect(x + 100, y + 130, 10, 26); grime(x, y, 128, 256, .5); });
  cell(512, 768, 256, 256, (x, y) => {                                     // shop front: shelves behind dusty glass
    const gr = g.createLinearGradient(0, y, 0, y + 256); gr.addColorStop(0, '#f2f6f4'); gr.addColorStop(1, '#9aa39f'); g.fillStyle = gr; g.fillRect(x, y, 256, 256);
    for (let r = 0; r < 4; r++) { g.fillStyle = '#6d7572'; g.fillRect(x, y + 70 + r * 44, 256, 5);
      for (let c = 0; c < 22; c++) if (R() < .7) { g.fillStyle = hsl(R() * 360, 55, rr(40, 65)); g.fillRect(x + 4 + c * 11.5, y + 48 + r * 44, 8, 21); } }
    g.fillStyle = '#fff'; for (let c = 0; c < 3; c++) g.fillRect(x + 20 + c * 80, y + 12, 50, 6);
    g.fillStyle = 'rgba(30,32,30,.3)'; g.fillRect(x, y, 256, 256);
    g.fillStyle = '#e8d24a'; g.fillRect(x + 104, y + 150, 40, 30); g.fillStyle = '#d8443a'; g.fillRect(x + 20, y + 100, 34, 46);
    shards(x + 212, y + 180, 26);
    g.fillStyle = '#7d8385'; for (const X of [0, 84, 170, 250]) g.fillRect(x + X, y, 6, 256); g.fillRect(x, y, 256, 6); g.fillRect(x, y + 244, 256, 12);
    grime(x, y, 256, 256, .3); });
  for (let k = 0; k < 2; k++) cell((6 + k) * 128, 768, 128, 256, (x0, y0) => {   // hanging ivy (alpha)
    g.clearRect(x0, y0, 128, 256);
    const leaf = (x, y, s) => { g.fillStyle = hsl(rr(80, 125), rr(35, 60), rr(15, 36)); g.beginPath(); g.ellipse(x, y, s, s * .6, rr(0, 6.28), 0, 6.283); g.fill(); };
    for (let s = 0; s < 7; s++) { let x = x0 + 10 + R() * 108; const len = 256 * rr(.4, 1), pts = [];
      g.strokeStyle = '#3b3a22'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y0);
      for (let t = 0; t < len; t += 6) { x = clamp(x + rr(-2.5, 2.5), x0 + 6, x0 + 122); pts.push([x, y0 + t]); g.lineTo(x, y0 + t); } g.stroke();
      pts.forEach(([px, py], j) => { if (R() < .8) leaf(px + rr(-6, 6), py, rr(4, 8.5) * (1 - j / pts.length * .4)); }); }
    for (let i = 0; i < 70; i++) leaf(x0 + rr(4, 124), y0 + R() * R() * 70, rr(5, 9.5));
  });
  const VS = i => [i * 128, 256, 128, 384], WINR = k => [(k % 8) * 128, (k >> 3) * 128, 128, 128];
  const AC = [640, 128, 128, 128], BAR = [770, 242, 250, 12], STOP = [768, 128, 256, 110], FOOT = [256, 128, 256, 128], MANHOLE = [512, 128, 128, 128];
  const BAND = [0, 640, 512, 128], BANDPLAIN = [2, 640, 30, 128], CLEAN = [512, 640, 256, 128], SHOKUDO = [768, 640, 256, 128];
  const DOORW = [256, 768, 128, 256], DOORS = [384, 768, 128, 256], SHOP = [512, 768, 256, 256];

  /* ---------- geometry buffers (merged per material) ---------- */
  const mk = an => ({ p: [], n: [], u: [], c: [], a: [], i: [], vc: 0, an });
  const BODY = mk(1), DECO = mk(2), MOSSB = mk(0);
  let TM = new THREE.Matrix4(); const NM = new THREE.Matrix3();
  let ctx = { top: -99, moss: .5, inner: 0 };
  const setM = m => { TM = m; NM.getNormalMatrix(m); };
  const withM = (m, fn) => { const o = TM; setM(o.clone().multiply(m)); fn(); setM(o); };
  const M4 = () => new THREE.Matrix4(), tr = (x, y, z) => M4().makeTranslation(x, y, z);
  const _v = new V3(), _n = new V3(), _c = new THREE.Color(), _dc = new THREE.Color();
  const MOSSC = lin('#40602a'), DIRT = lin('#3b2d20');
  // weathering baked into BODY vertex colours: damp dark base, grime, rain streaks, moss on tops / upper edges / wall foot
  function weather(p, n, col) {
    const hs = p.y - soilY(p.x, p.z), gr = fbm(p.x * .21, p.y * .21, p.z * .21, 2);
    let k = (.8 + .45 * (gr + .5)) * lerp(.5, 1, sstep(-.2, 2.4, hs));
    if (Math.abs(n.y) < .6) k *= 1 - .45 * sstep(.05, .32, fbm((p.x + p.z) * 1.9, p.y * .07, 7.7, 2));
    if (ctx.inner) k *= .33;
    _c.copy(col).multiplyScalar(k);
    const m = n.y > .4 ? sstep(-.2, .15, fbm(p.x * .3, 3.3, p.z * .3, 2) + (n.y - .7) * .3)
      : Math.max(sstep(.9, 0, ctx.top - p.y), sstep(1.6, 0, hs)) * sstep(-.25, .1, fbm(p.x * .5, p.y * .5, p.z * .5, 2));
    return _c.lerp(DIRT, (1 - sstep(0, 1.2, hs)) * .5).lerp(MOSSC, clamp(m * ctx.moss, 0, .9));
  }
  function vert(b, x, y, z, nx, ny, nz, u, v, col, e0, e1) {
    _v.set(x, y, z).applyMatrix4(TM); _n.set(nx, ny, nz).applyMatrix3(NM).normalize();
    b.p.push(_v.x, _v.y, _v.z); b.n.push(_n.x, _n.y, _n.z); b.u.push(u, v);
    const c = b === BODY ? weather(_v, _n, col) : col; b.c.push(c.r, c.g, c.b);
    if (b.an > 0) b.a.push(e0 || 0); if (b.an > 1) b.a.push(e1 || 0);
    return b.vc++;
  }
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  // flat grid face: corner o, edges ex (u) and ey (v); outward normal = ex × ey.
  // O: tile, col, su/sv = cell size, keep(i,j,nu,nv) = drop cells (holes), bend(P,a,b) = move points, uo/vo = uv offset
  function face(o, ex, ey, O) {
    const lx = Math.hypot(...ex), ly = Math.hypot(...ey), n = new V3(...ex).cross(new V3(...ey)).normalize();
    const nu = Math.max(1, Math.round(lx / (O.su || 99))), nv = Math.max(1, Math.round(ly / (O.sv || O.su || 99)));
    const t = O.tile || 0, S = TS[t], u0 = O.uo != null ? O.uo : Math.floor(R() * 8) * .37, v0 = O.vo != null ? O.vo : o[1] / S, f = BODY.vc;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = i / nu, b = j / nv; let P = [o[0] + ex[0] * a + ey[0] * b, o[1] + ex[1] * a + ey[1] * b, o[2] + ex[2] * a + ey[2] * b];
      if (O.bend) P = O.bend(P, a, b);
      vert(BODY, P[0], P[1], P[2], n.x, n.y, n.z, u0 + a * lx / S, v0 + b * ly / S, O.col, t);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (!O.keep || O.keep(i, j, nu, nv)) { const q = f + j * (nu + 1) + i; BODY.i.push(q, q + 1, q + nu + 2, q, q + nu + 2, q + nu + 1); }
    return { nu, nv, n };
  }
  // thick broken wall/slab: outer face, dark inner face, and caps on every broken edge
  function wall(o, ex, ey, t, O) {
    const k = O.keep || (() => true), { nu, nv, n } = face(o, ex, ey, O), din = [-n.x * t, -n.y * t, -n.z * t];
    ctx.inner = 1; face(add(add(o, ex), din), sc(ex, -1), ey, Object.assign({}, O, { keep: (i, j) => k(nu - 1 - i, j, nu, nv) })); ctx.inner = 0;
    const cu = sc(ex, 1 / nu), cv = sc(ey, 1 / nv), cap = { col: O.col, uo: 0 };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) if (k(i, j, nu, nv)) {
      const P = add(add(o, sc(ex, i / nu)), sc(ey, j / nv));
      if (j === nv - 1 || !k(i, j + 1, nu, nv)) face(add(P, cv), cu, din, cap);
      if (j > 0 && !k(i, j - 1, nu, nv)) face(add(P, cu), sc(cu, -1), din, cap);
      if (i === nu - 1 || !k(i + 1, j, nu, nv)) face(add(P, cu), din, cv, cap);
      if (i === 0 || !k(i - 1, j, nu, nv)) face(P, cv, din, cap);
    }
  }
  // box standing on (x, y, z); O.nb = no bottom face
  function box(x, y, z, sx, sy, sz, O) {
    const a = x - sx / 2, b = x + sx / 2, c = z - sz / 2, d = z + sz / 2, t = y + sy;
    face([a, y, d], [sx, 0, 0], [0, sy, 0], O); face([b, y, c], [-sx, 0, 0], [0, sy, 0], O);
    face([b, y, d], [0, 0, -sz], [0, sy, 0], O); face([a, y, c], [0, 0, sz], [0, sy, 0], O);
    face([a, t, d], [sx, 0, 0], [0, 0, -sz], O); if (!O.nb) face([a, y, c], [sx, 0, 0], [0, 0, sz], O);
  }
  function tri(A, B, C, O) {
    const n = new V3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).cross(new V3(C[0] - A[0], C[1] - A[1], C[2] - A[2])).normalize(), S = TS[O.tile || 0], f = BODY.vc, ax = Math.abs(n.x) > Math.abs(n.z);
    [A, B, C].forEach(P => vert(BODY, P[0], P[1], P[2], n.x, n.y, n.z, (ax ? P[2] : P[0]) / S, P[1] / S, O.col, O.tile || 0));
    BODY.i.push(f, f + 1, f + 2);
  }
  // upright cylinder (optional top radius r2) with a top cap
  function cyl(x, y, z, r, h, sides, O, r2) {
    r2 = r2 == null ? r : r2; const f = BODY.vc, S = TS[O.tile || 0], t = O.tile || 0;
    for (let k = 0; k <= sides; k++) { const a = k / sides * 6.283, cx = Math.cos(a), sz = Math.sin(a), u = a * r / S;
      vert(BODY, x + cx * r, y, z + sz * r, cx, 0, sz, u, 0, O.col, t); vert(BODY, x + cx * r2, y + h, z + sz * r2, cx, 0, sz, u, h / S, O.col, t); }
    for (let k = 0; k < sides; k++) { const q = f + k * 2; BODY.i.push(q, q + 3, q + 2, q, q + 1, q + 3); }
    const c = vert(BODY, x, y + h, z, 0, 1, 0, 0, 0, O.col, t);
    for (let k = 0; k <= sides; k++) { const a = k / sides * 6.283; vert(BODY, x + Math.cos(a) * r2, y + h, z + Math.sin(a) * r2, 0, 1, 0, Math.cos(a) * r2 / S, Math.sin(a) * r2 / S, O.col, t); }
    for (let k = 0; k < sides; k++) BODY.i.push(c, c + 2 + k, c + 1 + k);
  }
  // 4-sided tube along a polyline (wires, rebar)
  function tube(pts, r, col) {
    const f = BODY.vc, m = pts.length;
    pts.forEach((p, k) => { const d = new V3().subVectors(pts[Math.min(k + 1, m - 1)], pts[Math.max(k - 1, 0)]).normalize();
      const s = Math.abs(d.y) > .9 ? new V3(1, 0, 0) : new V3().crossVectors(d, UP).normalize(), u = new V3().crossVectors(s, d);
      for (let e = 0; e < 4; e++) { const a = e * Math.PI / 2, nx = s.x * Math.cos(a) + u.x * Math.sin(a), ny = s.y * Math.cos(a) + u.y * Math.sin(a), nz = s.z * Math.cos(a) + u.z * Math.sin(a);
        vert(BODY, p.x + nx * r, p.y + ny * r, p.z + nz * r, nx, ny, nz, e * .25, k * .3, col, 0); } });
    for (let k = 0; k < m - 1; k++) for (let e = 0; e < 4; e++) { const a = f + k * 4 + e, b = f + k * 4 + (e + 1) % 4; BODY.i.push(a, b + 4, b, a, a + 4, b + 4); }
  }
  // lumpy flattened ellipsoid: moss cushions and rubble mounds
  const ICO = welded(new THREE.IcosahedronGeometry(1, 1)), IP = ICO.attributes.position, II = ICO.index.array;
  function lump(b, x, y, z, sx, sy, sz, col, tile) {
    const f = b.vc, sd = R() * 50;
    for (let i = 0; i < IP.count; i++) { let px = IP.getX(i), py = IP.getY(i), pz = IP.getZ(i); const k = 1 + .3 * PERLIN.noise(px * 1.9 + sd, py * 1.9, pz * 1.9);
      px *= k; pz *= k; py = py < 0 ? py * .25 : py * k;
      const nx = px / sx, ny = py / sy, nz = pz / sz, nl = Math.hypot(nx, ny, nz) || 1, wx = x + px * sx, wy = y + py * sy, wz = z + pz * sz;
      vert(b, wx, wy, wz, nx / nl, ny / nl, nz / nl, (wx + wz * .5) / 2.5, (wy + wz * .5) / 2.5, col, tile || 0); }
    for (const i of II) b.i.push(f + i);
  }
  // DECO quad from atlas rect r (pixels); glow = night emission, fl = flicker phase (>1 = faulty tube)
  function decal(o, ex, ey, r, glow, fl, flip) {
    const n = new V3(...ex).cross(new V3(...ey)).normalize().multiplyScalar(.035), f = DECO.vc;
    let u0 = (r[0] + 1.5) / 1024, u1 = (r[0] + r[2] - 1.5) / 1024; const vt = (r[1] + 1.5) / 1024, vb = (r[1] + r[3] - 1.5) / 1024;
    if (flip) [u0, u1] = [u1, u0];
    _dc.setScalar(rr(.72, 1));
    [[0, 0, u0, vb], [1, 0, u1, vb], [1, 1, u1, vt], [0, 1, u0, vt]].forEach(([a, b, u, v]) =>
      vert(DECO, o[0] + ex[0] * a + ey[0] * b + n.x, o[1] + ex[1] * a + ey[1] * b + n.y, o[2] + ex[2] * a + ey[2] * b + n.z, n.x, n.y, n.z, u, v, _dc, glow || 0, fl || 0));
    DECO.i.push(f, f + 1, f + 2, f, f + 2, f + 3);
  }
  const MC = () => new THREE.Color().setHSL(rr(.2, .27), rr(.35, .55), rr(.36, .52)).convertSRGBToLinear().multiplyScalar(1.5);
  function mossAlong(A, B, y, dens, s) {                        // cushions along a ledge from A to B ([x, z] local)
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let t = R() * .8; t < len; t += rr(.5, 1.4)) if (R() < dens) { const k = t / len, q = (s || .5) * rr(.5, 1.3);
      lump(MOSSB, lerp(A[0], B[0], k) + rr(-.12, .12), y, lerp(A[1], B[1], k) + rr(-.12, .12), q * rr(1, 1.8), q * rr(.35, .6), q * rr(1, 1.5), MC()); }
  }
  const mossRect = (w, d, y, dens, s, i) => { i = i || .15; const X = w / 2 - i, Z = d / 2 - i;
    mossAlong([-X, Z], [X, Z], y, dens, s); mossAlong([-X, -Z], [X, -Z], y, dens * .6, s); mossAlong([X, Z], [X, -Z], y, dens, s); mossAlong([-X, Z], [-X, -Z], y, dens, s); };

  /* ---------- wall-side helpers: a side = corner o, rightward r, outward f, length L ---------- */
  const sides = (w, d) => ({ F: { o: [-w / 2, 0, d / 2], r: [1, 0, 0], f: [0, 0, 1], L: w }, R: { o: [w / 2, 0, d / 2], r: [0, 0, -1], f: [1, 0, 0], L: d },
    B: { o: [w / 2, 0, -d / 2], r: [-1, 0, 0], f: [0, 0, -1], L: w }, Lf: { o: [-w / 2, 0, -d / 2], r: [0, 0, 1], f: [-1, 0, 0], L: d } });
  const at = (S, a, y, off) => [S.o[0] + S.r[0] * a + S.f[0] * off, y, S.o[2] + S.r[2] * a + S.f[2] * off];
  const onWall = (S, a, y, w, h, r, glow, fl, off, flip) => decal(at(S, a - w / 2, y, off || 0), [S.r[0] * w, 0, S.r[2] * w], [0, h, 0], r, glow, fl, flip);
  const wallBox = (S, a, y, sw, sh, so, O, off) => { const c = at(S, a, y, (off || 0) + so / 2), ax = S.r[0] !== 0; box(c[0], y, c[2], ax ? sw : so, sh, ax ? so : sw, O); };
  const sideFace = (S, y0, h, O) => face(at(S, 0, y0, 0), [S.r[0] * S.L, 0, S.r[2] * S.L], [0, h, 0], O);

  const GREY = lin('#8a8984'), ROOFC = lin('#77756e'), SHUTBOX = lin('#77736a'), FRAME = lin('#2c2b29'), TANKC = lin('#c9c6bb'), DARKM = lin('#3a3936');
  const ACC = lin('#d6d4cc'), WIRE = lin('#1c1c1c'), POLEC = lin('#9d9b94'), WOODC = lin('#caa888'), RUST = lin('#6a4128');
  const WSTY = { sash: [0, 0, 1, 1, 1, 2, 6, 9, 8, 8, 4, 7], shoji: [3, 3, 3, 3, 9, 4, 0, 8], office: [5, 5, 5, 0, 0, 2, 9, 7], ruin: [2, 9, 9, 4, 6] };
  const LIT = { 1: 1, 3: 1, 5: 1, 7: 1, 8: 1 };
  function windowAt(S, a, y, w, h, sty, sill) {
    const k = pick(WSTY[sty]), lit = LIT[k] && R() < .5;
    onWall(S, a, y, w, h, WINR(k), lit ? rr(1.3, 2.6) : 0, 0, 0, R() < .5);
    if (sill !== false) wallBox(S, a, y - .14, w + .3, .14, .26, { col: GREY, nb: 1 });
  }
  const windowRow = (S, y, n, ww, hh, sty, m) => { for (let k = 0; k < n; k++) windowAt(S, m + (S.L - 2 * m) * (k + .5) / n, y, ww, hh, sty); };
  function acUnit(S, a, y) { wallBox(S, a, y, .95, .68, .34, { col: ACC }); onWall(S, a, y + .04, .86, .6, AC, 0, 0, .34); if (R() < .5) { const c = at(S, a, y + .68, .17); lump(MOSSB, c[0], c[1], c[2], .4, .14, .3, MC()); } }
  function roofAC(x, y, z) { box(x, y, z, .95, .68, .36, { col: ACC, nb: 1 }); decal([x - .43, y + .04, z + .18], [.86, 0, 0], [0, .6, 0], AC); }
  function vines(S, n, yTop, len0, off) {
    for (let k = 0; k < n; k++) { const w = rr(1, 2.2), h = rr(.35, 1) * len0; onWall(S, rr(w / 2, S.L - w / 2), yTop - h, w, h, [(6 + (R() < .5)) * 128, 768, 128, 256], 0, 0, (off || 0) + .06, R() < .5); }
  }
  function ledge(w, d, y, col) { box(0, y, 0, w + .36, .24, d + .36, { col: col.clone().multiplyScalar(.9), su: 2 }); mossAlong([-w / 2, d / 2 + .05], [w / 2, d / 2 + .05], y + .24, .3, .35); }
  function parapet(w, d, top, h, col) { const t = .3, O = { col, nb: 1, su: 1.5 };
    box(0, top, d / 2 - t / 2, w, h, t, O); box(0, top, -d / 2 + t / 2, w, h, t, O); box(w / 2 - t / 2, top, 0, t, h, d - 2 * t, O); box(-w / 2 + t / 2, top, 0, t, h, d - 2 * t, O);
    mossRect(w, d, top + h, .6, .55);
  }
  // flat-roofed box shell
  function block(S, w, d, top, O) { for (const k in S) sideFace(S[k], 0, top, Object.assign({ su: .8, sv: 1.2 }, O)); face([-w / 2, top, d / 2], [w, 0, 0], [0, 0, -d], { col: ROOFC, su: 1.5 }); }
  function shutter(S, a, w, g0, col) { face(at(S, a - w / 2, g0, .06), [S.r[0] * w, 0, S.r[2] * w], [0, 2.7, 0], { tile: T.SHUT, col, su: 1, sv: 1, vo: 0 }); wallBox(S, a, g0 + 2.7, w + .3, .5, .45, { col: SHUTBOX }); }
  function awning(w, d, y, col) { const x0 = -w / 2 + .3, L = w - .6, D = 1.5, dy = .55;
    face([x0, y - dy, d / 2 + D], [L, 0, 0], [0, dy, -D], { tile: T.CORR, col, su: 1.2 }); face([x0 + L, y - dy - .03, d / 2 + D], [-L, 0, 0], [0, dy, -D], { tile: T.CORR, col: col.clone().multiplyScalar(.5) });
    mossAlong([x0, d / 2 + .5], [x0 + L, d / 2 + .5], y - .2, .45, .45); }
  // sign board sticking out from the wall, readable from both sides (vertical text)
  function projSign(S, a, y, h, i, glow, fl) {
    const out = 1.25, t = .2, c = at(S, a, y, out / 2), ax = S.r[0] !== 0, p0 = at(S, a, y, 0), f = S.f, r = S.r;
    box(c[0], y, c[2], ax ? t : out, h, ax ? out : t, { col: FRAME });
    decal([p0[0] + r[0] * t / 2 + f[0] * out, y + .06, p0[2] + r[2] * t / 2 + f[2] * out], [-f[0] * out, 0, -f[2] * out], [0, h - .12, 0], VS(i), glow, fl);
    decal([p0[0] - r[0] * t / 2, y + .06, p0[2] - r[2] * t / 2], [f[0] * out, 0, f[2] * out], [0, h - .12, 0], VS(i), glow, fl);
  }
  function roofSign(x, y, z, w, h, rect, glow) {
    for (const s of [-1, 1]) box(x + s * w * .35, y, z - .1, .14, 1, .14, { col: FRAME, nb: 1 });
    box(x, y + .9, z, w + .2, h + .2, .16, { col: FRAME }); decal([x - w / 2, y + 1, z + .08], [w, 0, 0], [0, h, 0], rect, glow * 2.2, .43);
  }
  function tank(x, y, z, r, h) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(x + dx * r * .6, y, z + dz * r * .6, .14, 1.3, .14, { col: DARKM, nb: 1 });
    box(x, y + 1.2, z, r * 1.8, .12, r * 1.8, { col: DARKM });
    cyl(x, y + 1.32, z, r, h, 12, { tile: T.PLAST, col: TANKC }); cyl(x, y + 1.32 + h, z, r, .35, 12, { tile: T.PLAST, col: TANKC }, r * .2);
    lump(MOSSB, x, y + 1.32 + h + .2, z, r * .6, .12, r * .5, MC());
  }
  const props = [], buildings = [], meshes = [], anchors = [];
  const worldOf = (x, y, z) => new V3(x, y, z).applyMatrix4(TM);
  function vending(S, a, g0, k) {
    wallBox(S, a, g0, 1.1, 1.85, .8, { col: lin(pick(['#d8d8d2', '#b8332a', '#2f5d9a'])) }); onWall(S, a, g0 + .05, 1, 1.75, [k * 128, 768, 128, 256], 3, 0, .8);
    const c = at(S, a, g0, .4), p = worldOf(c[0], 0, c[2]); props.push({ x: p.x, z: p.z, r: .8 });
  }

  /* ---------- building kinds (local frame: front = +z, y = 0 at the sunk base, g = ground floor level) ---------- */
  const KIND = {
    row(D, w, d, g, S) {                        // narrow shop-house: shutter + awning, window rows, protruding signs
      const n = D.f, top = g + 3.6 + (n - 1) * 3.1, col = lin(D.col);
      D.h = top + .9 - g; ctx.top = D.base + top + .9;
      block(S, w, d, top, { tile: D.tile, col }); parapet(w, d, top, .9, col);
      for (let k = 1; k < n; k++) ledge(w, d, g + 3.6 + (k - 1) * 3.1 - .12, col);
      const shc = lin(pick(['#8a8e90', '#9a7a5a', '#6f8490']));
      if (D.flat) { shutter(S.F, w * .36, w * .56, g, shc); onWall(S.F, w * .8, g, 1.2, 2.3, DOORS); vending(S.F, w - .65, g, 1); }
      else { shutter(S.F, w / 2, w - 1.2, g, shc); awning(w, d, g + 3.3, lin(pick(['#9c3b30', '#3f6b52', '#355a86', '#a0782c']))); }
      for (let k = 1; k < n; k++) { const y = g + 3.6 + (k - 1) * 3.1 + .8;
        windowRow(S.F, y, Math.max(1, Math.round((w - 1.5) / 2.7)), 1.55, 1.45, 'sash', .9);
        for (const s of [S.R, S.Lf]) if (R() < .45) windowAt(s, rr(2, d - 2), y, 1.1, 1.2, 'sash');
        if (R() < .7) acUnit(pick([S.R, S.Lf]), rr(1.5, d - 1.5), y - .3); }
      if (D.neon != null) projSign(S.F, w - .45, g + 3.9, Math.min(3.1 * (n - 1) - .6, 4.4), D.neon, 5.5, D.fl);
      if (D.sign != null) projSign(S.F, .45, g + 3.9, 3.4, D.sign, 0, 0);
      if (D.hsign) roofSign(0, top + .9, d / 2 - .8, 3.4, 1.7, D.hsign, 1);
      if (D.tank) tank(w * .22, top, -d * .15, 1.1, 2); else roofAC(-w * .2, top, -d * .2);
      vines(S.F, 1 + (R() * 3 | 0), top + .9, 3.1 * n * .7); vines(S.R, 1 + (R() * 2 | 0), top + .9, 3.1 * n * .8); vines(S.Lf, 1 + (R() * 2 | 0), top + .9, 3.1 * n * .8);
      D.anchor = [rr(-w / 3, w / 3), top - 1.2, d / 2];
    },
    office(D, w, d, g, S) {                     // small office block: window grid, cornices, rooftop penthouse, tank and billboard
      const n = D.f, fh = 3.3, top = g + 3.8 + (n - 1) * fh, col = lin(D.col);
      D.h = top + 3.5 - g; ctx.top = D.base + top + 1;
      block(S, w, d, top, { tile: D.tile, col }); parapet(w, d, top, 1, col.clone().multiplyScalar(.85));
      for (let k = 1; k < n; k++) { const y = g + 3.8 + (k - 1) * fh; ledge(w, d, y - .15, col);
        windowRow(S.F, y + .75, Math.round(w / 2.3), 1.7, 1.6, 'office', .5); for (const s of [S.R, S.Lf]) windowRow(s, y + .75, Math.round(d / 2.8), 1.5, 1.6, 'office', .7); }
      onWall(S.F, w * .34, g + .05, 4.2, 2.6, SHOP, 1.2, 0, .02); shutter(S.F, w * .8, 3, g, lin('#7d8288'));
      if (D.sign != null) projSign(S.F, .45, g + 4.4, 5.6, D.sign, 0, 0);
      box(-w / 4, top, -d / 4, 3.4, 2.6, 3.2, { col, su: 1.2 }); decal([-w / 4 - .45, top, -d / 4 + 1.6], [.9, 0, 0], [0, 2, 0], DOORS);
      tank(w / 4, top, -d / 5, 1.1, 2.1); roofAC(w * .3, top, d * .15); roofSign(-w * .1, top + 1, d / 2 - .9, 5, 1.7, CLEAN, 1);
      vines(S.R, 3, top + 1, 12); vines(S.Lf, 2, top + 1, 10); vines(S.F, 2, top + 1, 7);
      D.anchor = [w * .3, g + 5.5, d / 2];
    },
    mansion(D, w, d, g, S) {                    // apartment block with balcony bands (the tallest)
      const n = D.f, top = g + 3.4 + (n - 1) * 2.9, col = lin(D.col);
      D.h = top + 1.1 + 2.6 - g; ctx.top = D.base + top + 1.1;
      block(S, w, d, top, { tile: T.PLAST, col }); parapet(w, d, top, 1.1, col);
      for (let k = 1; k < n; k++) { const y = g + 3.4 + (k - 1) * 2.9;
        box(0, y - .2, d / 2 + .7, w - .1, .2, 1.4, { col, su: 2 }); box(0, y, d / 2 + 1.33, w - .1, 1, .14, { col, su: 1.5 });
        for (const s of [-1, 1]) box(s * (w / 2 - .12), y, d / 2 + .7, .14, 1, 1.26, { col, nb: 1 });
        mossAlong([-w / 2 + .3, d / 2 + 1.33], [w / 2 - .3, d / 2 + 1.33], y + 1, .35, .3);
        windowAt(S.F, w * .28, y + .12, 2.5, 2.2, 'sash', false); windowAt(S.F, w * .72, y + .12, 2.5, 2.2, 'sash', false);
        if (R() < .6) box(pick([-1, 1]) * w * .42, y, d / 2 + .4, .8, .6, .32, { col: ACC });
        for (const s of [S.R, S.Lf]) windowAt(s, d * .35, y + 1, 1, 1, 'sash'); }
      onWall(S.F, w * .3, g, 1.3, 2.4, DOORS); shutter(S.F, w * .7, 4, g, lin('#6f7479'));
      box(w * .2, top, -d * .1, 3, 2.6, 3.2, { col, su: 1.2 });
      box(-w * .25, top, -d * .15, 2.8, .4, 2.4, { col: DARKM }); box(-w * .25, top + .4, -d * .15, 2.6, 1.8, 2.2, { tile: T.TILE, col: lin('#a9c0c6') });
      vines(S.F, 3, top + 1.1, 11, 1.4); vines(S.R, 2, top + 1.1, 14); vines(S.Lf, 2, top + 1.1, 9);
      D.anchor = [-w * .3, g + 2.6, d / 2];
    },
    store(D, w, d, g, S) {                      // corner shop / convenience store, flat above
      const top = g + 6.9, col = lin(D.col);
      D.h = top + .8 - g; ctx.top = D.base + top + .8;
      block(S, w, d, top, { tile: T.TILE, col }); parapet(w, d, top, .8, col);
      onWall(S.F, 2.9, g + .05, 4.2, 2.75, SHOP, 2.6, 0, .02); onWall(S.F, 7.1, g + .05, 4.2, 2.75, SHOP, 2.6, 0, .02, true);
      onWall(S.F, w - 1.3, g, 1.2, 2.3, DOORS);
      onWall(S.F, w / 2, g + 2.95, w - .4, 1.05, BANDPLAIN, 3, 0, .05); onWall(S.F, w / 2 + .3, g + 2.95, 4.2, 1.05, BAND, 3, .23, .08);
      box(0, g + 4, d / 2 + .45, w + .2, .18, .9, { col: GREY }); mossAlong([-w / 2, d / 2 + .6], [w / 2, d / 2 + .6], g + 4.18, .4, .35);
      windowRow(S.F, g + 4.8, 3, 1.6, 1.4, 'sash', 1);
      for (const s of [S.R, S.Lf]) windowRow(s, g + 4.8, 2, 1.5, 1.3, 'sash', 3);
      vending(S.Lf, d - 1, g, 0); vending(S.Lf, d - 2.25, g, 1); acUnit(S.R, d * .4, g + 1.2); projSign(S.Lf, d * .45, g + 3.9, 3, 2, 0, 0);
      roofAC(-w * .3, top, 0); roofAC(0, top, -d * .2); roofAC(w * .25, top, -d * .3);
      vines(S.R, 3, top + .8, 6); vines(S.B, 2, top + .8, 6);
      D.anchor = [-w * .3, g + 5.8, d / 2];
    },
    shed(D, w, d, g, S) {                       // low corrugated shed with a lean-to roof: a stepping stone
      const top = g + D.hh, col = lin(D.col);
      D.h = top + .9 - g; ctx.top = D.base + top;
      for (const k in S) sideFace(S[k], 0, top, { tile: T.CORR, col, su: 1.2, sv: 1.2 });
      tri([w / 2, top, d / 2], [w / 2, top, -d / 2], [w / 2, top + .9, -d / 2], { tile: T.CORR, col }); tri([-w / 2, top, -d / 2], [-w / 2, top, d / 2], [-w / 2, top + .9, -d / 2], { tile: T.CORR, col });
      box(0, top, -d / 2 + .05, w, .9, .1, { tile: T.CORR, col, nb: 1 });
      const rc = lin('#8a6a52'), O = { tile: T.CORR, col: rc, su: 1.2, vo: 0 };
      face([-w / 2 - .4, top - .1, d / 2 + .5], [w + .8, 0, 0], [0, 1.2, -d - .6], O); face([w / 2 + .4, top - .13, d / 2 + .5], [-w - .8, 0, 0], [0, 1.2, -d - .6], { tile: T.CORR, col: rc.clone().multiplyScalar(.5) });
      shutter(S.F, w / 2, w * .6, g, lin('#8a7a62'));
      mossAlong([-w / 2, d / 2 + .3], [w / 2, d / 2 + .3], top, .6, .5);
      for (let k = 0; k < 3; k++) lump(MOSSB, rr(-w / 3, w / 3), top + .5, rr(-d / 3, d / 3), rr(.8, 1.6), .15, rr(.8, 1.4), MC());
      vines(S.R, 2, top, 3); vines(S.Lf, 2, top, 3);
    },
    wood(D, w, d, g, S) {                       // wooden house with a kawara gable roof (D.caved = the roof has fallen in)
      const eave = g + 5.6, pitch = .5, rise = d / 2 * pitch, ridge = eave + rise, ov = .8, col = lin(D.col), kaw = lin(D.kaw), dark = lin('#4a3a2c');
      D.h = ridge + .5 - g; ctx.top = D.base + eave;
      const lowO = { tile: T.WOOD, col: WOODC, su: .8, sv: 1.2 }, upO = { tile: T.PLAST, col, su: .8, sv: 1.2 };
      for (const k in S) { const s = S[k], ex = [s.r[0] * s.L, 0, s.r[2] * s.L];
        if (D.caved) { wall(s.o, ex, [0, g + 2.8, 0], .25, lowO); wall(at(s, 0, g + 2.8, 0), ex, [0, eave - g - 2.8, 0], .25, upO); }
        else { sideFace(s, 0, g + 2.8, lowO); sideFace(s, g + 2.8, eave - g - 2.8, upO); } }
      box(0, g + 2.72, 0, w + .16, .14, d + .16, { col: dark });
      tri([w / 2, eave, d / 2], [w / 2, eave, -d / 2], [w / 2, ridge, 0], upO); tri([-w / 2, eave, -d / 2], [-w / 2, eave, d / 2], [-w / 2, ridge, 0], upO);
      // roof planes: kawara on top, dark boards underneath; a caved roof loses a ragged hole and sags around it
      const Lx = w + 2 * ov, Ls = Math.hypot(rise + ov * pitch, d / 2 + ov), y0 = eave - ov * pitch + .12, hs = [.56, .55];
      const hole = D.caved ? (i, j, nu, nv) => Math.hypot(((i + .5) / nu - hs[0]) * Lx, ((j + .5) / nv - hs[1]) * Ls * 1.2) > 2.6 * (1 + .5 * (hash(i, j) - .5)) : null;
      const sag = D.caved ? (P, a, b) => { P[1] -= 1.5 * sstep(4.6, .8, Math.hypot((a - hs[0]) * Lx, (b - hs[1]) * Ls)); return P; } : null;
      const back = D.caved ? (P, a, b) => { P[1] -= .6 * sstep(1, 0, Math.abs(a - .44) * 2.2) * b; return P; } : null;
      const topO = { tile: T.KAWARA, col: kaw, su: D.caved ? .7 : 1.3, vo: 0 };
      face([-w / 2 - ov, y0, d / 2 + ov], [Lx, 0, 0], [0, ridge + .12 - y0, -(d / 2 + ov)], Object.assign({ keep: hole, bend: sag }, topO));
      face([w / 2 + ov, y0 - .2, d / 2 + ov], [-Lx, 0, 0], [0, ridge + .12 - y0, -(d / 2 + ov)], { tile: T.WOOD, col: dark, su: topO.su, keep: hole ? (i, j, nu, nv) => hole(nu - 1 - i, j, nu, nv) : null,
        bend: sag ? (P, a, b) => sag(P, 1 - a, b) : null });
      face([w / 2 + ov, y0, -d / 2 - ov], [-Lx, 0, 0], [0, ridge + .12 - y0, d / 2 + ov], Object.assign({ bend: back ? (P, a, b) => back(P, 1 - a, b) : null }, topO));
      face([-w / 2 - ov, y0 - .2, -d / 2 - ov], [Lx, 0, 0], [0, ridge + .12 - y0, d / 2 + ov], { tile: T.WOOD, col: dark, su: topO.su, bend: back });
      const rcol = kaw.clone().multiplyScalar(.7), RO = { tile: T.KAWARA, col: rcol };
      if (D.caved) {
        withM(tr(-w / 2 - ov, ridge, 0).multiply(M4().makeRotationZ(-.1)), () => box(w * .27, 0, 0, w * .55, .42, .55, RO));
        withM(tr(w / 2 + ov, ridge, 0).multiply(M4().makeRotationZ(.12)), () => box(-w * .15, 0, 0, w * .3, .42, .55, RO));
        ctx.inner = 1; face([-w / 2 + .25, g + 2.9, d / 2 - .25], [w - .5, 0, 0], [0, 0, -(d - .5)], { tile: T.WOOD, col: dark, su: 2 });
        for (let k = 0; k < 7; k++) withM(tr(rr(-1.8, 2.4), g + 3 + rr(0, 2.2), rr(-.5, 2.8)).multiply(M4().makeRotationFromEuler(new THREE.Euler(rr(-.9, .9), rr(0, 6), rr(-.9, .9)))),
          () => box(0, 0, 0, .22, .22, rr(2.2, 4.5), { tile: T.WOOD, col: dark }));
        for (let k = 0; k < 16; k++) withM(tr(rr(-2.5, 3), g + 2.9, rr(-2, 3)).multiply(M4().makeRotationY(rr(0, 6))), () => box(0, 0, 0, rr(.5, 1), rr(.1, .3), rr(.4, .8), RO));
        ctx.inner = 0;
        for (let k = 0; k < 8; k++) lump(MOSSB, rr(-2, 3), g + 3.1, rr(-2, 2.5), rr(.4, .9), .2, rr(.4, .9), MC());
      } else { box(0, ridge - .05, 0, Lx + .1, .42, .55, RO); for (const s of [-1, 1]) box(s * (Lx / 2 + .05), ridge - .1, 0, .5, .75, .7, RO); }
      mossAlong([-w / 2, 0], [w / 2, 0], ridge + .3, D.caved ? .4 : .8, .6);
      mossAlong([-w / 2 - ov, d / 2 + ov - .3], [w / 2 + ov, d / 2 + ov - .3], y0 + .1, .45, .45); mossAlong([-w / 2 - ov, -d / 2 - ov + .3], [w / 2 + ov, -d / 2 - ov + .3], y0 + .1, .45, .45);
      // small eave over the ground floor
      face([-w / 2, g + 2.75, d / 2 + 1.1], [w, 0, 0], [0, .5, -1.1], { tile: T.KAWARA, col: kaw, vo: 0 }); face([w / 2, g + 2.72, d / 2 + 1.1], [-w, 0, 0], [0, .5, -1.1], { tile: T.WOOD, col: dark });
      mossAlong([-w / 2, d / 2 + .5], [w / 2, d / 2 + .5], g + 3, .5, .4);
      onWall(S.F, w * .25, g, 1.8, 2.3, DOORW); windowAt(S.F, w * .66, g + .9, 1.9, 1.15, 'shoji');
      windowAt(S.F, w * .3, g + 3.5, 1.8, 1.25, 'shoji'); windowAt(S.F, w * .72, g + 3.5, 1.8, 1.25, 'shoji');
      for (const s of [S.R, S.Lf]) { windowAt(s, d / 2, g + 3.5, 1.3, 1.1, 'shoji'); if (R() < .5) windowAt(s, d * .3, g + 1, 1.3, 1.1, 'shoji'); }
      acUnit(pick([S.R, S.Lf]), d * .7, g + 1.1);
      if (D.sign != null) projSign(S.F, w - .45, g + 3.1, 2.8, D.sign, 0, 0);
      if (D.hsign) onWall(S.F, w * .66, g + 2.05, 2.4, 1.05, D.hsign, 1.8, 0, .05);
      vines(S.R, 2, eave, 5); vines(S.Lf, 2, eave, 5); vines(S.F, 1, eave, 3);
      D.anchor = [w * .1, eave - .7, d / 2];
    },
    ruin(D, w, d, g, S) {                       // half-collapsed 4-storey block with a rubble slope spilling into the street
      const col = lin(D.col), H = g + 14.5, t = .35, rc = lin('#7f7b72');
      D.h = 14.5; ctx.top = D.base + g + 3;
      const Hf = (x, z) => g + 2 + 12.5 * clamp(1 - .8 * (x / w + .5) - .55 * (z / d + .5), 0, 1) + fbm(x * .4, z * .4, 9.3, 2) * 3;
      const bite = (x, y, z) => Math.hypot(x - w * .1, (y - g - 3) * .8, z - d / 2) < 3.2;
      const standing = (x, y, z, j) => y < Hf(x, z) + j && !bite(x, y, z);
      Object.keys(S).forEach((key, si) => { const s = S[key], len = s.L;
        wall(s.o, [s.r[0] * len, 0, s.r[2] * len], [0, H, 0], t, { tile: T.CONC, col, su: .7, sv: .7, keep: (i, j, nu, nv) => {
          const a = (i + .5) / nu * len, y = (j + .5) / nv * H; return standing(s.o[0] + s.r[0] * a, y, s.o[2] + s.r[2] * a, (hash(i + si * 17, j) - .5) * 1.6); } });
        if (key !== 'B') for (let k = 0; k < 4; k++) for (let q = 0; q < 3; q++) { const a = len * (q + .5) / 3, y = g + k * 3.4 + 1, x = s.o[0] + s.r[0] * a, z = s.o[2] + s.r[2] * a;
          if (standing(x, y + 1.8, z, 0) && standing(x - 1, y, z, 0) && standing(x + 1, y, z, 0)) windowAt(s, a, y, 1.5, 1.4, 'ruin', false); } });
      for (let k = 1; k <= 3; k++) { const y = g + k * 3.4;
        wall([-w / 2 + t, y, d / 2 - t], [w - 2 * t, 0, 0], [0, 0, -(d - 2 * t)], .3, { col, su: .8, sv: .8, keep: (i, j, nu, nv) => {
          const x = -w / 2 + t + (i + .5) / nu * (w - 2 * t), z = d / 2 - t - (j + .5) / nv * (d - 2 * t); return Hf(x, z) > y + 1 + (hash(i, j + k * 31) - .5) * 1.5 && !bite(x, y, z); } }); }
      withM(tr(-w * .1, g + 6.8, d / 2 - 3.2).multiply(M4().makeRotationX(.8)), () => box(0, -.3, 1.6, 3.6, .3, 3.2, { col }));   // a slab hanging off its rebar
      const px = w * .08, pz = d / 2 + .8;
      lump(BODY, px, g - .7, pz, 6.5, 3.2, 4.4, rc, 0); lump(BODY, -w * .1, g - .3, -.5, 4.5, 3.4, 4, rc, 0);
      for (let i = 0; i < 190; i++) { const a = R() * 6.283, q = Math.sqrt(R()), x = px + Math.cos(a) * q * 7, z = pz + Math.sin(a) * q * 5.2, y = g - .5 + 3.1 * Math.sqrt(Math.max(0, 1 - q * q)) * rr(.75, 1.02), s = rr(.2, 1.15);
        withM(tr(x, y, z).multiply(M4().makeRotationFromEuler(new THREE.Euler(rr(-1, 1), rr(0, 6), rr(-1, 1)))),
          () => box(0, -s * .3, 0, s * rr(.8, 2), s * rr(.3, .7), s * rr(.8, 1.6), { tile: R() < .2 ? T.TILE : 0, col: R() < .3 ? col : rc.clone().multiplyScalar(rr(.7, 1.1)) }));
        if (R() < .22) lump(MOSSB, x, y + .1, z, rr(.4, .9), rr(.15, .3), rr(.4, .9), MC()); }
      for (let i = 0; i < 14; i++) { const x = rr(-w / 2, w / 2), z = R() < .5 ? -d / 2 + .2 : rr(-d / 2, d / 2), y = clamp(Hf(x, z), g + 1, H), dx = rr(-.6, .6), dz = rr(-.3, .9);
        tube([new V3(x, y - .3, z), new V3(x + dx * .5, y + .8, z + dz * .5), new V3(x + dx * 1.4, y + rr(1, 1.6), z + dz * 1.3)], .045, RUST); }
      vines({ o: [-w / 2, 0, -d / 2 + t], r: [1, 0, 0], f: [0, 0, 1], L: w * .5 }, 4, H - 1.5, 9);
      const p = worldOf(px, 0, pz); props.push({ x: p.x, z: p.z, r: 5.8 });
      D.anchor = [-w * .35, g + 3, d / 2];
    },
  };

  /* ---------- the town plan (back row faces the street at z ≈ -20; right strip faces the street at x ≈ 33) ---------- */
  const E = -Math.PI / 2, W = Math.PI / 2;
  const PLAN = [
    { kind: 'wood', x: -50.3, z: -29.5, w: 12, d: 11, col: '#cfc2a4', kaw: '#666d76', sign: 0 },
    { kind: 'row', x: -38.5, z: -29.5, w: 8, d: 11, f: 3, tile: T.TILE, col: '#b48f74', lean: .12, neon: 6, fl: 1.5 },
    { kind: 'row', x: -27.5, z: -29, w: 9, d: 10, f: 2, tile: T.PLAST, col: '#bfb49c', flat: 1, hsign: SHOKUDO },
    { kind: 'office', x: -15, z: -29.5, w: 11, d: 11, f: 5, tile: T.TILE, col: '#c7bba2', sign: 1 },
    { kind: 'ruin', x: -2, z: -29.5, w: 10, d: 11, col: '#a8a59c' },
    { kind: 'wood', x: 9.5, z: -29, w: 10, d: 10, col: '#bfb49c', kaw: '#6f6258', caved: 1 },
    { kind: 'row', x: 20, z: -29.5, w: 8, d: 11, f: 3, tile: T.CONC, col: '#a9b0a8', neon: 5, fl: .37 },
    { kind: 'mansion', x: 31, z: -30, w: 11, d: 12, f: 7, col: '#d0c8b8' },
    { kind: 'row', x: 48, z: -30, w: 15, d: 12, f: 4, tile: T.TILE, col: '#8fa39a', neon: 7, fl: .71, tank: 1 },
    { kind: 'store', x: 46, z: -8, w: 12, d: 15, rot: E, col: '#d8d4ca' },
    { kind: 'wood', x: 45, z: 7, w: 12, d: 12, rot: E, col: '#c9bfa6', kaw: '#6d6660', sign: 4, hsign: SHOKUDO },
    { kind: 'row', x: 45, z: 24, w: 11, d: 12, rot: E, f: 2, tile: T.PLAST, col: '#cbb89a', sign: 3 },
    { kind: 'wood', x: 24.5, z: 17, w: 8, d: 8, rot: W, col: '#b8ad96', kaw: '#6e6660' },
    { kind: 'shed', x: 24, z: 3, w: 7, d: 5, rot: W, hh: 3.6, col: '#8f9291' },
    { kind: 'shed', x: 25, z: 31, w: 6, d: 5, rot: W, hh: 4.2, col: '#7f8a86' },
  ];
  PLAN.forEach(D => {
    const { x, z, w, d } = D, rot = D.rot || 0, c = Math.cos(rot), s = Math.sin(rot);
    let lo = 1e9, hi = -1e9;
    for (let a = -.5; a <= .5; a += .25) for (let b = -.5; b <= .5; b += .25) { const lx = a * w, lz = b * d, y = soilY(x + lx * c + lz * s, z - lx * s + lz * c); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    D.base = lo - .6; const g = hi - D.base + .15;
    let m = tr(x, D.base, z).multiply(M4().makeRotationY(rot));
    if (D.lean) m.multiply(tr(w / 2, 0, 0)).multiply(M4().makeRotationZ(-D.lean)).multiply(tr(-w / 2, 0, 0));
    setM(m); ctx = { top: 0, moss: rr(.75, 1), inner: 0 };
    const i0 = BODY.i.length;
    KIND[D.kind](D, w, d, g, sides(w, d));
    const pos = new Float32Array((BODY.i.length - i0) * 3);            // world-space solid shell for height-grid rasterising
    for (let k = i0; k < BODY.i.length; k++) { const q = BODY.i[k] * 3; pos.set([BODY.p[q], BODY.p[q + 1], BODY.p[q + 2]], (k - i0) * 3); }
    const solid = new THREE.BufferGeometry(); solid.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (D.anchor) anchors.push(worldOf(...D.anchor));
    buildings.push({ x, z, w, d, rot, h: D.h, kind: D.kind, solid });
  });
  setM(M4());

  /* ---------- streets: cracked asphalt, pavements, worn paint ---------- */
  function strip(x0, z0, x1, z1, lift, tile, col, su) {           // rectangle following the soil (z0 > z1)
    const nu = Math.max(1, Math.ceil((x1 - x0) / su)), nv = Math.max(1, Math.ceil((z0 - z1) / su)), f = BODY.vc, S = TS[tile];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const x = lerp(x0, x1, i / nu), z = lerp(z0, z1, j / nv); vert(BODY, x, soilY(x, z) + lift, z, 0, 1, 0, x / S, z / S, col, tile); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const q = f + j * (nu + 1) + i; BODY.i.push(q, q + 1, q + nu + 2, q, q + nu + 2, q + nu + 1); }
  }
  ctx = { top: -99, moss: .45, inner: 0 };
  const ASPHC = lin('#9a9a96'), CURBC = lin('#b5b1a6');
  strip(-58.5, -17.5, 58.5, -22.5, .07, T.ASPH, ASPHC, 1.2); strip(30.5, 38.5, 35.5, -17.5, .07, T.ASPH, ASPHC, 1.2);
  strip(-58.5, -22.5, 58.5, -24, .2, T.CONC, CURBC, 1.5); strip(35.5, 38.5, 37.4, -17.5, .2, T.CONC, CURBC, 1.5);
  strip(-58.5, -16.9, 29.9, -17.5, .2, T.CONC, CURBC, 1.5); strip(35.5, -16.9, 37.4, -17.5, .2, T.CONC, CURBC, 1.5); strip(29.9, 38.5, 30.5, -16.9, .2, T.CONC, CURBC, 1.5);
  function groundDecal(x, z, w, l, fx, fz, r) { const rx = -fz, rz = fx, y = soilY(x, z) + .1;
    decal([x - rx * w / 2 - fx * l / 2, y, z - rz * w / 2 - fz * l / 2], [rx * w, 0, rz * w], [fx * l, 0, fz * l], r); }
  for (let x = -57.5; x < 29; x += 2) for (const z of [-22.1, -17.9]) if (R() > .15) groundDecal(x + 1, z, .16, 2, 1, 0, BAR);
  for (let z = -16.5; z < 37.5; z += 2) for (const x of [30.9, 35.1]) if (R() > .15) groundDecal(x, z + 1, .16, 2, 0, 1, BAR);
  groundDecal(33, -13.5, 3.2, 2.6, 0, -1, STOP); groundDecal(26.5, -20, 3.2, 2.6, 1, 0, STOP);
  for (const [x, z] of [[-30, -19.8], [10, -20.2], [33, 12], [46, -20]]) groundDecal(x, z, 1.4, 1.4, 1, 0, MANHOLE);
  groundDecal(-15.5, -20.2, 4.2, 8, 1, 0, FOOT);                        // something huge walked down this street...

  /* ---------- utility poles + sagging wires ---------- */
  const POLES = [[-50, -16.3], [-35, -16.3], [-20, -16.3], [-4, -16.3, .3], [12, -16.3], [27.5, -16.3], [29.4, -3], [29.4, 11.5], [29.4, 26]];
  const armP = [];
  ctx = { top: -99, moss: .25, inner: 0 };
  POLES.forEach(([x, z, lean], k) => {
    const m = tr(x, soilY(x, z) - .5, z); if (lean) m.multiply(M4().makeRotationX(-lean));
    setM(m); const ac = k < 6 ? [0, 0, 1] : [1, 0, 0];
    cyl(0, 0, 0, .24, 15.8, 7, { col: POLEC }, .17);
    box(0, 14.2, 0, ac[0] ? 2.8 : .16, .16, ac[2] ? 2.8 : .16, { col: DARKM }); box(0, 12.9, 0, ac[0] ? 1.9 : .15, .15, ac[2] ? 1.9 : .15, { col: DARKM });
    if (k % 3 === 1) cyl(-(1 - ac[0]) * .55, 10.2, -(1 - ac[2]) * .55, .42, 1.3, 8, { tile: T.PLAST, col: TANKC });
    lump(MOSSB, 0, 15.8, 0, .3, .12, .3, MC());
    armP.push([[1.25, 14.36], [-1.25, 14.36], [0, 14.36], [.85, 13.05], [-.85, 13.05]].map(([o, y]) => worldOf(ac[0] * o, y, ac[2] * o)));
    props.push({ x, z, r: .6 });
  });
  setM(M4()); ctx = { top: -99, moss: 0, inner: 0 };
  function wire(a, b, sag) { const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new V3().lerpVectors(a, b, t).setY(lerp(a.y, b.y, t) - sag * 4 * t * (1 - t))); } tube(pts, .05, WIRE); }
  for (let k = 0; k < POLES.length - 1; k++) for (let e = 0; e < 5; e++) wire(armP[k][e], armP[k + 1][e], .5 + armP[k][e].distanceTo(armP[k + 1][e]) * .045 + (k === 2 || k === 3 ? 1.2 : 0));
  anchors.forEach(a => { let best = armP[0]; armP.forEach(p => { if (p[3].distanceTo(a) < best[3].distanceTo(a)) best = p; }); wire(best[R() < .5 ? 3 : 4], a, .6); });

  /* ---------- materials + merged meshes ---------- */
  const U = { uNight: { value: 0 }, uTime: { value: 0 } };
  const texOf = (c, aniso) => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.flipY = false; t.anisotropy = aniso; return t; };
  const bodyMat = track(new THREE.MeshStandardMaterial({ map: texOf(BA, MAX_ANISO), vertexColors: true, roughness: .9 }), .3);
  const gl2 = renderer.capabilities.isWebGL2;
  bodyMat.onBeforeCompile = sh => {                                     // tile atlas lookup: fract() inside the tile, gradients from the unwrapped uv (no seams)
    sh.vertexShader = 'attribute float aTile;\nvarying float vTile;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = aTile;');
    sh.fragmentShader = 'varying float vTile;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec2 tC = vec2(mod(vTile + .5, 4.0) - .5, floor((vTile + .5) / 4.0));
      vec2 tUv = (tC * 256.0 + 8.0 + 240.0 * fract(vUv)) / vec2(1024.0, 512.0);
      vec4 texelColor = ${gl2 ? 'textureGrad(map, tUv, dFdx(vUv) * vec2(.234, .469), dFdy(vUv) * vec2(.234, .469))' : 'texture2D(map, tUv)'};
      texelColor = mapTexelToLinear(texelColor); diffuseColor *= texelColor;`);
  };
  bodyMat.customProgramCacheKey = () => 'cityBody';
  const decoMat = track(new THREE.MeshStandardMaterial({ map: texOf(DA, Math.min(8, MAX_ANISO)), vertexColors: true, roughness: .45, alphaTest: .5, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }), .8);
  decoMat.onBeforeCompile = sh => {                                     // night glow: lit windows, neon (soft flicker), vending machines
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec2 aGlow;\nvarying vec2 vGlow;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = 'uniform float uNight, uTime;\nvarying vec2 vGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (vGlow.x > 0.0) { float ph = vGlow.y, fl = 1.0;
        if (ph > 0.0) { float n = fract(sin(floor(uTime * (ph > 1.0 ? 6.0 : 3.0) + ph * 57.0) * 12.9898 + ph * 78.233) * 43758.545);
          fl = (ph > 1.0 ? mix(.08, 1.0, step(.3, n)) : 1.0 - .4 * smoothstep(.8, 1.0, n)) * (.94 + .06 * sin(uTime * 23.0 + ph * 9.0)); }
        totalEmissiveRadiance += texelColor.rgb * vGlow.x * uNight * fl; }`);
  };
  decoMat.customProgramCacheKey = () => 'cityDeco';
  const mossMat = track(new THREE.MeshStandardMaterial({ map: MOSS.map, normalMap: MOSS.normalMap, vertexColors: true, roughness: .95 }), .25);
  function toMesh(b, mat, attr) {
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    G.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2)); G.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
    if (attr) G.setAttribute(attr, new THREE.Float32BufferAttribute(b.a, b.an));
    G.setIndex(b.i); G.computeBoundingSphere();
    const m = new THREE.Mesh(G, mat); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m); meshes.push(m); return m;
  }
  toMesh(BODY, bodyMat, 'aTile').castShadow = true;
  toMesh(DECO, decoMat, 'aGlow'); toMesh(MOSSB, mossMat);

  // (x, z) within pad of a building footprint (same rotation convention as Object3D.rotation.y) or a big prop
  function inside(x, z, pad) {
    pad = pad || 0;
    for (const b of buildings) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
      if (Math.abs(dx * c - dz * s) < b.w / 2 + pad && Math.abs(dx * s + dz * c) < b.d / 2 + pad) return true; }
    for (const p of props) if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return true;
    return false;
  }
  return { buildings, inside, meshes, props, update(dt, night) { U.uTime.value += dt; U.uNight.value = night; } };
})();
