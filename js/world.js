'use strict';
/* =====================================================================
   World: renderer, procedural PBR textures, terrarium, plants, lights
   ===================================================================== */
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3, V2 = THREE.Vector2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = x => x - Math.floor(x);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const UP = new V3(0, 1, 0);
const PERLIN = new THREE.ImprovedNoise();
function fbm(x, y, z, oct) { let a = .5, f = 1, s = 0; for (let i = 0; i < (oct || 3); i++) { s += a * PERLIN.noise(x * f, y * f, z * f); a *= .5; f *= 2.03; } return s; }

/* ---------- renderer / camera ---------- */
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.physicallyCorrectLights = false;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1512).convertSRGBToLinear();
scene.fog = new THREE.FogExp2(scene.background.getHex(), 0.0042);
const camera = new THREE.PerspectiveCamera(36, 1, 0.2, 600);
camera.position.set(4, 34, 58);
const controls = new THREE.OrbitControls(camera, canvas);
controls.target.set(0, 3, 0);
controls.enableDamping = true; controls.dampingFactor = .07;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 7; controls.maxDistance = 120;
const pmrem = new THREE.PMREMGenerator(renderer);
/* image-based light: a dim warm room with the terrarium LED bar overhead, a cool window and a
   table lamp. Much darker than RoomEnvironment so glass/water reflect shapes instead of going milky. */
scene.environment = (() => {
  const es = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(80, 40, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3a2e26).multiplyScalar(.22), side: THREE.BackSide }));
  room.position.y = 14; es.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a1a10).multiplyScalar(.3) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -5; es.add(floor);
  const panel = (w, h, col, k, pos, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); es.add(m); };
  panel(26, 2.5, 0xf4f7ff, 12, [0, 20, -3], [Math.PI / 2, 0, 0]);       // LED bar
  panel(22, 16, 0xa9c4ff, 2.2, [-39, 14, -8], [0, Math.PI / 2, 0]);     // window
  panel(5, 7, 0xffae6a, 5, [26, 10, 30], [0, -2.3, 0]);                 // room lamp
  panel(40, 10, 0x9b8a78, .45, [0, 12, 39], [0, Math.PI, 0]);           // bounce from the room behind the viewer
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++)                  // mullioned window on the far wall: crisp shapes for water and glass to mirror
    panel(11, 8, 0xc4d6ff, 1.6, [-12 + i * 12, 11 + j * 9, -39.5], [0, 0, 0]);
  panel(70, 70, 0x4a4038, .25, [0, 33.9, 0], [Math.PI / 2, 0, 0]);      // ceiling
  const t = pmrem.fromScene(es, 0.03).texture;
  es.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return t;
})();
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

