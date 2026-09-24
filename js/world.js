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

/* granite-like stone */
const ROCK = pbr(512, 512, hsl(30, 7, 40), '#808080', (ga, gh, w, h) => {
  for (let i = 0; i < 26000; i++) { const x = Math.random() * w, y = Math.random() * h, v = rand(22, 62);
    ga.fillStyle = hsl(rand(20, 40), rand(4, 12), v, rand(.25, .7)); ga.fillRect(x, y, rand(1, 3), rand(1, 3));
    gh.fillStyle = `rgba(${v * 3 | 0},${v * 3 | 0},${v * 3 | 0},.35)`; gh.fillRect(x, y, 2, 2); }
  for (let i = 0; i < 1600; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(1, 3), t = Math.random();
    const c = t < .4 ? '#1c1a18' : t < .8 ? '#d8d2c8' : '#b89484'; wrap(w, h, x, y, r, (X, Y) => blob(ga, X, Y, r, c, .8)); }
  for (let i = 0; i < 30; i++) { let x = Math.random() * w, y = Math.random() * h, a = rand(0, 6.3);
    ga.strokeStyle = 'rgba(20,16,12,.55)'; gh.strokeStyle = '#000'; ga.lineWidth = gh.lineWidth = rand(.8, 2);
    ga.beginPath(); gh.beginPath(); ga.moveTo(x, y); gh.moveTo(x, y);
    for (let k = 0; k < 10; k++) { a += rand(-.7, .7); x += Math.cos(a) * 9; y += Math.sin(a) * 9; ga.lineTo(x, y); gh.lineTo(x, y); } ga.stroke(); gh.stroke(); }
  for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, r = rand(4, 14);
    wrap(w, h, x, y, r, (X, Y) => { blob(ga, X, Y, r, hsl(rand(60, 90), 18, rand(55, 70)), .55); blob(gh, X, Y, r, '#fff', .3); }); }
}, 3.2);

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
const ROCKS = [{ x: 6, z: -9, r: 5.4, h: 4.6, s: 1 }, { x: -4, z: 12, r: 3.3, h: 2.1, s: 2 }, { x: 24, z: -11, r: 4.2, h: 3.4, s: 3 },
               { x: -26, z: 10, r: 3, h: 2.3, s: 4 }, { x: 12, z: -2, r: 2.5, h: 1.5, s: 5 }, { x: -8, z: 3, r: 2, h: 1.2, s: 6 }];