/* ---------- procedural texture kit ---------- */
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function wrap(w, h, x, y, r, fn) { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { const X = x + dx, Y = y + dy; if (X + r >= 0 && X - r <= w && Y + r >= 0 && Y - r <= h) fn(X, Y); } }
function blob(g, x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = a == null ? 1 : a; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalAlpha = 1; }
function heightToNormal(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cnv(w, h), og = out.getContext('2d'), id = og.createImageData(w, h), d = id.data;
  const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
    d[o] = (-dx / l * .5 + .5) * 255; d[o + 1] = (dy / l * .5 + .5) * 255; d[o + 2] = (1 / l * .5 + .5) * 255; d[o + 3] = 255;
  }
  og.putImageData(id, 0, 0); return out;
}
function mkTex(c, srgb, rx, ry) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx || 1, ry || rx || 1); t.anisotropy = MAX_ANISO; return t;
}
// paint(albedoCtx, heightCtx, w, h) → { map, normalMap }
function pbr(w, h, base, hBase, paint, nStrength, rx, ry) {
  const a = cnv(w, h), hh = cnv(w, h), ga = a.getContext('2d'), gh = hh.getContext('2d');
  ga.fillStyle = base; ga.fillRect(0, 0, w, h); gh.fillStyle = hBase; gh.fillRect(0, 0, w, h);
  paint(ga, gh, w, h);
  return { map: mkTex(a, true, rx, ry), normalMap: mkTex(heightToNormal(hh, nStrength), false, rx, ry), canvas: a };
}
const hsl = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a == null ? 1 : a})`;

/* soil: coco fibre + topsoil, grains, bark chips, perlite */
const SOIL = pbr(1024, 1024, '#2a1c12', '#3c3c3c', (ga, gh, w, h) => {
  for (let i = 0; i < 1500; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(6, 22);
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(rand(18, 32), rand(25, 45), rand(8, 22)), .55); blob(gh, X, Y, r, '#fff', .18); }); }
  for (let i = 0; i < 16000; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(1, 3.6);
    const c = hsl(rand(16, 36), rand(25, 50), rand(7, 34));
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, c, .95); blob(gh, X, Y, r, '#fff', .75); }); }
  for (let i = 0; i < 1100; i++) { let x = Math.random() * w, y = Math.random() * h; const n = 4 + (Math.random() * 6 | 0), c = hsl(rand(22, 34), rand(14, 28), rand(10, 24)), lw = rand(.8, 2);
    const pts = [[x, y]]; let a = rand(0, 6.3); for (let k = 0; k < n; k++) { a += rand(-.6, .6); x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]); }
    [[ga, c], [gh, 'rgba(255,255,255,.7)']].forEach(([g, s]) => { g.strokeStyle = s; g.lineWidth = lw; g.lineCap = 'round';
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke(); } }); }
  for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(3, 9), c = hsl(rand(15, 25), 35, rand(10, 20));
    wrap(w, h, x, y, r, (X, Y) => { [[ga, c], [gh, 'rgba(255,255,255,.55)']].forEach(([g, s]) => { g.fillStyle = s; g.beginPath(); for (let k = 0; k < 6; k++) { const aa = k / 6 * 6.28, rr = r * rand(.5, 1); g.lineTo(X + Math.cos(aa) * rr, Y + Math.sin(aa) * rr); } g.fill(); }); }); }
  for (let i = 0; i < 140; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(1.2, 2.8);
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, '#ddd6c6'); blob(gh, X, Y, r, '#fff'); }); }
}, 2.2, 4, 4 * 40 / 60);

/* periodic gradient noise: an fbm whose every octave wraps after exactly one texture width, so triplanar rock never shows a seam */
function tileFbm(P, oct) {
  const layers = [];
  for (let o = 0; o < oct; o++) { const n = P << o, g = new Float32Array(n * n * 2); for (let i = 0; i < n * n; i++) { const a = Math.random() * 6.2832; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); } layers.push([n, g]); }
  const q = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (u, v) => { let s = 0, amp = .5;
    for (const [n, g] of layers) { const x = u * n, y = v * n, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const G = (ix, iy, dx, dy) => { const k = ((((iy % n) + n) % n) * n + (((ix % n) + n) % n)) * 2; return g[k] * dx + g[k + 1] * dy; };
      s += amp * lerp(lerp(G(xi, yi, fx, fy), G(xi + 1, yi, fx - 1, fy), q(fx)), lerp(G(xi, yi + 1, fx, fy - 1), G(xi + 1, yi + 1, fx - 1, fy - 1), q(fx)), q(fy)) * 1.4; amp *= .5; }
    return s; };
}
/* weathered granite: mottled grey-brown groundmass, salt-and-pepper mineral grains (biotite, feldspar, quartz),
   rusty iron stains, rain streaks and pits */
const ROCK = pbr(512, 512, hsl(30, 7, 40), '#808080', (ga, gh, w, h) => {
  const A = ga.getImageData(0, 0, w, h), Hd = gh.getImageData(0, 0, w, h), a = A.data, hd = Hd.data;
  const big = tileFbm(3, 4), mid = tileFbm(12, 3), rust = tileFbm(4, 3), fine = tileFbm(48, 2);
  const dark = [70, 64, 58], light = [150, 142, 130], iron = [132, 88, 52];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h, b = big(u, v), m = mid(u, v), f = fine(u, v), r = clamp((rust(u, v) - .12) * 3, 0, 1) * .55;
    const t = clamp(.52 + b * 1.1 + m * .45 + f * .25, 0, 1), o = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) a[o + k] = lerp(lerp(dark[k], light[k], t), iron[k], r);
    hd[o] = hd[o + 1] = hd[o + 2] = clamp(.5 + b * .5 + m * .5 + f * .35, 0, 1) * 255;
  }
  ga.putImageData(A, 0, 0); gh.putImageData(Hd, 0, 0);
  const grain = (n, r0, r1, col, al, hcol) => { for (let i = 0; i < n; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(r0, r1), c = col(), rot = rand(0, 6.3);
    wrap(w, h, x, y, r, (X, Y) => { [[ga, c, al], [gh, hcol, .6]].forEach(([g, s, aa]) => { g.globalAlpha = aa; g.fillStyle = s; g.beginPath();
      for (let k = 0; k < 5; k++) { const an = rot + k / 5 * 6.283, rr = r * rand(.55, 1); g.lineTo(X + Math.cos(an) * rr, Y + Math.sin(an) * rr); } g.fill(); }); }); } ga.globalAlpha = gh.globalAlpha = 1; };
  grain(5200, .6, 2, () => hsl(rand(20, 35), rand(8, 30), rand(62, 78)), .7, '#d0d0d0');   // feldspar
  grain(3200, .6, 1.8, () => hsl(rand(30, 50), rand(3, 8), rand(52, 64)), .45, '#b0b0b0'); // quartz
  grain(3600, .5, 1.5, () => hsl(rand(20, 30), 10, rand(6, 14)), .85, '#303030');         // biotite
  for (let i = 0; i < 220; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(1, 3.5);                // weathering pits
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, 'rgba(22,18,14,1)', .6); blob(gh, X, Y, r, '#000', .8); }); }
  for (let i = 0; i < 60; i++) { const x = Math.random() * w, y0 = Math.random() * h, l = rand(30, 160);              // rain streaks (vertical on side faces)
    ga.strokeStyle = `rgba(30,24,18,${rand(.04, .1)})`; ga.lineWidth = rand(2, 7); for (const ox of [-w, 0, w]) for (const oy of [-h, 0]) { ga.beginPath(); ga.moveTo(x + ox, y0 + oy); ga.lineTo(x + ox + rand(-3, 3), y0 + oy + l); ga.stroke(); } }
  for (let i = 0; i < 14; i++) { let x = Math.random() * w, y = Math.random() * h, an = rand(0, 6.3);                   // hairline fractures
    const pts = [[x, y]]; for (let k = 0; k < 12; k++) { an += rand(-.5, .5); x += Math.cos(an) * 8; y += Math.sin(an) * 8; pts.push([x, y]); }
    [[ga, 'rgba(18,14,10,.5)'], [gh, 'rgba(0,0,0,.9)']].forEach(([g, s]) => { g.strokeStyle = s; g.lineWidth = rand(.7, 1.4);
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)); g.stroke(); } }); }
}, 3.4);

/* bark: vertical plates split by deep fissures, lichen and a mossy crown */
/* bark: furrowed ridge network (ridges run along the trunk), rusty inner bark in the furrows, lichen and moss.
   u wraps around the log, v runs along it; v is made tileable by sampling the noise on a circle. */
const BARK = pbr(1024, 512, '#24170e', '#202020', (ga, gh, w, h) => {
  const A = ga.getImageData(0, 0, w, h), Hd = gh.getImageData(0, 0, w, h), a = A.data, hd = Hd.data;
  const cosT = [], sinT = []; for (let y = 0; y < h; y++) { const t = y / h * Math.PI * 2; cosT.push(Math.cos(t)); sinT.push(Math.sin(t)); }
  const c0 = [56, 43, 33], c1 = [96, 80, 66], cf = [50, 28, 16];      // plate dark / plate light / furrow (inner bark)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cy = cosT[y], sy = sinT[y];
    // ridged network: zero crossings of warped noise become narrow furrows
    const warp = PERLIN.noise(x * .012, cy * .9 + 7, sy * .9) * .8;
    const n = PERLIN.noise(x * .04 + warp, cy * .75, sy * .75) + PERLIN.noise(x * .1, cy * 2, sy * 2 + 3) * .3;
    const f = Math.min(1, Math.abs(n) / .3), plate = f * f * (3 - 2 * f);
    const fib = PERLIN.noise(x * .5, cy * 6, sy * 6) * .5 + PERLIN.noise(x * 1.1, cy * 16, sy * 16) * .3;   // stringy fibres along the trunk
    const tone = clamp(.5 + PERLIN.noise(x * .02 + 9, cy * .8, sy * .8) * 1.1 + fib * .35, 0, 1);
    const o = (y * w + x) * 4;
    for (let k = 0; k < 3; k++) a[o + k] = lerp(cf[k], lerp(c0[k], c1[k], tone), plate) * (.85 + fib * .3);
    const hv = clamp(plate * (.75 + Math.abs(n) * .6) + fib * .12, 0, 1) * 255; hd[o] = hd[o + 1] = hd[o + 2] = hv;
  }
  ga.putImageData(A, 0, 0); gh.putImageData(Hd, 0, 0);
  for (let i = 0; i < 140; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(4, 14);                // grey-green crustose lichen
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(rand(70, 100), rand(8, 20), rand(50, 64)), .45); blob(ga, X, Y, r * .3, hsl(80, 10, 70), .3); }); }
  for (let i = 0; i < 2200; i++) { const x = w * .5 + gauss() * w * .18, y = Math.random() * h, r = rand(1.5, 4);          // moss cushions along the top
    if (fbm(x * .01, y * .01, 3) < -.02) continue;
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(rand(78, 100), rand(40, 60), rand(16, 30))); blob(gh, X, Y, r, '#fff', .6); }); }
}, 3.2);

/* heartwood inside the hollow log */
const WOOD = pbr(512, 512, hsl(28, 24, 24), '#6a6a6a', (ga, gh, w, h) => {
  // punky, fibrous rotten heartwood: fibres run along the log axis (v)
  for (let i = 0; i < 520; i++) { let x = Math.random() * w, y = -20; const dark = Math.random() < .55, c = dark ? hsl(rand(20, 28), rand(22, 32), rand(10, 18), .55) : hsl(rand(28, 36), rand(18, 30), rand(30, 44), .35);
    ga.strokeStyle = c; gh.strokeStyle = dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.35)'; ga.lineWidth = gh.lineWidth = rand(.6, 3);
    const ph = rand(0, 9), amp = rand(.4, 2.2);
    for (const ox of [-w, 0, w]) { ga.beginPath(); gh.beginPath(); let xx = x + ox, yy = y; ga.moveTo(xx, yy); gh.moveTo(xx, yy);
      while (yy < h + 20) { yy += 10; xx += Math.sin(yy * .025 + ph) * amp * .5 + fbm(xx * .02, yy * .02, i) * 2; ga.lineTo(xx, yy); gh.lineTo(xx, yy); } ga.stroke(); gh.stroke(); } }
  for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(12, 46);   // soft rot / damp stains
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(22, 30, 8), .45); blob(gh, X, Y, r, '#000', .35); }); }
  for (let i = 0; i < 26; i++) { let x = Math.random() * w, y = Math.random() * h;                        // pale mycelium threads
    ga.strokeStyle = 'rgba(214,204,182,.18)'; ga.lineWidth = rand(.5, 1.4); ga.beginPath(); ga.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += rand(-8, 8); y += rand(4, 14); ga.lineTo(x, y); } ga.stroke(); }
  for (let i = 0; i < 90; i++) { let x = Math.random() * w, y = Math.random() * h, l = rand(20, 90);          // splits along the grain
    for (const ox of [-w, 0, w]) { ga.strokeStyle = 'rgba(6,4,2,.8)'; gh.strokeStyle = '#000'; ga.lineWidth = gh.lineWidth = rand(1, 2.5);
      ga.beginPath(); gh.beginPath(); ga.moveTo(x + ox, y); gh.moveTo(x + ox, y); ga.lineTo(x + ox + rand(-3, 3), y + l); gh.lineTo(x + ox + rand(-3, 3), y + l); ga.stroke(); gh.stroke(); } }
}, 2.6);

/* end grain of the cut ends. Only the annulus between the rotten-out core and the bark is visible, so the
   texture is painted in "radial" space: ring UVs map 0..1 across the wall onto ENDGRAIN_R0..ENDGRAIN_R1 px. */
const ENDGRAIN_R0 = 378, ENDGRAIN_R1 = 510;
const ENDGRAIN = (() => {
  const s = 1024, a = cnv(s, s), hh = cnv(s, s), ga = a.getContext('2d'), gh = hh.getContext('2d'), c = s / 2;
  const R0 = ENDGRAIN_R0, R1 = ENDGRAIN_R1, RB = R0 + (R1 - R0) * .7;       // RB = cambium / inner bark
  ga.fillStyle = hsl(32, 18, 38); ga.fillRect(0, 0, s, s); gh.fillStyle = '#8a8a8a'; gh.fillRect(0, 0, s, s);
  const ringPath = (g, r, amp, seed, keep) => { if (!keep) g.beginPath(); for (let k = 0; k <= 180; k++) { const t = k / 180 * 6.2832, rr = r + fbm(Math.cos(t) * 2, Math.sin(t) * 2, seed) * amp; g.lineTo(c + Math.cos(t) * rr, c + Math.sin(t) * rr); } };
  // sapwood tone: lighter towards the bark, greyed by weathering
  for (let r = R0 - 20; r < RB; r += 2) { ga.strokeStyle = hsl(31, 20 + (r - R0) / (RB - R0) * 8, 30 + (r - R0) / (RB - R0) * 12); ga.lineWidth = 3; ringPath(ga, r, 6, 1); ga.stroke(); }
  // annual rings: dark latewood lines as grooves
  for (let r = R0 - 10; r < RB - 2; r += rand(3, 7)) {
    ga.strokeStyle = hsl(26, 30, rand(16, 24), rand(.45, .75)); gh.strokeStyle = 'rgba(0,0,0,.55)'; ga.lineWidth = gh.lineWidth = rand(.8, 2.2);
    [ga, gh].forEach(g => { ringPath(g, r, 6, 1); g.stroke(); });
  }
  // weathering: silver-grey blotches and dark fungal stains
  for (let i = 0; i < 260; i++) { const t = rand(0, 6.283), r = rand(R0, RB), x = c + Math.cos(t) * r, y = c + Math.sin(t) * r;
    Math.random() < .6 ? blob(ga, x, y, rand(6, 22), hsl(35, 6, 58), .16) : blob(ga, x, y, rand(5, 16), hsl(20, 25, 8), .3); }
  // rotten, crumbly inner edge
  { const gr = ga.createRadialGradient(c, c, R0 - 20, c, c, R0 + 26); gr.addColorStop(0, hsl(22, 28, 7)); gr.addColorStop(.55, hsl(24, 26, 14, .75)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ga.fillStyle = gr; ga.beginPath(); ga.arc(c, c, R0 + 26, 0, 6.3); ga.fill();
    for (let i = 0; i < 500; i++) { const t = rand(0, 6.283), r = R0 + Math.pow(Math.random(), 2) * 22, x = c + Math.cos(t) * r, y = c + Math.sin(t) * r;
      blob(gh, x, y, rand(2, 6), Math.random() < .5 ? '#000' : '#fff', .5); blob(ga, x, y, rand(1.5, 4), hsl(26, 25, rand(6, 20)), .7); } }
  // radial drying checks
  for (let i = 0; i < 16; i++) { let t = rand(0, 6.283); const r0 = rand(R0, R0 + 40), r1 = rand(RB - 30, RB + 8);
    [[ga, 'rgba(8,5,3,.92)'], [gh, '#000']].forEach(([g, col]) => { g.strokeStyle = col; g.lineWidth = rand(1.4, 3.2); g.beginPath();
      let tt = t; for (let r = r0; r <= r1; r += 6) { tt += rand(-.006, .006); g.lineTo(c + Math.cos(tt) * r, c + Math.sin(tt) * r); } g.stroke(); }); }
  // cambium line, then fibrous bark
  ga.strokeStyle = hsl(36, 30, 52, .8); ga.lineWidth = 2.5; ringPath(ga, RB, 3, 4); ga.stroke();
  ga.fillStyle = hsl(20, 22, 11); ga.beginPath(); ga.arc(c, c, s, 0, 6.3); ga.closePath(); ringPath(ga, RB + 3, 3, 4, true); ga.closePath(); ga.fill('evenodd');
  gh.fillStyle = '#b0b0b0'; gh.beginPath(); gh.arc(c, c, s, 0, 6.3); gh.closePath(); ringPath(gh, RB + 3, 3, 4, true); gh.closePath(); gh.fill('evenodd');
  for (let i = 0; i < 2600; i++) { const t = rand(0, 6.283), r = rand(RB + 3, R1 + 8), l = rand(3, 12);
    const col = hsl(rand(18, 28), rand(15, 30), rand(6, 24), .8); ga.strokeStyle = col; gh.strokeStyle = Math.random() < .5 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)';
    ga.lineWidth = gh.lineWidth = rand(.8, 2); [ga, gh].forEach(g => { g.beginPath(); g.moveTo(c + Math.cos(t) * r, c + Math.sin(t) * r); g.lineTo(c + Math.cos(t + rand(-.01, .01)) * (r + l), c + Math.sin(t) * (r + l)); g.stroke(); }); }
  for (let i = 0; i < 90; i++) { const t = rand(0, 6.283), r = rand(RB + 8, R1), x = c + Math.cos(t) * r, y = c + Math.sin(t) * r;   // lichen specks
    blob(ga, x, y, rand(2, 6), Math.random() < .5 ? hsl(80, 18, 55) : hsl(95, 40, 24), .6); }
  const map = mkTex(a, true), normalMap = mkTex(heightToNormal(hh, 3), false);
  [map, normalMap].forEach(t => t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping);
  return { map, normalMap };
})();

/* cork background panel */
const CORK = pbr(1024, 512, '#23170e', '#303030', (ga, gh, w, h) => {
  for (let i = 0; i < 3400; i++) { const x = Math.random() * w, y = Math.random() * h, rx = rand(3, 20), ry = rand(2, 9), rot = rand(-.4, .4), c = hsl(rand(20, 30), rand(22, 36), rand(9, 27));
    wrap(w, h, x, y, rx, (X, Y) => { ga.fillStyle = c; ga.beginPath(); ga.ellipse(X, Y, rx, ry, rot, 0, 6.3); ga.fill();
      const gr = gh.createRadialGradient(X, Y, 0, X, Y, rx); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gh.fillStyle = gr; gh.beginPath(); gh.ellipse(X, Y, rx, ry, rot, 0, 6.3); gh.fill(); }); }
  for (let i = 0; i < 260; i++) { let x = Math.random() * w, y = Math.random() * h, a = rand(0, 6.3); ga.strokeStyle = 'rgba(6,3,1,.85)'; gh.strokeStyle = '#000'; ga.lineWidth = gh.lineWidth = rand(1, 3.5);
    ga.beginPath(); gh.beginPath(); ga.moveTo(x, y); gh.moveTo(x, y); for (let k = 0; k < 6; k++) { a += rand(-.9, .9); x += Math.cos(a) * 12; y += Math.sin(a) * 6; ga.lineTo(x, y); gh.lineTo(x, y); } ga.stroke(); gh.stroke(); }
}, 3, 2, 1);

/* walnut table */
const TABLE = pbr(1024, 1024, '#2a1a10', '#808080', (ga, gh, w, h) => {
  const planks = 5, ph = h / planks;
  for (let p = 0; p < planks; p++) { ga.fillStyle = hsl(24, 38, rand(14, 20)); ga.fillRect(0, p * ph, w, ph);
    for (let i = 0; i < 90; i++) { const y0 = p * ph + Math.random() * ph; ga.strokeStyle = hsl(22, 40, rand(8, 26), .5); ga.lineWidth = rand(.5, 2); ga.beginPath();
      for (let x = 0; x <= w; x += 16) ga.lineTo(x, y0 + Math.sin(x * .01 + i) * 3 + fbm(x * .01, i, p) * 10); ga.stroke(); }
    gh.fillStyle = '#000'; gh.fillRect(0, p * ph - 1.5, w, 3); ga.fillStyle = '#0a0604'; ga.fillRect(0, p * ph - 1, w, 2); }
}, 2, 3, 3);

/* alpha strands for velvet fur and moss (shell texturing) */
function strandTex(n, r0, r1, rep) {
  const s = 256, c = cnv(s, s), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { const x = Math.random() * s, y = Math.random() * s, r = rand(r0, r1), v = Math.pow(Math.random(), .7) * 255 | 0;
    wrap(s, s, x, y, r, (X, Y) => { blob(g, X, Y, r, `rgb(${v},${v},${v})`); }); }
  const t = mkTex(c, false, rep, rep); return t;
}
const FUR_STRANDS = strandTex(5200, 1.1, 2.2, 1);
const MOSS_STRANDS = strandTex(3800, 1.2, 2.6, 1);

function alphaShape(w, h, draw) { const c = cnv(w, h), g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO; return t; }
const LEAF_TEX = alphaShape(256, 512, (g, w, h) => {
  g.beginPath(); g.moveTo(w / 2, h * .98); g.bezierCurveTo(w * 1.05, h * .7, w * .9, h * .2, w / 2, h * .02); g.bezierCurveTo(w * .1, h * .2, -w * .05, h * .7, w / 2, h * .98); g.closePath();
  const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#b9a58a'); gr.addColorStop(.5, '#e8dcc6'); gr.addColorStop(1, '#b09a7c'); g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 600; i++) blob(g, Math.random() * w, Math.random() * h, rand(3, 16), hsl(25, 40, rand(20, 45)), .25);
  g.strokeStyle = 'rgba(240,225,200,.35)'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * .03); g.stroke();
  g.lineWidth = 2; for (let k = 1; k < 11; k++) { const y = h * (.95 - k * .08); [-1, 1].forEach(s => { g.beginPath(); g.moveTo(w / 2, y); g.quadraticCurveTo(w / 2 + s * w * .2, y - 20, w / 2 + s * w * .44, y - 60); g.stroke(); }); }
  g.restore(); g.strokeStyle = 'rgba(60,35,20,.6)'; g.lineWidth = 3; g.stroke();
});
const PINNA_TEX = alphaShape(256, 96, (g, w, h) => {
  g.beginPath(); g.moveTo(0, h / 2);
  for (let k = 0; k <= 40; k++) { const t = k / 40, ww = (Math.sin(Math.PI * Math.pow(t, .7)) * .42 + .06) * (1 - t * .4) * h * (1 + .22 * Math.abs(Math.sin(t * Math.PI * 9))); g.lineTo(t * w, h / 2 - ww); }
  for (let k = 40; k >= 0; k--) { const t = k / 40, ww = (Math.sin(Math.PI * Math.pow(t, .7)) * .42 + .06) * (1 - t * .4) * h * (1 + .22 * Math.abs(Math.sin(t * Math.PI * 9 + .5))); g.lineTo(t * w, h / 2 + ww); }
  g.closePath(); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#7fae58'); gr.addColorStop(1, '#b8dc8a'); g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(200,225,160,.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
});
const BLADE_TEX = alphaShape(16, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#2e4a18'); gr.addColorStop(.5, '#7fae4a'); gr.addColorStop(1, '#c9e38a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const RIPPLE_TEX = (() => { const s = 256, c = cnv(s, s), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) { const x = Math.random() * s, y = Math.random() * s, r = rand(8, 40); wrap(s, s, x, y, r, (X, Y) => { g.strokeStyle = `rgba(255,255,255,${rand(.05,.2)})`; g.lineWidth = rand(1, 4); g.beginPath(); g.arc(X, Y, r, 0, 6.3); g.stroke(); }); }
  return mkTex(heightToNormal(c, 3), false, 2, 2); })();

/* ---------- terrain ---------- */
const TW = 60, TD = 40, TH = 34;
const LOG = { c: new V3(-18, 0, -9), ang: .4, len: 17, R: 6.3 };
LOG.a = new V3(Math.cos(LOG.ang), 0, Math.sin(LOG.ang));
const BURROW = LOG.c.clone().addScaledVector(LOG.a, 5);
const LOG_ENTRY = LOG.c.clone().addScaledVector(LOG.a, 12.5);
const dishPos = new V3(18, 0, 9);
const soilBase = (x, z) => 1.5 + fbm(x * .05, 0.3, z * .05, 3) * 2.4 + fbm(x * .3, 7.1, z * .3, 2) * .3 - z / TD * 1.4;
const DISH_Y = soilBase(dishPos.x, dishPos.z) - .35;          // bottom of the water dish
function soilY(x, z) {
  let y = soilBase(x, z);
  const d = Math.hypot(x - BURROW.x, z - BURROW.z);
  if (d < 3.6) y -= Math.pow(1 - d / 3.6, 1.5) * 1.3;
  const dd = Math.hypot(x - dishPos.x, z - dishPos.z);        // the dish is pressed into a flat hollow, so the slope never pokes through its floor
  if (dd < 5.6) { const t = clamp((5.6 - dd) / 1.5, 0, 1); y = lerp(y, Math.min(y, DISH_Y + .02), t * t * (3 - 2 * t)); }
  return y;
}
// flat: slab with a cut top (bedded stone); small companion stones make the big ones read as a natural group
const ROCKS = [{ x: 6, z: -9, r: 5.4, h: 4.6, s: 1 }, { x: -4, z: 12, r: 3.3, h: 2.1, s: 2, flat: 1 }, { x: 24, z: -11, r: 4.2, h: 3.4, s: 3 },
               { x: -26, z: 10, r: 3, h: 2.3, s: 4 }, { x: 12, z: -2, r: 2.5, h: 1.5, s: 5, flat: 1 }, { x: -8, z: 3, r: 2, h: 1.2, s: 6 },
               { x: 10.5, z: -12.5, r: 1.7, h: 1.3, s: 7 }, { x: 19.5, z: -8, r: 1.4, h: .9, s: 8, flat: 1 }, { x: -1, z: 14.5, r: 1.3, h: .8, s: 9 }, { x: -23, z: 12.5, r: 1.2, h: .9, s: 10 }];
// each rock carries a top-down height grid rasterised from its own mesh (built in the rocks section), so the walkable
// surface is exactly the visible one. Cells store max(rock, soil), which blends seamlessly into soilY at the grid edge.
function gridY(g, x, z) {
  const fx = (x - g.x0) / g.cs, fz = (z - g.z0) / g.cs; if (fx < 0 || fz < 0 || fx >= g.w - 1 || fz >= g.d - 1) return -1e9;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, H = g.H, o = iz * g.w + ix;
  return lerp(lerp(H[o], H[o + 1], tx), lerp(H[o + g.w], H[o + g.w + 1], tx), tz);
}
function groundY(x, z) {
  let y = -1e9;
  for (const k of ROCKS) if (k.grid) y = Math.max(y, gridY(k.grid, x, z));
  return y > -1e8 ? y : soilY(x, z);
}
function groundN(x, z, e) { e = e || .12; return new V3(groundY(x - e, z) - groundY(x + e, z), 2 * e, groundY(x, z - e) - groundY(x, z + e)).normalize(); }
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
function seeded(s) { return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const envMats = new Set();
function track(m, env) { m.userData.env = env == null ? .6 : env; envMats.add(m); return m; }

const soilGeo = new THREE.PlaneGeometry(TW, TD, 170, 114); soilGeo.rotateX(-Math.PI / 2);
{
  const p = soilGeo.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i); p.setY(i, soilY(x, z));
    let ao = 1;
    for (const k of ROCKS) { const d = Math.hypot(x - k.x, z - k.z); ao *= lerp(.5, 1, clamp((d - k.r * .8) / (k.r * .8), 0, 1)); }
    const rel = new V3(x - LOG.c.x, 0, z - LOG.c.z), along = rel.dot(LOG.a), side = Math.abs(rel.x * -LOG.a.z + rel.z * LOG.a.x);
    if (Math.abs(along) < LOG.len / 2 + 1) ao *= side < LOG.R ? .45 : lerp(.55, 1, clamp((side - LOG.R) / 3, 0, 1));
    const damp = clamp(.5 + fbm(x * .08, 3, z * .08) * 1.4, 0, 1);
    const c = new THREE.Color().setHSL(.07, .25, lerp(.62, .44, damp) * ao).convertSRGBToLinear();
    col.push(c.r * 1.6, c.g * 1.6, c.b * 1.6);
  }
  soilGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  soilGeo.computeVertexNormals();
}
const soil = new THREE.Mesh(soilGeo, track(new THREE.MeshStandardMaterial({ map: SOIL.map, normalMap: SOIL.normalMap, normalScale: new V2(1.1, 1.1), vertexColors: true, roughness: .97 }), .35));
soil.receiveShadow = true; scene.add(soil);
{ // substrate cross-section seen through the front glass
  const g = new THREE.PlaneGeometry(TW, 6, 170, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, soilY(p.getX(i), TD / 2 - .05) + .02); else p.setY(i, -.6);
  const m = new THREE.Mesh(g, track(new THREE.MeshStandardMaterial({ map: SOIL.map, normalMap: SOIL.normalMap, color: 0x8a7a6a, roughness: 1 }), .3)); m.position.z = TD / 2 - .05; scene.add(m);
}

/* ---------- rocks (walkable surface) ---------- */
// triplanar: steep faces get their own projection instead of a top-down texture smeared down the sides
function triplanar(mat, tex, scale, nScale) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { tTriA: { value: tex.map }, tTriN: { value: tex.normalMap }, uTriS: { value: scale }, uTriNS: { value: nScale } });
    sh.vertexShader = 'varying vec3 vTriP;\nvarying vec3 vTriN;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvTriP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTriN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform sampler2D tTriA;\nuniform sampler2D tTriN;\nuniform float uTriS;\nuniform float uTriNS;\nvarying vec3 vTriP;\nvarying vec3 vTriN;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec3 triN = normalize(vTriN), triW = pow(abs(triN), vec3(4.0)); triW /= triW.x + triW.y + triW.z;
        vec3 triP = vTriP * uTriS;
        vec4 triA = texture2D(tTriA, triP.zy) * triW.x + texture2D(tTriA, triP.xz) * triW.y + texture2D(tTriA, triP.xy) * triW.z;
        diffuseColor.rgb *= sRGBToLinear(triA).rgb;`)
      .replace('#include <normal_fragment_maps>', `
        { // whiteout-blended triplanar normal map, built in world space then moved to view space
          vec3 nX = texture2D(tTriN, triP.zy).xyz * 2.0 - 1.0, nY = texture2D(tTriN, triP.xz).xyz * 2.0 - 1.0, nZ = texture2D(tTriN, triP.xy).xyz * 2.0 - 1.0;
          nX.xy *= uTriNS; nY.xy *= uTriNS; nZ.xy *= uTriNS;
          nX = vec3(nX.xy + triN.zy, abs(nX.z) * triN.x); nY = vec3(nY.xy + triN.xz, abs(nY.z) * triN.y); nZ = vec3(nZ.xy + triN.xy, abs(nZ.z) * triN.z);
          normal = normalize((viewMatrix * vec4(normalize(nX.zyx * triW.x + nY.xzy * triW.y + nZ.xyz * triW.z), 0.0)).xyz); }`);
  };
  mat.customProgramCacheKey = () => 'triplanar';
  return mat;
}
const rockMat = track(triplanar(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86 }), ROCK, 1 / 3.4, 1.3), .5);
// PolyhedronGeometry is non-indexed: weld the duplicates so displaced normals come out smooth
function welded(geo) {
  const p = geo.attributes.position, seen = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
    let j = seen.get(key); if (j === undefined) { j = pos.length / 3; seen.set(key, j); pos.push(x, y, z); } idx.push(j); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
/* a boulder = sphere clipped by random planes (flat fracture faces with slightly rounded edges), then lumps,
   fissures and faint bedding layers; the lower part is sunk into the substrate */
ROCKS.forEach(k => {
  const R = seeded(k.s * 7919 + 17), rr = (a, b) => a + R() * (b - a), ox = rr(0, 50);
  const planes = [];
  for (let i = 0, n = 8 + (R() * 5 | 0); i < n; i++) { const th = rr(0, 6.283), el = rr(-.3, .8);
    planes.push([new V3(Math.cos(th) * Math.cos(el), Math.sin(el), Math.sin(th) * Math.cos(el)), rr(.64, .9)]); }
  if (k.flat) planes.push([new V3(rr(-.2, .2), 1, rr(-.2, .2)).normalize(), rr(.42, .55)]);
  const sDir = new V3(rr(-.5, .5), 1, rr(-.5, .5)).normalize(), strata = k.flat ? .02 : .007;
  const geo = welded(new THREE.IcosahedronGeometry(1, Math.round(10 + k.r * 5)));
  const p = geo.attributes.position, n = p.count, crackA = new Float32Array(n), d = new V3(), q = new V3();
  let top = 0;
  for (let i = 0; i < n; i++) {
    d.fromBufferAttribute(p, i).normalize();
    let t = 1; for (const [pn, pd] of planes) { const c = d.dot(pn); if (c > .05) t = smin(t, pd / c, .06); }
    q.copy(d).multiplyScalar(t);
    const cr = 1 - Math.abs(PERLIN.noise(q.x * 2.2 + ox, q.y * 2.2 + 3.1, q.z * 2.2));
    const crack = sstep(.9, .99, cr) * sstep(-.15, .25, fbm(q.x * 1.3, q.y * 1.3 + ox, q.z * 1.3, 2));
    q.multiplyScalar(1 + fbm(q.x * 1.2 + ox, q.y * 1.2, q.z * 1.2, 3) * .1 + fbm(q.x * 4 + ox, q.y * 4 + 7, q.z * 4, 3) * .035 - crack * .04
      + Math.sin(q.dot(sDir) * 17 + fbm(q.x * 2, q.y * 2, q.z * 2 + ox, 2) * 5) * strata);
    p.setXYZ(i, q.x, q.y, q.z); crackA[i] = crack; top = Math.max(top, q.y);
  }
  const sx = k.r * rr(.95, 1.12), sz = k.r * rr(.72, .95), yaw = rr(0, 6.283), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const y0 = soilY(k.x, k.z) - k.h * .15, hy = k.h * 1.15 / top, soil = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = p.getX(i) * sx, z = p.getZ(i) * sz, y = p.getY(i), X = k.x + x * cy - z * sy, Z = k.z + x * sy + z * cy;
    p.setXYZ(i, X, y0 + (y > 0 ? y * hy : y * k.r * .6), Z); soil[i] = soilY(X, Z); }
  // drop the part buried well below the substrate
  const idx0 = geo.index.array, keep = [];
  for (let i = 0; i < idx0.length; i += 3) if ([0, 1, 2].some(e => p.getY(idx0[i + e]) > soil[idx0[i + e]] - .4)) keep.push(idx0[i], idx0[i + 1], idx0[i + 2]);
  geo.setIndex(keep); geo.computeVertexNormals();
  // cavities (vertex sits below the average of its neighbours) get dark, exposed edges wear lighter
  const idx = geo.index.array, sum = new Float32Array(n * 3), cnt = new Float32Array(n), dist = new Float32Array(n);
  for (let i = 0; i < idx.length; i += 3) for (let e = 0; e < 3; e++) { const a = idx[i + e], b = idx[i + (e + 1) % 3];
    for (const [u, v] of [[a, b], [b, a]]) { sum[u * 3] += p.getX(v); sum[u * 3 + 1] += p.getY(v); sum[u * 3 + 2] += p.getZ(v); cnt[u]++;
      dist[u] += Math.hypot(p.getX(v) - p.getX(u), p.getY(v) - p.getY(u), p.getZ(v) - p.getZ(u)); } }
  const nrm = geo.attributes.normal, col = new Float32Array(n * 3), base = new THREE.Color().setHSL(rr(.06, .1), rr(.05, .13), rr(.5, .6));
  const moss = new THREE.Color().setHSL(.24, .5, .28), lichen = new THREE.Color().setHSL(.2, .12, .74), dirt = new THREE.Color().setHSL(.07, .3, .2), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (!cnt[i]) continue;
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ny = nrm.getY(i), above = y - soil[i];
    const cav = ((sum[i * 3] / cnt[i] - x) * nrm.getX(i) + (sum[i * 3 + 1] / cnt[i] - y) * ny + (sum[i * 3 + 2] / cnt[i] - z) * nrm.getZ(i)) / (dist[i] / cnt[i]);
    c.copy(base).multiplyScalar(.86 + fbm(x * .35, y * .35 + k.s, z * .35, 2) * .4);
    c.multiplyScalar(clamp(1 - cav * 5, .5, 1.18) * (1 - crackA[i] * .6));
    const m = sstep(.55, .85, ny) * sstep(-.05, .22, fbm(x * .45 + 9, y * .45, z * .45, 3)) * sstep(.3, 1.2, above);
    c.lerp(moss, m * .85);
    c.lerp(lichen, sstep(.26, .38, fbm(x * .8 + 3, y * .8, z * .8 + k.s, 2)) * (1 - m) * .45);
    c.lerp(dirt, (1 - sstep(0, .6, above)) * .5).multiplyScalar(lerp(.5, 1, sstep(-.1, .9, above)));
    c.convertSRGBToLinear(); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, rockMat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  // walkable height grid: rasterise every triangle from above (max height per cell)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < n; i++) if (cnt[i] && p.getY(i) > soil[i] - .3) { x0 = Math.min(x0, p.getX(i)); x1 = Math.max(x1, p.getX(i)); z0 = Math.min(z0, p.getZ(i)); z1 = Math.max(z1, p.getZ(i)); }
  const cs = .07; x0 -= cs * 3; z0 -= cs * 3;
  const gw = Math.ceil((x1 - x0) / cs) + 4, gd = Math.ceil((z1 - z0) / cs) + 4, H = new Float32Array(gw * gd).fill(-1e9);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], e = idx[i + 2], ax = p.getX(a), az = p.getZ(a), bx = p.getX(b), bz = p.getZ(b), ex = p.getX(e), ez = p.getZ(e);
    const den = (bz - ez) * (ax - ex) + (ex - bx) * (az - ez); if (Math.abs(den) < 1e-9) continue;
    const ia = Math.max(0, Math.ceil((Math.min(ax, bx, ex) - x0) / cs)), ib = Math.min(gw - 1, Math.floor((Math.max(ax, bx, ex) - x0) / cs));
    const ja = Math.max(0, Math.ceil((Math.min(az, bz, ez) - z0) / cs)), jb = Math.min(gd - 1, Math.floor((Math.max(az, bz, ez) - z0) / cs));
    for (let gj = ja; gj <= jb; gj++) for (let gi = ia; gi <= ib; gi++) {
      const px = x0 + gi * cs, pz = z0 + gj * cs, w0 = ((bz - ez) * (px - ex) + (ex - bx) * (pz - ez)) / den, w1 = ((ez - az) * (px - ex) + (ax - ex) * (pz - ez)) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
      const hy2 = w0 * p.getY(a) + w1 * p.getY(b) + w2 * p.getY(e), o = gj * gw + gi; if (hy2 > H[o]) H[o] = hy2;
    }
  }
  // near-vertical faces cover almost no cell centres: splat their vertices too so steep walls keep their height
  for (let i = 0; i < n; i++) if (cnt[i]) { const gi = Math.round((p.getX(i) - x0) / cs), gj = Math.round((p.getZ(i) - z0) / cs);
    if (gi >= 0 && gj >= 0 && gi < gw && gj < gd) { const o = gj * gw + gi; if (p.getY(i) > H[o]) H[o] = p.getY(i); } }
  for (let gj = 0; gj < gd; gj++) for (let gi = 0; gi < gw; gi++) { const o = gj * gw + gi; H[o] = Math.max(H[o], soilY(x0 + gi * cs, z0 + gj * cs)); }
  k.grid = { x0, z0, cs, w: gw, d: gd, H };
});

/* ---------- hollow log hide ---------- */
// half-buried hollow log: fissured bark outside, rotten fibrous heartwood inside, weathered end grain on both cut ends
const LOG_RI = LOG.R - 1.05;                                   // inner (rotted-out) radius
{
  const g = new THREE.Group(), R = LOG.R, len = LOG.len, t0 = -.18, tl = Math.PI + .36, Ri = LOG_RI;
  const barkR = (th, y) => R + Math.pow(Math.abs(PERLIN.noise(th * 7, y * .08, .5)), .6) * .38 + fbm(th * 2, y * .15, 3) * .5 + Math.pow(Math.abs(y) / (len / 2), 6) * .25;
  const innerR = (th, y) => Ri + fbm(th * 3, y * .2, 9) * .35;
  const cutY = (th, end) => end * (len / 2) + fbm(th * 1.7, end * 3, 5) * .35;   // ends are not a perfect saw cut
  const outer = new THREE.CylinderGeometry(R, R, len, 128, 60, true, t0, tl), op = outer.attributes.position;
  for (let i = 0; i < op.count; i++) {
    const x = op.getX(i), y = op.getY(i), z = op.getZ(i), th = Math.atan2(x, z), end = Math.abs(y) > len / 2 - 1e-3 ? Math.sign(y) : 0;
    const yy = end ? cutY(th, end) : y, s = barkR(th, yy) / R; op.setX(i, x * s); op.setZ(i, z * s); op.setY(i, yy);
  }
  outer.computeVertexNormals();
  { // weathering: damp and dark where it touches the soil, silver-grey where it dries on top, moss and lichen in patches
    const col = [], moss = new THREE.Color(.16, .24, .05), grey = new THREE.Color(1.25, 1.2, 1.12);
    for (let i = 0; i < op.count; i++) {
      const x = op.getX(i), y = op.getY(i), z = op.getZ(i), th = Math.atan2(x, z), up = Math.sin(th), c = new THREE.Color(.95, .9, .86);
      c.multiplyScalar(lerp(.5, 1, clamp(up / .4, 0, 1)));
      c.lerp(grey, clamp((fbm(th * 2.2, y * .12, 21) + .05) * 2.5, 0, 1) * clamp(up * 1.4 - .3, 0, 1) * .6);
      c.lerp(moss, clamp((fbm(th * 3, y * .18, 7) - .02) * 4, 0, 1) * clamp((up - .45) * 2.5, 0, 1) * .85);
      col.push(c.r, c.g, c.b);
    }
    outer.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const bark = track(new THREE.MeshStandardMaterial({ map: BARK.map, normalMap: BARK.normalMap, normalScale: new V2(1.8, 1.8), roughness: .93, vertexColors: true }), .45);
  bark.map.repeat.set(1, 1); bark.normalMap.repeat.set(1, 1);
  const om = new THREE.Mesh(outer, bark); om.castShadow = om.receiveShadow = true;
  const inner = new THREE.CylinderGeometry(Ri, Ri, len, 96, 30, true, t0, tl), ip = inner.attributes.position;
  for (let i = 0; i < ip.count; i++) { const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i), th = Math.atan2(x, z), end = Math.abs(y) > len / 2 - 1e-3 ? Math.sign(y) : 0;
    const yy = end ? cutY(th, end) : y, s = innerR(th, yy) / Ri; ip.setX(i, x * s); ip.setZ(i, z * s); ip.setY(i, yy); }
  inner.computeVertexNormals();
  const woodMat = track(new THREE.MeshStandardMaterial({ map: WOOD.map, normalMap: WOOD.normalMap, normalScale: new V2(1.3, 1.3), color: 0xc9b6a0, roughness: .96, side: THREE.BackSide }), .9);
  woodMat.map.repeat.set(2, 1.5); woodMat.normalMap.repeat.set(2, 1.5);
  const im = new THREE.Mesh(inner, woodMat); im.receiveShadow = true; im.castShadow = true;
  const endMat = track(new THREE.MeshStandardMaterial({ map: ENDGRAIN.map, normalMap: ENDGRAIN.normalMap, normalScale: new V2(1.2, 1.2), roughness: .88, side: THREE.DoubleSide }), .35);
  const ends = [1, -1].map(end => {
    // ring in its own XY plane; after rotation.x = PI/2 local (X, Y, Z) → cylinder (X, -Z, Y)
    const rg = new THREE.RingGeometry(Ri, R + .25, 128, 5, Math.PI / 2 - t0 - tl, tl), uv = rg.attributes.uv, pp = rg.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const X = pp.getX(i), Y = pp.getY(i), r = Math.hypot(X, Y), th = Math.atan2(X, Y), f = clamp((r - Ri) / (R + .25 - Ri), 0, 1);
      const yc = cutY(th, end), rr = lerp(innerR(th, yc), barkR(th, yc), f), ux = X / r, uy = Y / r;
      pp.setXYZ(i, ux * rr, uy * rr, -yc);
      const q = (ENDGRAIN_R0 + f * (ENDGRAIN_R1 - ENDGRAIN_R0)) / 1024; uv.setXY(i, .5 + ux * q, .5 + uy * q);
    }
    rg.computeVertexNormals();
    const m = new THREE.Mesh(rg, endMat); m.rotation.x = Math.PI / 2; m.castShadow = m.receiveShadow = true;
    return m;
  });
  // cylinder axis Y → lay along X; arch opens downward
  const inner0 = new THREE.Group(); inner0.add(om, im, ...ends); inner0.rotation.z = Math.PI / 2;
  g.add(inner0);
  g.position.set(LOG.c.x, soilY(LOG.c.x, LOG.c.z) - 1.05, LOG.c.z); g.rotation.y = -LOG.ang;
  scene.add(g);
  // burrow mouth under the log: dark pit that fades into the soil, lined with a sheet of silk
  const holeTex = (() => { const c = cnv(128, 128), q = c.getContext('2d'), gr = q.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.45, 'rgba(0,0,0,.95)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(3, 40), new THREE.MeshBasicMaterial({ color: 0x010101, alphaMap: holeTex, transparent: true, depthWrite: false }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(BURROW.x, soilY(BURROW.x, BURROW.z) + .05, BURROW.z); scene.add(hole);
  const silk = new THREE.Mesh(new THREE.RingGeometry(1.6, 4.4, 48), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, transparent: true, opacity: .12, roughness: .5, depthWrite: false }));
  silk.rotation.x = -Math.PI / 2; silk.position.copy(hole.position).y += .06; scene.add(silk);
}