ROCKS.forEach(k => k.base = soilY(k.x, k.z) - .45);
function rockY(k, x, z) {
  const dx = x - k.x, dz = z - k.z, a = Math.atan2(dz, dx);
  const rr = k.r * (1 + .2 * PERLIN.noise(Math.cos(a) * 1.2 + k.s * 3, Math.sin(a) * 1.2, k.s));
  const q = Math.hypot(dx, dz) / rr; if (q >= 1) return -1e9;
  const dome = Math.pow(1 - q * q, .5);
  return k.base + k.h * dome * (1 + fbm(x * .35, k.s * 5, z * .35, 2) * .35) + PERLIN.noise(x * 1.4, z * 1.4, k.s) * .12 * dome;
}
function groundY(x, z) {
  let y = soilY(x, z);
  for (const k of ROCKS) if (Math.abs(x - k.x) < k.r * 1.3 && Math.abs(z - k.z) < k.r * 1.3) y = Math.max(y, rockY(k, x, z));
  return y;
}
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
const rockMat = track(new THREE.MeshStandardMaterial({ map: ROCK.map, normalMap: ROCK.normalMap, normalScale: new V2(1.4, 1.4), vertexColors: true, roughness: .82 }), .5);
ROCKS.forEach(k => {
  const n = 96, geo = new THREE.PlaneGeometry(k.r * 2.8, k.r * 2.8, n, n); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) + k.x, z = p.getZ(i) + k.z; const y = rockY(k, x, z); p.setY(i, y > -1e8 ? y : soilY(x, z) - 1); }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + k.x, z = p.getZ(i) + k.z, top = (p.getY(i) - k.base) / k.h;
    const c = new THREE.Color().setHSL(.08, .08, .6 + fbm(x * .4, z * .4, k.s) * .25);
    const m = clamp((nrm.getY(i) - .55) * 3, 0, 1) * clamp((top - .35) * 3, 0, 1) * clamp(.5 + fbm(x * .5 + 9, z * .5, k.s) * 2.5, 0, 1);
    c.lerp(new THREE.Color().setHSL(.25, .55, .32), m);                   // moss on damp tops
    c.multiplyScalar(lerp(.55, 1, clamp(top * 2.5, 0, 1)));              // contact shade at the base
    c.convertSRGBToLinear(); col.push(c.r, c.g, c.b);
  }
  geo.translate(k.x, 0, k.z); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k.r * .5, uv.getY(i) * k.r * .5);
  const m = new THREE.Mesh(geo, rockMat); m.castShadow = m.receiveShadow = true; scene.add(m);
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
// ferns: arching fronds of serrated pinnae
{
  const lg = new THREE.PlaneGeometry(1, .38, 6, 1); lg.translate(.5, 0, 0);
  { const p = lg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -x * x * .12); } }
  lg.rotateX(-Math.PI / 2);
  const ferns = [[24, -15, 9], [-2, -16.5, 8], [-25, 14, 7], [25, 13.5, 6.5], [13, -16.5, 6.5], [-27, -4, 6]];
  const inst = [], stemMat = track(new THREE.MeshStandardMaterial({ color: 0x24360f, roughness: .8 }), .25);
  ferns.forEach(([fx, fz, size]) => {
    const by = groundY(fx, fz);
    for (let f = 0; f < 13; f++) {
      const yaw = f / 13 * Math.PI * 2 + rand(-.25, .25), len = size * rand(.65, 1.05), arch = rand(.55, .85), dir = new V2(Math.sin(yaw), Math.cos(yaw));
      const P = t => new V3(fx + dir.x * len * t * .8, by + len * (arch * t - arch * .95 * t * t) + .2, fz + dir.y * len * t * .8);
      const curve = new THREE.CatmullRomCurve3([0, .2, .4, .6, .8, 1].map(P));
      const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, .05, 5), stemMat); stem.castShadow = true; scene.add(stem);
      for (let k = 2; k <= 22; k++) { const t = k / 23, p = P(t); if (!inTank(p.x, p.z, 1.2)) continue;
        const ll = len * .2 * Math.pow(1 - t, .55) + .25;
        [-1, 1].forEach(sd => { const ang = yaw + sd * rand(1.1, 1.35), vx = Math.sin(ang), vz = Math.cos(ang);
          dummy.position.copy(p); dummy.rotation.set(0, Math.atan2(-vz, vx), 0); dummy.rotateZ(-.25 - t * .55); dummy.rotateX(sd * .25); dummy.scale.set(ll, 1, ll); dummy.updateMatrix();
          inst.push([dummy.matrix.clone(), new THREE.Color().setHSL(rand(.22, .28), rand(.4, .58), .22 + t * .12 + rand(0, .05)).convertSRGBToLinear()]); }); }
    }
  });
  const fm = new THREE.InstancedMesh(lg, track(new THREE.MeshStandardMaterial({ map: PINNA_TEX, alphaTest: .45, side: THREE.DoubleSide, roughness: .55, emissive: 0x050a02 }), .35), inst.length);
  inst.forEach(([m, c], i) => { fm.setMatrixAt(i, m); fm.setColorAt(i, c); }); fm.castShadow = fm.receiveShadow = true; fm.customDepthMaterial = cutoutDepth(PINNA_TEX, .45); scene.add(fm);
}
// sedge tufts
{
  const bg = new THREE.PlaneGeometry(.2, 1, 1, 6); bg.translate(0, .5, 0);
  { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * .92)); p.setZ(i, y * y * .5); } bg.computeVertexNormals(); }
  const tufts = [[20, -5], [-10, 9], [8, 17], [-22, -17], [27, 6], [-3, -9], [13, 13], [-27, 5], [20, -17], [-15, -1], [4, -15], [-20, 17]];
  const list = [];
  tufts.forEach(([tx, tz]) => { if (!clearSpot(tx, tz)) return; for (let b = 0; b < 22; b++) { const x = tx + gauss() * .7, z = tz + gauss() * .7;
    dummy.position.set(x, groundY(x, z) - .1, z); dummy.rotation.set(rand(-.4, .4), rand(0, 6.3), rand(-.4, .4)); const h = rand(2.2, 5.5); dummy.scale.set(1, h, h * .7); dummy.updateMatrix();
    list.push([dummy.matrix.clone(), new THREE.Color().setHSL(rand(.2, .26), rand(.35, .6), rand(.45, .7)).convertSRGBToLinear()]); } });
  const gm = new THREE.InstancedMesh(bg, track(new THREE.MeshStandardMaterial({ map: BLADE_TEX, side: THREE.DoubleSide, roughness: .7 }), .3), list.length);
  list.forEach(([m, c], i) => { gm.setMatrixAt(i, m); gm.setColorAt(i, c); }); gm.castShadow = true; scene.add(gm);
}
// dry leaf litter, curled
{
  const g = new THREE.PlaneGeometry(1, 2, 6, 10); g.rotateX(-Math.PI / 2);
  { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, x * x * .5 + Math.pow(Math.max(0, -z - .3), 2) * .5 + Math.sin(z * 3) * .04); } g.computeVertexNormals(); }
  const list = [];
  for (let i = 0; i < 110; i++) { const x = rand(-TW / 2 + 2, TW / 2 - 2), z = rand(-TD / 2 + 2, TD / 2 - 2); if (Math.hypot(x - dishPos.x, z - dishPos.z) < 5) continue;
    { const q = logLocal(x, z); if (Math.abs(q.al) < LOG.len / 2 + 1 && Math.abs(q.sd) > LOG_RI - 1.2 && Math.abs(q.sd) < LOG.R + 1.2) continue; }
    dummy.position.set(x, groundY(x, z) + .05, z); dummy.rotation.set(rand(-.15, .15), rand(0, 6.3), rand(-.15, .15)); dummy.scale.setScalar(rand(.7, 1.6)); dummy.updateMatrix();
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
  for (let i = 0; i < 16; i++) { const x = rand(-26, 26), z = rand(-17, 17); if (!clearSpot(x, z)) continue;
    const len = rand(3, 8), r = rand(.07, .18), g = new THREE.CylinderGeometry(r * .6, r, len, 8, 6); g.rotateZ(Math.PI / 2);
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