/* ---------- water dish (carved stone) ---------- */
let water;
{
  const pts = [[0, .05], [3.4, .05], [4.1, .3], [4.5, .9], [4.45, 1.35], [4.1, 1.5], [3.75, 1.3], [3.45, .55], [0, .45]].map(([r, y]) => new V2(r, y));
  const g = new THREE.LatheGeometry(pts, 72), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), s = 1 + fbm(x * .5, p.getY(i), z * .5) * .06; p.setX(i, x * s); p.setZ(i, z * s); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, track(new THREE.MeshStandardMaterial({ map: ROCK.map, normalMap: ROCK.normalMap, color: 0x9a9088, roughness: .75 }), .6));
  m.position.set(dishPos.x, DISH_Y, dishPos.z); m.castShadow = m.receiveShadow = true; scene.add(m);
  // water: a tinted absorbing layer (you still see the dish floor) plus a reflection-only surface with slow ripples
  const tint = new THREE.Mesh(new THREE.CircleGeometry(3.75, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x08110f).convertSRGBToLinear(), transparent: true, opacity: .74, depthWrite: false }));
  tint.rotation.x = -Math.PI / 2; tint.position.set(dishPos.x, m.position.y + 1.14, dishPos.z); scene.add(tint);
  water = new THREE.Mesh(new THREE.CircleGeometry(3.75, 64), track(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: .04, metalness: 0, normalMap: RIPPLE_TEX, normalScale: new V2(.05, .05), clearcoat: 1, clearcoatRoughness: .02, reflectivity: 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 2.6));
  water.rotation.x = -Math.PI / 2; water.position.set(dishPos.x, m.position.y + 1.15, dishPos.z); water.renderOrder = 2; scene.add(water);
}

/* ---------- collision sets ---------- */
// the log is not a circle obstacle: game.js treats it as an oriented box whose hollow is an open channel (logLocal / logWorld)
const obstacles = [{ x: dishPos.x, z: dishPos.z, r: 4.8 }];
const preyObs = ROCKS.concat([{ x: dishPos.x, z: dishPos.z, r: 4.3, h: 1.5 }]);
const logLocal = (x, z) => { const rx = x - LOG.c.x, rz = z - LOG.c.z; return { al: rx * LOG.a.x + rz * LOG.a.z, sd: -rx * LOG.a.z + rz * LOG.a.x }; };
const logWorld = (al, sd) => new V3(LOG.c.x + LOG.a.x * al - LOG.a.z * sd, 0, LOG.c.z + LOG.a.z * al + LOG.a.x * sd);

/* ---------- plants ---------- */
// r128 shadow maps ignore map alpha, so cut-out foliage needs its own depth material or it casts square shadows
const cutoutDepth = (tex, cut) => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: cut });
const dummy = new THREE.Object3D(); dummy.rotation.order = 'YXZ';
const inTank = (x, z, m) => Math.abs(x) < TW / 2 - (m || 1) && Math.abs(z) < TD / 2 - (m || 1);
const underLog = (x, z) => { const rel = new V3(x - LOG.c.x, 0, z - LOG.c.z), al = rel.dot(LOG.a); return Math.abs(al) < LOG.len / 2 + 1 && Math.abs(rel.x * -LOG.a.z + rel.z * LOG.a.x) < LOG.R + 1.2; };
// true when (x, z) or anything within `pad` of it is up on a rock
const onRock = (x, z, pad) => { pad = pad || 0; return [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad]].some(([dx, dz]) => groundY(x + dx, z + dz) > soilY(x + dx, z + dz) + .08); };
const clearSpot = (x, z) => inTank(x, z) && !underLog(x, z) && Math.hypot(x - LOG_ENTRY.x, z - LOG_ENTRY.z) > 4 && Math.hypot(x - dishPos.x, z - dishPos.z) > 5.2;

// cushion moss: textured, lumpy base that blends into the soil + a few alpha-tested shells for a fuzzy close-up silhouette
const MOSS = pbr(512, 512, hsl(78, 38, 10), '#303030', (ga, gh, w, h) => {
  for (let i = 0; i < 420; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(10, 34), l = rand(10, 26);   // clumps
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(rand(70, 96), rand(35, 55), l), .8); blob(gh, X, Y, r, '#fff', .45); }); }
  for (let i = 0; i < 12000; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(1.2, 3.4), l = rand(16, 40);   // leafy sprigs
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(rand(68, 100), rand(40, 62), l), .9); blob(gh, X, Y, r, '#fff', .5); }); }
  for (let i = 0; i < 2600; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(.8, 1.8);                  // bright new tips
    wrap(w, h, x, y, r, (X, Y) => blob(ga, X, Y, r, hsl(rand(72, 90), 60, rand(45, 58)), .8)); }
  for (let i = 0; i < 90; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(3, 8);                      // brown dead bits
    wrap(w, h, x, y, r, (X, Y) => blob(ga, X, Y, r, hsl(30, 35, rand(12, 22)), .7)); }
}, 2.4);
{
  const patches = [[15, -16, 7], [27, -2, 4.5], [-4, -17, 6], [-27, 0, 4], [3, 16, 5], [26, 15, 4.5], [-14, 15, 6], [-1, 4, 3], [16, 3, 2.8]];
  const N = 6, H = .3, soilC = new THREE.Color().setHSL(.07, .3, .2).convertSRGBToLinear();
  const shellTex = MOSS_STRANDS.clone(); shellTex.needsUpdate = true;
  // ragged edge: vertex alpha (coverage) × clumpy noise, alpha-tested → irregular tufts instead of a polygon outline
  const edgeTex = (() => { const c = cnv(256, 256), g = c.getContext('2d'); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { const x = Math.random() * 256, y = Math.random() * 256, r = rand(3, 14), v = Math.random() < .5 ? 255 : 60;
      wrap(256, 256, x, y, r, (X, Y) => blob(g, X, Y, r, `rgb(${v},${v},${v})`, .35)); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const baseMat = track(new THREE.MeshStandardMaterial({ map: MOSS.map, normalMap: MOSS.normalMap, normalScale: new V2(1.4, 1.4), vertexColors: true, roughness: .92, alphaMap: edgeTex, alphaTest: .3 }), .25);
  const shellMats = [];
  for (let l = 1; l <= N; l++) { const t = l / N;
    shellMats.push(track(new THREE.MeshStandardMaterial({ map: MOSS.map, color: new THREE.Color(1, 1, 1).multiplyScalar(.75 + t * .5), vertexColors: true, roughness: .9,
      alphaMap: shellTex, alphaTest: .12 + t * .75 }), .25)); }
  patches.forEach(([cx, cz, r], pi) => {
    const size = r * 2.4, n = 64, base = new THREE.PlaneGeometry(size, size, n, n); base.rotateX(-Math.PI / 2);
    const p = base.attributes.position, uv = base.attributes.uv, mask = [], col = [], gy = [], mound = [];
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 4, uv.getY(i) * size / 4);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) + cx, z = p.getZ(i) + cz;
      let m = clamp((1 - Math.hypot(x - cx, z - cz) / r) * 1.8 + fbm(x * .25, pi, z * .25) * 1.6, 0, 1);
      if (!clearSpot(x, z)) m = 0;
      mask.push(m); gy.push(groundY(x, z));
      const e = m * m * (3 - 2 * m);
      mound.push((.1 + (fbm(x * .45, 11, z * .45) + .5) * .3 + Math.abs(PERLIN.noise(x * 1.3, z * 1.3, pi)) * .14) * Math.min(1, e * 1.6));
      const c = new THREE.Color().setHSL(.22 + fbm(x * .2, 4, z * .2) * .1, .45, .5 + fbm(x * .5, 2, z * .5) * .3).convertSRGBToLinear().multiplyScalar(1.5);
      c.lerp(soilC, (1 - clamp(e * 1.6, 0, 1)) * .6); col.push(c.r, c.g, c.b, clamp(e * 1.5, 0, 1)); }
    base.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    const idx = base.index.array, keep = thr => { const out = []; for (let i = 0; i < idx.length; i += 3) if (Math.max(mask[idx[i]], mask[idx[i + 1]], mask[idx[i + 2]]) > thr) out.push(idx[i], idx[i + 1], idx[i + 2]); return out; };
    const layer = (lift, thr, mat) => {
      const g = base.clone(), gp = g.attributes.position; g.setIndex(keep(thr));
      for (let i = 0; i < gp.count; i++) gp.setY(i, gy[i] + .04 + mound[i] + (mask[i] > thr ? lift : 0));
      g.computeVertexNormals(); g.translate(cx, 0, cz);
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = true; scene.add(mesh);
    };
    layer(0, .01, baseMat);
    shellMats.forEach((mat, l) => layer(H * (l + 1) / N, .3, mat));
  });
}
// ferns: arching fronds of serrated pinnae; they sway in the wind and lean away from the spider in the vertex shader
// aRoot = (fern centre xyz, frond length): the further a vertex is from the centre, the more it moves
const FERN_U = { uPush: { value: new THREE.Vector4(0, -1e4, 0, 0) } };
function fernSway(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = TURF_U.uTime; sh.uniforms.uPush = FERN_U.uPush;
    sh.vertexShader = 'attribute vec4 aRoot;\nuniform float uTime;\nuniform vec4 uPush;\n' + sh.vertexShader.replace('#include <project_vertex>', `vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
      #endif
      mvPosition = modelMatrix * mvPosition;
      float fd = clamp(length(mvPosition.xz - aRoot.xz) / aRoot.w, 0.0, 1.2), fk = fd * fd;
      float g = sin(dot(aRoot.xz, vec2(.19, .13)) - uTime * 1.7) * .55 + sin(uTime * 2.3 + aRoot.x) * .25 + .45 + sin(uTime * 5.0 + mvPosition.x * .8 + mvPosition.z * .6) * .1;
      mvPosition.xyz += vec3(.82, 0.0, .57) * (fk * aRoot.w * .07 * g); mvPosition.y -= fk * aRoot.w * .02 * abs(g);
      vec3 pd = mvPosition.xyz - uPush.xyz; float pl = length(pd), pr = uPush.w * 2.2;
      if (pl < pr) mvPosition.xyz += pd / max(pl, 1e-3) * ((pr - pl) * min(fk * 1.5, 1.0));
      mvPosition = viewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'fern';
  return mat;
}
{
  const lg = new THREE.PlaneGeometry(1, .38, 6, 1); lg.translate(.5, 0, 0);
  { const p = lg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -x * x * .12); } }
  lg.rotateX(-Math.PI / 2);
  const ferns = [[24, -15, 9], [-2, -16.5, 8], [-25, 14, 7], [25, 13.5, 6.5], [13, -16.5, 6.5], [-27, -4, 6]];
  const inst = [], stemMat = fernSway(track(new THREE.MeshStandardMaterial({ color: 0x24360f, roughness: .8 }), .25));
  ferns.forEach(([fx, fz, size]) => {
    const by = groundY(fx, fz);
    for (let f = 0; f < 13; f++) {
      const yaw = f / 13 * Math.PI * 2 + rand(-.25, .25), len = size * rand(.65, 1.05), arch = rand(.55, .85), dir = new V2(Math.sin(yaw), Math.cos(yaw));
      const P = t => new V3(fx + dir.x * len * t * .8, by + len * (arch * t - arch * .95 * t * t) + .2, fz + dir.y * len * t * .8);
      const curve = new THREE.CatmullRomCurve3([0, .2, .4, .6, .8, 1].map(P));
      const sg = new THREE.TubeGeometry(curve, 24, .05, 5), rootA = new Float32Array(sg.attributes.position.count * 4);
      for (let i = 0; i < rootA.length; i += 4) rootA.set([fx, by, fz, size], i);
      sg.setAttribute('aRoot', new THREE.BufferAttribute(rootA, 4));
      const stem = new THREE.Mesh(sg, stemMat); stem.castShadow = true; scene.add(stem);
      for (let k = 2; k <= 22; k++) { const t = k / 23, p = P(t); if (!inTank(p.x, p.z, 1.2)) continue;
        const ll = len * .2 * Math.pow(1 - t, .55) + .25;
        [-1, 1].forEach(sd => { const ang = yaw + sd * rand(1.1, 1.35), vx = Math.sin(ang), vz = Math.cos(ang);
          dummy.position.copy(p); dummy.rotation.set(0, Math.atan2(-vz, vx), 0); dummy.rotateZ(-.25 - t * .55); dummy.rotateX(sd * .25); dummy.scale.set(ll, 1, ll); dummy.updateMatrix();
          inst.push([dummy.matrix.clone(), new THREE.Color().setHSL(rand(.22, .28), rand(.4, .58), .22 + t * .12 + rand(0, .05)).convertSRGBToLinear(), [fx, by, fz, size]]); }); }
    }
  });
  const fm = new THREE.InstancedMesh(lg, fernSway(track(new THREE.MeshStandardMaterial({ map: PINNA_TEX, alphaTest: .45, side: THREE.DoubleSide, roughness: .55, emissive: 0x050a02 }), .35)), inst.length);
  const rootI = new Float32Array(inst.length * 4); inst.forEach(([, , r], i) => rootI.set(r, i * 4)); lg.setAttribute('aRoot', new THREE.InstancedBufferAttribute(rootI, 4));
  inst.forEach(([m, c], i) => { fm.setMatrixAt(i, m); fm.setColorAt(i, c); }); fm.castShadow = fm.receiveShadow = true; fm.customDepthMaterial = cutoutDepth(PINNA_TEX, .45); scene.add(fm);
}
/* ---------- soft foliage: leaves part around whatever walks through them and spring back ----------
   Every leaf is an instance pivoting on its base. Its tip offset D (world space) is a near-critically damped spring (c ≈ 1.4·√k); sphere colliders
   (spider body and leg joints, prey) shove it aside, the tip stays on a sphere of the leaf's length around the base and
   above the ground. The vertex shader bends the blade by D along a cantilever profile (base stiff, tip free). */
const foliage = [];
const TURF_U = { uTime: { value: 0 } };
// gpuWind: gusts roll across the field as waves, computed per vertex in world space (cheap for tens of thousands of blades)
function bendable(mat, gpuWind) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute vec3 aBend;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfloat fT = clamp(uv.y, 0.0, 1.0);\ntransformed += aBend * (fT * fT * (3.0 - fT) * .5);');
    if (gpuWind) {
      sh.uniforms.uTime = TURF_U.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>', `vec4 mvPosition = instanceMatrix * vec4( transformed, 1.0 );
        vec2 ip = instanceMatrix[3].xz; float bh = length(instanceMatrix[1].xyz);
        float gust = sin(dot(ip, vec2(.19, .13)) - uTime * 1.7) * .55 + sin(dot(ip, vec2(-.09, .27)) * 1.6 - uTime * 2.6) * .25 + sin(ip.x * 1.9 + ip.y * 2.3 - uTime * 4.1) * .08 + .45;
        float wk = fT * fT * bh * .22 * gust;
        mvPosition.xyz += vec3(.82, 0.0, .57) * wk; mvPosition.y -= wk * wk * .6 / max(bh, .1);
        mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 geometryNormal = normal;');
    }
  };
  mat.customProgramCacheKey = () => gpuWind ? 'bendable-wind' : 'bendable';
  return mat;
}
// list: [{ m: Matrix4, c: Color, g: clump id }] grouped by clump; tip / mid / low: leaf points in geometry space (uv.y = 1 / .6 / .35)
function addFoliage(geo, mat, depthMat, list, o) {
  const n = list.length, mesh = new THREE.InstancedMesh(geo, bendable(mat, o.gpuWind), n);
  const bend = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); bend.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aBend', bend);
  const L = [], clumps = [];
  list.forEach(({ m, c, g }, i) => {
    mesh.setMatrixAt(i, m); mesh.setColorAt(i, c);
    const base = new V3().setFromMatrixPosition(m), tip = o.tip.clone().applyMatrix4(m), mid = o.mid.clone().applyMatrix4(m), low = o.low.clone().applyMatrix4(m);
    L.push({ base, tip, mid, low, len: tip.distanceTo(base), inv: new THREE.Matrix3().setFromMatrix4(m).invert(), D: new V3(), V: new V3(), ph: Math.random() * 6.28 });
    if (!clumps.length || clumps[clumps.length - 1].g !== g) clumps.push({ g, i0: i, i1: i, box: new THREE.Box3() });
    const cl = clumps[clumps.length - 1]; cl.i1 = i + 1; cl.box.expandByPoint(base).expandByPoint(tip);
  });
  clumps.forEach(cl => cl.box.expandByScalar(.6));
  mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = bendable(depthMat, o.gpuWind); mesh.frustumCulled = false; scene.add(mesh);
  foliage.push({ mesh, bend, L, clumps, k: o.k, c: o.c, wind: o.wind, gpu: !!o.gpuWind });
}
const _fp = new V3(), _fq = new V3(), _fo = new V3(), FWIND = new V3(.8, 0, .55).normalize();
// cols: flat [x, y, z, r, ...] spheres
function updateFoliage(dt, cols) {
  dt = clamp(dt, 1e-3, 1 / 30);
  const now = performance.now() / 1000, pad = .1; TURF_U.uTime.value = now;
  if (cols.length) FERN_U.uPush.value.set(cols[0], cols[1], cols[2], cols[3]);   // first collider = spider body
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let j = 0; j < cols.length; j += 4) { const r = cols[j + 3]; x0 = Math.min(x0, cols[j] - r); x1 = Math.max(x1, cols[j] + r); y0 = Math.min(y0, cols[j + 1] - r); y1 = Math.max(y1, cols[j + 1] + r); z0 = Math.min(z0, cols[j + 2] - r); z1 = Math.max(z1, cols[j + 2] + r); }
  const push = (l, rest, w) => { // move the leaf point (rest + D·w) out of every collider it is inside
    for (let j = 0; j < cols.length; j += 4) {
      _fp.copy(rest).addScaledVector(l.D, w); const dx = _fp.x - cols[j], dy = _fp.y - cols[j + 1], dz = _fp.z - cols[j + 2], rr = cols[j + 3] + pad, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-3, pen = Math.min((rr - d) / w, l.len * .2); l.D.x += dx / d * pen; l.D.y += dy / d * pen; l.D.z += dz / d * pen;   // capped per frame so a brush near the base can't fling the tip
    } };
  for (const f of foliage) {
    const A = f.bend.array, damp = Math.exp(-f.c * dt); let dirty = !f.gpu;
    for (const cl of f.clumps) {
      const b = cl.box, hit = cols.length && b.min.x < x1 && b.max.x > x0 && b.min.y < y1 && b.max.y > y0 && b.min.z < z1 && b.max.z > z0;
      if (f.gpu) { if (!hit && !cl.active) continue; cl.active = false; dirty = true; }   // wind is in the shader: only touched clumps need work
      for (let i = cl.i0; i < cl.i1; i++) {
        const l = f.L[i];
        if (hit || l.V.lengthSq() + l.D.lengthSq() > 1e-8) {
          _fq.copy(l.D);
          l.V.addScaledVector(l.D, -f.k * dt).multiplyScalar(damp); l.D.addScaledVector(l.V, dt);
          if (hit) { push(l, l.tip, 1); push(l, l.mid, .43); push(l, l.low, .16); }   // cantilever weights at uv.y 1 / .6 / .35
          // the leaf swings around its base: keep the tip at leaf length, and out of the ground (never above its rest height,
          // so tips that droop into the soil don't get snapped up and launched)
          _fo.copy(l.tip).add(l.D).sub(l.base).setLength(l.len).add(l.base);
          const g = Math.min(groundY(_fo.x, _fo.z) + .05, l.tip.y); if (_fo.y < g) _fo.y = g;
          l.D.subVectors(_fo, l.tip);
          const vm = l.len * 2; l.V.subVectors(l.D, _fq).divideScalar(dt); if (l.V.lengthSq() > vm * vm) l.V.setLength(vm);
          if (l.V.lengthSq() + l.D.lengthSq() < 1e-8) { l.V.set(0, 0, 0); l.D.set(0, 0, 0); }
        }
        if (f.gpu) { if (l.D.lengthSq() > 0) cl.active = true; _fp.copy(l.D).applyMatrix3(l.inv); A[i * 3] = _fp.x; A[i * 3 + 1] = _fp.y; A[i * 3 + 2] = _fp.z; continue; }
        const s = f.wind * l.len * (Math.sin(now * 1.6 + l.base.x * .37 + l.base.z * .23 + l.ph * .3) * .6 + Math.sin(now * 2.7 + l.base.z * .5 + l.ph) * .4);
        _fp.copy(l.D).addScaledVector(FWIND, s).applyMatrix3(l.inv); A[i * 3] = _fp.x; A[i * 3 + 1] = _fp.y; A[i * 3 + 2] = _fp.z;
      }
    }
    if (dirty) f.bend.needsUpdate = true;
  }
}
// clump sites: open soil, off the rocks, away from the log mouth, the dish and each other
const plantSites = (() => {
  const R = seeded(4242), out = [];
  for (let k = 0; k < 4000 && out.length < 24; k++) {
    const x = -TW / 2 + 3 + R() * (TW - 6), z = -TD / 2 + 3 + R() * (TD - 6);
    if (!clearSpot(x, z) || onRock(x, z, 1.6) || Math.hypot(x - dishPos.x, z - dishPos.z) < 7 || out.some(p => Math.hypot(p[0] - x, p[1] - z) < 5.2)) continue;
    out.push([x, z]);
  }
  return out;
})();
// sedge tufts: thin blades
{
  const bg = new THREE.PlaneGeometry(.2, 1, 1, 6); bg.translate(0, .5, 0);
  { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * .92)); p.setZ(i, y * y * .5); } bg.computeVertexNormals(); }
  const tufts = [[20, -5], [-10, 9], [8, 17], [-22, -17], [27, 6], [-3, -9], [13, 13], [-27, 5], [20, -17], [-15, -1], [4, -15], [-20, 17]];
  const list = [];
  tufts.forEach(([tx, tz], g) => { if (g % 2 || !clearSpot(tx, tz) || onRock(tx, tz, 1)) return; for (let b = 0; b < 22; b++) { const x = tx + gauss() * .7, z = tz + gauss() * .7;
    dummy.position.set(x, groundY(x, z) - .1, z); dummy.rotation.set(rand(-.4, .4), rand(0, 6.3), rand(-.4, .4)); const h = rand(2.2, 5.5); dummy.scale.set(1, h, h * .7); dummy.updateMatrix();
    list.push({ m: dummy.matrix.clone(), c: new THREE.Color().setHSL(rand(.2, .26), rand(.35, .6), rand(.45, .7)).convertSRGBToLinear(), g }); } });
  addFoliage(bg, track(new THREE.MeshStandardMaterial({ map: BLADE_TEX, side: THREE.DoubleSide, roughness: .7 }), .3),
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), list, { tip: new V3(0, 1, .5), mid: new V3(0, .6, .18), low: new V3(0, .35, .06), k: 60, c: 10, wind: .025 });
}
// leafy clumps: broad arching straps (like lilyturf / spider plant) and round-leaved rosettes (like pilea / peperomia)
const STRAP_TEX = alphaShape(64, 512, (g, w, h) => {
  const half = t => w * .48 * Math.min(1, Math.pow(t / .1, .6)) * Math.pow(1 - Math.max(0, t - .55) / .45, .75);   // t: 0 base → 1 tip
  g.beginPath(); for (let k = 0; k <= 60; k++) { const t = k / 60; g.lineTo(w / 2 - half(t), h * (1 - t)); } for (let k = 60; k >= 0; k--) { const t = k / 60; g.lineTo(w / 2 + half(t), h * (1 - t)); } g.closePath();
  const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#c9d49a'); gr.addColorStop(.12, '#6f9a3c'); gr.addColorStop(.7, '#4f7f2a'); gr.addColorStop(.97, '#6b7a33'); gr.addColorStop(1, '#8a7a45');
  g.fillStyle = gr; g.fill(); g.save(); g.clip();
  for (let k = 0; k < 7; k++) { const x = w * (.14 + k * .12); g.strokeStyle = k === 3 ? 'rgba(220,235,170,.55)' : 'rgba(190,215,140,.22)'; g.lineWidth = k === 3 ? 2.5 : 1; g.beginPath(); g.moveTo(x, h); g.lineTo(w / 2 + (x - w / 2) * .1, 0); g.stroke(); }
  for (let i = 0; i < 70; i++) blob(g, Math.random() * w, Math.random() * h, rand(3, 10), hsl(rand(80, 100), 40, rand(20, 40)), .12);
  g.restore(); g.strokeStyle = 'rgba(40,60,20,.6)'; g.lineWidth = 1.5; g.stroke();
});
const OVAL_TEX = alphaShape(256, 512, (g, w, h) => {
  const y0 = h * .64, cx = w / 2, bw = w * .46, top = h * .03, bl = y0 - top;                // blade from y0 (base) up to the tip
  g.strokeStyle = '#6f8f3a'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx, h - 2); g.lineTo(cx, y0 - 10); g.stroke();   // petiole
  g.beginPath(); g.moveTo(cx, y0); g.bezierCurveTo(cx + bw * 1.25, y0 - bl * .05, cx + bw * 1.1, top + bl * .1, cx, top); g.bezierCurveTo(cx - bw * 1.1, top + bl * .1, cx - bw * 1.25, y0 - bl * .05, cx, y0); g.closePath();
  const gr = g.createRadialGradient(cx, y0 - bl * .45, 10, cx, y0 - bl * .45, bl * .7); gr.addColorStop(0, '#4f8a34'); gr.addColorStop(1, '#2f5a22'); g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(200,230,150,.55)'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx, y0); g.quadraticCurveTo(cx + 4, top + bl * .5, cx, top); g.stroke();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(190,225,140,.35)';
  for (let k = 1; k < 8; k++) { const y = y0 - bl * k / 8.5; [-1, 1].forEach(s => { g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + s * bw * .45, y - bl * .02, cx + s * bw * .85, y - bl * .12); g.stroke(); }); }
  for (let i = 0; i < 120; i++) blob(g, Math.random() * w, rand(top, y0), rand(4, 14), hsl(rand(90, 110), 40, rand(18, 34)), .12);
  g.restore(); g.strokeStyle = 'rgba(30,50,15,.7)'; g.lineWidth = 2; g.stroke();
});
{
  const leafGeo = (segX, arch, fold, cup) => { const g = new THREE.PlaneGeometry(1, 1, segX, 12); g.translate(0, .5, 0); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setY(i, y - arch * .45 * y * y * y); p.setZ(i, arch * y * y + Math.abs(x) * fold + x * x * cup * sstep(.35, .6, y)); }
    g.computeVertexNormals(); return g; };
  const R = seeded(777), rr = (a, b) => a + R() * (b - a);
  const strap = [], oval = []; let si = 0;
  plantSites.forEach(([cx, cz], g) => {
    if (g % 3 !== 2) { // strap clump: 26–40 arching leaves, inner ones shorter and more upright
      if (si++ % 3) return;                              // only every third clump: open meadow in between
      const n = 26 + (R() * 14 | 0), size = rr(.8, 1.25), hue = rr(-.02, .03);
      for (let i = 0; i < n; i++) { const x = cx + gauss() * .35, z = cz + gauss() * .35, inner = R();
        dummy.position.set(x, groundY(x, z) - .08, z); dummy.rotation.set(lerp(1, .12, inner) + rr(-.12, .12), rr(0, 6.283), rr(-.15, .15));
        const len = size * lerp(4.8, 2.2, inner) * rr(.75, 1.15); dummy.scale.set(size * rr(.32, .46), len, len * rr(.8, 1.2)); dummy.updateMatrix();
        strap.push({ m: dummy.matrix.clone(), c: new THREE.Color(rr(.7, .92), rr(.78, .98), rr(.62, .82)).offsetHSL(hue, 0, 0), g }); }
    } else {           // rosette bush: leaves on petioles fanning out into a dome
      const n = 34 + (R() * 16 | 0), size = rr(.85, 1.2);
      for (let i = 0; i < n; i++) { const x = cx + gauss() * .25, z = cz + gauss() * .25, up = R();
        dummy.position.set(x, groundY(x, z) - .05, z); dummy.rotation.set(lerp(1.25, .15, up * up) + rr(-.1, .1), rr(0, 6.283), rr(-.25, .25));
        const len = size * rr(1.7, 2.7) * lerp(1.1, .8, up); dummy.scale.set(len * .62, len, len); dummy.updateMatrix();
        oval.push({ m: dummy.matrix.clone(), c: new THREE.Color().setHSL(0, 0, rr(.8, 1.15)).lerp(new THREE.Color(1, .95, .75), R() < .15 ? .3 : 0), g }); }
    }
  });
  const mk = tex => track(new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, roughness: .5, emissive: 0x040802 }), .4);
  addFoliage(leafGeo(2, .55, .18, 0), mk(STRAP_TEX), cutoutDepth(STRAP_TEX, .5), strap, { tip: new V3(0, .75, .55), mid: new V3(0, .55, .2), low: new V3(0, .34, .07), k: 26, c: 7, wind: .03 });
  addFoliage(leafGeo(4, .3, .05, .5), mk(OVAL_TEX), cutoutDepth(OVAL_TEX, .5), oval, { tip: new V3(0, .87, .3), mid: new V3(0, .57, .1), low: new V3(0, .34, .04), k: 40, c: 9, wind: .02 });
}
// meadow: a dense carpet of short blades in broad drifts over the open soil, dark at the root and sunlit yellow-green at the
// tips, with rolling wind waves (GPU) — anything walking through parts it like the other foliage
const TURF_TEX = alphaShape(16, 64, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, '#3a5424'); gr.addColorStop(.3, '#6a9a3c'); gr.addColorStop(.8, '#a6cc5e'); gr.addColorStop(1, '#d4e88e'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
{
  const g = new THREE.PlaneGeometry(.1, 1, 1, 3); g.translate(0, .5, 0);
  { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * .9)); p.setZ(i, y * y * .25); }
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); }   // lit like a lawn, not like cards: every blade shares the sky normal
  const R = seeded(9191), rr = (a, b) => a + R() * (b - a), step = matchMedia('(pointer: coarse)').matches ? .26 : .18, cell = 2.5, list = [];
  for (let x = -TW / 2 + 1.2; x < TW / 2 - 1.2; x += step) for (let z = -TD / 2 + 1.2; z < TD / 2 - 1.2; z += step) {
    const px = x + rr(-.5, .5) * step, pz = z + rr(-.5, .5) * step;
    const m = fbm(px * .075, 3.3, pz * .075) * 2.2 + fbm(px * .3, 5.1, pz * .3) * .5 + .05;   // broad drifts with ragged edges
    if (m < 0 || R() > sstep(0, .3, m) || !clearSpot(px, pz) || onRock(px, pz, .35)) continue;
    const edge = sstep(0, .45, m), h = rr(.45, 1.1) * (.55 + .45 * edge) * (1 + fbm(px * .5, 8, pz * .5) * .5);
    dummy.position.set(px, groundY(px, pz) - .04, pz); dummy.rotation.set(rr(-.35, .35), rr(0, 6.283), rr(-.35, .35)); dummy.scale.set(rr(.8, 1.25), h, h); dummy.updateMatrix();
    const tone = fbm(px * .12, 9.7, pz * .12), dry = R() < .06;
    list.push({ m: dummy.matrix.clone(), c: new THREE.Color().setHSL(dry ? rr(.12, .15) : .235 + tone * .09 + rr(-.012, .012), dry ? .4 : .42 + rr(0, .14), dry ? rr(.58, .68) : .47 + tone * .3 + rr(-.05, .05)).convertSRGBToLinear(),
      g: Math.floor((px + TW / 2) / cell) * 100 + Math.floor((pz + TD / 2) / cell) });
  }
  list.sort((a, b) => a.g - b.g);                        // clumps = 2.5-unit cells, so a spider only wakes the blades near it
  addFoliage(g, track(new THREE.MeshStandardMaterial({ map: TURF_TEX, side: THREE.DoubleSide, roughness: .8 }), .3),
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), list, { tip: new V3(0, 1, .25), mid: new V3(0, .6, .09), low: new V3(0, .35, .03), k: 70, c: 11, gpuWind: true });
  foliage[foliage.length - 1].mesh.castShadow = false;   // a carpet this dense would only darken itself; it still receives shadows
}
// dry leaf litter, curled
{
  const g = new THREE.PlaneGeometry(1, 2, 6, 10); g.rotateX(-Math.PI / 2);
  { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, x * x * .5 + Math.pow(Math.max(0, -z - .3), 2) * .5 + Math.sin(z * 3) * .04); } g.computeVertexNormals(); }
  const list = [];
  for (let i = 0; i < 75; i++) { const x = rand(-TW / 2 + 2, TW / 2 - 2), z = rand(-TD / 2 + 2, TD / 2 - 2); if (Math.hypot(x - dishPos.x, z - dishPos.z) < 5 || onRock(x, z, 1.2)) continue;
    { const q = logLocal(x, z); if (Math.abs(q.al) < LOG.len / 2 + 1 && Math.abs(q.sd) > LOG_RI - 1.2 && Math.abs(q.sd) < LOG.R + 1.2) continue; }
    dummy.position.set(x, groundY(x, z) + .05, z); dummy.rotation.set(rand(-.15, .15), rand(0, 6.3), rand(-.15, .15)); dummy.scale.setScalar(rand(1.5, 2.8)); dummy.updateMatrix();
    const fresh = Math.random() < .08;
    list.push([dummy.matrix.clone(), (fresh ? new THREE.Color().setHSL(rand(.16, .22), .3, rand(.26, .34)) : new THREE.Color().setHSL(rand(.05, .09), rand(.25, .45), rand(.16, .34))).convertSRGBToLinear()]); }
  const lm = new THREE.InstancedMesh(g, track(new THREE.MeshStandardMaterial({ map: LEAF_TEX, alphaTest: .5, side: THREE.DoubleSide, roughness: .75 }), .25), list.length);
  list.forEach(([m, c], i) => { lm.setMatrixAt(i, m); lm.setColorAt(i, c); }); lm.castShadow = lm.receiveShadow = true; lm.customDepthMaterial = cutoutDepth(LEAF_TEX, .5); scene.add(lm);
}
// pebbles
{
  const g = new THREE.SphereGeometry(1, 16, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const v = new V3(p.getX(i), p.getY(i), p.getZ(i)); v.multiplyScalar(1 + PERLIN.noise(v.x * 1.3, v.y * 1.3, v.z * 1.3) * .25); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const list = [];
  for (let i = 0; i < 200; i++) { const x = rand(-TW / 2 + 1, TW / 2 - 1), z = rand(-TD / 2 + 1, TD / 2 - 1); if (!clearSpot(x, z)) continue; const s = Math.pow(Math.random(), 2.5) * .4 + .08;
    dummy.position.set(x, groundY(x, z) + s * .1, z); dummy.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6)); dummy.scale.set(s, s * rand(.5, .8), s * rand(.8, 1.2)); dummy.updateMatrix();
    list.push([dummy.matrix.clone(), new THREE.Color().setHSL(rand(.06, .1), rand(.04, .16), rand(.18, .42)).convertSRGBToLinear()]); }
  const pm = new THREE.InstancedMesh(g, track(new THREE.MeshStandardMaterial({ normalMap: ROCK.normalMap, roughness: .55 }), .6), list.length);
  list.forEach(([m, c], i) => { pm.setMatrixAt(i, m); pm.setColorAt(i, c); }); pm.castShadow = pm.receiveShadow = true; scene.add(pm);
}
// twigs
{
  const tb = track(new THREE.MeshStandardMaterial({ map: BARK.map, normalMap: BARK.normalMap, color: 0xb0a090, roughness: .9 }), .3);
  for (let i = 0; i < 16; i++) { const x = rand(-26, 26), z = rand(-17, 17); if (!clearSpot(x, z) || onRock(x, z, 3)) continue;
    const len = rand(5, 11), r = rand(.15, .35), g = new THREE.CylinderGeometry(r * .6, r, len, 8, 6); g.rotateZ(Math.PI / 2);
    { const p = g.attributes.position; for (let j = 0; j < p.count; j++) p.setY(j, p.getY(j) + Math.sin(p.getX(j) * .8 + i) * .12); }
    const m = new THREE.Mesh(g, tb); m.position.set(x, groundY(x, z) + r * .6, z); m.rotation.y = rand(0, 6.3); m.castShadow = m.receiveShadow = true; scene.add(m); }
}

/* ---------- cork background, glass, frame, fixtures, room ---------- */
{
  const g = new THREE.PlaneGeometry(TW - .6, TH + 2, 150, 90), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, (fbm(x * .09, y * .09, 2, 4) + .6) * 2.2 + Math.abs(PERLIN.noise(x * .3, y * .5, 5)) * .6); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, track(new THREE.MeshStandardMaterial({ map: CORK.map, normalMap: CORK.normalMap, normalScale: new V2(1.5, 1.5), roughness: 1 }), .25));
  m.position.set(0, TH / 2 - 1, -TD / 2 + .1); m.receiveShadow = true; m.castShadow = true; scene.add(m);
}
const glassGroup = new THREE.Group(); scene.add(glassGroup);
{
  // glass = reflections only: black base + additive blending, so it never hazes the view (a lit white diffuse at 7% did)
  const gm = track(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: .02, metalness: 0, reflectivity: .6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 1.1);
  [[TW, TH, 0, TH / 2, TD / 2, 0], [TD, TH, -TW / 2, TH / 2, 0, Math.PI / 2], [TD, TH, TW / 2, TH / 2, 0, Math.PI / 2], [TW, TH, 0, TH / 2, -TD / 2 - .05, 0]]
    .forEach(([w, h, x, y, z, r]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm); m.position.set(x, y, z); m.rotation.y = r; m.renderOrder = 5; glassGroup.add(m); });
  const fm = track(new THREE.MeshStandardMaterial({ color: 0x141414, metalness: .85, roughness: .35 }), 1);
  const e = .6, bars = [];
  [-1, 1].forEach(a => [-1, 1].forEach(b => { bars.push([e, TH, e, a * TW / 2, TH / 2, b * TD / 2]); bars.push([TW + e, e, e, 0, b > 0 ? TH : -.2, a * TD / 2]); bars.push([e, e, TD, a * TW / 2, b > 0 ? TH : -.2, 0]); }));
  bars.forEach(([w, h, d, x, y, z]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), fm); m.position.set(x, y, z); scene.add(m); });   // lid lights sit inside the frame: bars cast no shadow
  const base = new THREE.Mesh(new THREE.BoxGeometry(TW + 1.4, 1.8, TD + 1.4), fm); base.position.y = -1.1; base.receiveShadow = true; scene.add(base);
}
const table = new THREE.Mesh(new THREE.PlaneGeometry(260, 160), track(new THREE.MeshStandardMaterial({ map: TABLE.map, normalMap: TABLE.normalMap, roughness: .5, color: 0x9a8a7a }), .45));
table.rotation.x = -Math.PI / 2; table.position.y = -2; table.receiveShadow = true; scene.add(table);
// out-of-focus room lights: soft discs with a slightly brighter rim, like a fast lens's bokeh
const roomBokeh = new THREE.Group(); scene.add(roomBokeh);
{
  const disc = (() => { const c = cnv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.72, 'rgba(255,255,255,.62)'); gr.addColorStop(.86, 'rgba(255,255,255,.9)'); gr.addColorStop(.95, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  const cols = [0xffb070, 0xffd9a8, 0xff9a60, 0x9fc6ff, 0xfff0d0];
  for (let i = 0; i < 30; i++) {
    const c = new THREE.Color(cols[i % cols.length]).convertSRGBToLinear().multiplyScalar(rand(.35, 1.1));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: c, transparent: true, opacity: rand(.5, .9), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.position.set(rand(-170, 170), rand(6, 75), rand(-230, -130)); s.scale.setScalar(rand(7, 16)); roomBokeh.add(s);
  }
}
// lid fixtures
const ledBar = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(TW * .82, .9, 3.2), track(new THREE.MeshStandardMaterial({ color: 0x1b1b1d, metalness: .8, roughness: .3 }), 1));
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(TW * .78, 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf3f6ff).multiplyScalar(3) }));
  strip.rotation.x = Math.PI / 2; strip.position.y = -.46; ledBar.add(body, strip); ledBar.userData.strip = strip;
  ledBar.position.set(0, TH + .9, -5); scene.add(ledBar);
}
const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8c3a).multiplyScalar(4) }));
{
  const hood = new THREE.Mesh(new THREE.LatheGeometry([[0, 4.5], [1.2, 4.4], [2.4, 3.6], [3.8, 1.8], [4.6, 0], [4.5, -.1]].map(([r, y]) => new V2(r, y)), 48),
    track(new THREE.MeshStandardMaterial({ color: 0x2a2521, metalness: .9, roughness: .3, side: THREE.DoubleSide }), 1));
  hood.position.set(-14, TH + 1.2, 2); bulb.position.set(-14, TH + 2, 2); scene.add(hood, bulb);
}

/* ---------- lights ---------- */
// intensities here are the daytime targets; game.js blends them for night / switches (LIGHT_BASE)
const LIGHT_BASE = { led: 2.3, lamp: 3.4, hemi: .3, moon: .34, rim: .4 };
const hemi = new THREE.HemisphereLight(0xd6e0ff, 0x3a2414, LIGHT_BASE.hemi); scene.add(hemi);
// full-spectrum LED bar in the lid: cool key light from above with soft-edged shadows
const led = new THREE.DirectionalLight(0xf3f6ff, LIGHT_BASE.led);
led.position.set(4, 70, 12); led.target.position.set(0, 0, -2);
led.castShadow = true; led.shadow.mapSize.set(2048, 2048); led.shadow.bias = -.0003; led.shadow.normalBias = .04;
Object.assign(led.shadow.camera, { left: -34, right: 34, top: 26, bottom: -26, near: 30, far: 100 });
scene.add(led, led.target);
// ceramic heat lamp: warm pool of light over the log, falls off softly
const lamp = new THREE.SpotLight(0xff8a40, LIGHT_BASE.lamp, 80, Math.PI / 5, 1, 1.5);
lamp.position.set(-14, TH + 1.4, 2); lamp.target.position.set(-14, 0, -2); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -.0004; lamp.shadow.normalBias = .03;
lamp.shadow.camera.near = 8; lamp.shadow.camera.far = 60;
scene.add(lamp, lamp.target);
const lampGlow = new THREE.PointLight(0xff7a30, 0, 14, 2); lampGlow.position.set(-14, TH + 1, 2); scene.add(lampGlow);   // lights the hood and the glass top
const moon = new THREE.DirectionalLight(0x7d98d8, 0); moon.position.set(-40, 50, 30); scene.add(moon);
const rim = new THREE.DirectionalLight(0xffdcb4, LIGHT_BASE.rim); rim.position.set(10, 22, -70); scene.add(rim);

/* dust motes in the beam */
const dustN = 320, dust = (() => { const g = new THREE.BufferGeometry(), a = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { a[i * 3] = rand(-TW / 2, TW / 2); a[i * 3 + 1] = rand(2, TH); a[i * 3 + 2] = rand(-TD / 2, TD / 2); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff1d6, size: .14, transparent: true, opacity: .4, depthWrite: false })); })();
scene.add(dust);

function applyEnv(level) { envMats.forEach(m => { m.envMapIntensity = m.userData.env * level; }); }
