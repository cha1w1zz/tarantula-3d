'use strict';
/* =====================================================================
   Pond looks (loaded after look.js): the water hole becomes a murky rain pond in the abandoned town garden.
   world.js owns the basin (soilY), the two water discs (`water` + `water.userData.tint`) and pondR / pondT / inPond / WATER_Y.
   This file only changes how it looks:
     water   dark, soft reflections (a soft cap, so grazing angles never turn white) + a second moving wave layer + sky tint
     tint    murky: thin near the shore (you still see the wet mud), dark in the middle
     shore   wet-mud sheen band, moss cushions, stones, reeds, floating leaves  (+5 draw calls, none cast shadows)
   Nothing solid stands in the water: only flat pebbles on the floor and leaves floating on top.
   ===================================================================== */
const POND = (() => {
  const C = dishPos, R = seeded(4242), rr = (a, b) => a + R() * (b - a), pick = a => a[R() * a.length | 0];
  const lin = h => new THREE.Color(h).convertSRGBToLinear();
  const U = { uTime: { value: 0 }, uSky: { value: new THREE.Color() } };
  const SKY_DAY = lin('#2f3d41'), SKY_NIGHT = lin('#0e1428'), NEON = lin('#3a1636');
  const at = (a, t) => { const r = pondR(a) * t; return [C.x + Math.cos(a) * r, C.z + Math.sin(a) * r]; };   // point at angle a, t × shore radius
  const free = (x, z) => inTank(x, z, 1) && !(typeof CITY !== 'undefined' ? CITY.inside(x, z, .3) : lotInside(x, z, .3)) && !onRock(x, z, .3);

  // time + sky colour for the shaders; runs when the water is drawn
  water.onBeforeRender = () => {
    U.uTime.value = performance.now() / 1000;
    const day = typeof S !== 'undefined' && S ? daylight() : 1;
    U.uSky.value.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(NEON, (1 - day) * .25);
  };

  /* ---------- water surface: soft-capped reflections, extra waves, sky tint at grazing angles ---------- */
  const wm = water.material;
  wm.userData.env = 1.3; wm.roughness = .08; wm.clearcoatRoughness = .05; wm.normalScale.set(.1, .1);
  wm.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'varying vec3 vPw;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvPw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `uniform float uTime; uniform vec3 uSky; varying vec3 vPw;
      vec3 pondWave() {                                   // three slow wave trains crossing (slope → view-space normal nudge)
        vec2 p = vPw.xz, g = vec2(0.0); float t = uTime;
        g += vec2(.9, .4) * cos(dot(p, vec2(.9, .4)) * 1.7 + t * 1.1) * .5;
        g += vec2(-.3, .95) * cos(dot(p, vec2(-.3, .95)) * 2.6 - t * 1.4) * .35;
        g += vec2(.7, -.7) * cos(dot(p, vec2(.7, -.7)) * 4.3 + t * 2.0) * .2;
        return mat3(viewMatrix) * vec3(-g.x, 0.0, -g.y) * .08; }
      ` + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nvec3 pw = pondWave(); normal = normalize(normal + pw);')
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>\nclearcoatNormal = normalize(clearcoatNormal + pw);')
      .replace('#include <tonemapping_fragment>', `
        float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        vec3 refl = gl_FragColor.rgb * vec3(.8, .9, 1.0); refl = refl / (1.0 + refl * 3.5);        // soft cap: highlights keep their colour, never go white
        gl_FragColor.rgb = refl * .85 + uSky * (.12 + .88 * fr);
        #include <tonemapping_fragment>`);
  };
  wm.customProgramCacheKey = () => 'pondWater'; wm.needsUpdate = true;

  /* ---------- murky water body: alpha by distance from the middle (uv radius of the disc = t), cloudy silt ---------- */
  {
    const c = cnv(256, 256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, '#f0f0f0'); gr.addColorStop(.55, '#dadada'); gr.addColorStop(.8, '#8c8c8c'); gr.addColorStop(.9, '#686868'); gr.addColorStop(1, '#606060');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) { const x = rr(20, 236), y = rr(20, 236), r = rr(10, 36), b = g.createRadialGradient(x, y, 0, x, y, r), l = R() < .5 ? 255 : 60;
      b.addColorStop(0, `rgba(${l},${l},${l},.18)`); b.addColorStop(1, `rgba(${l},${l},${l},0)`); g.fillStyle = b; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    const tint = water.userData.tint, old = tint.material;
    tint.material = new THREE.MeshLambertMaterial({ color: lin('#121a10'), alphaMap: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
    old.dispose();
  }

  /* ---------- geometry helpers ---------- */
  const mesh = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.name = 'pond-' + name; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); return m; };
  const buf = () => ({ p: [], n: [], c: [], u: [], x: [] });
  function toGeo(b, extra) {
    const G = new THREE.BufferGeometry();
    G.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); G.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    G.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3)); if (b.u.length) G.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    if (extra) G.setAttribute(extra, new THREE.Float32BufferAttribute(b.x, 1));
    G.computeBoundingSphere(); return G;
  }
  // append a (displaced) geometry as plain triangles
  function addGeo(b, g, col, uvs) {
    const p = g.attributes.position, n = g.attributes.normal, idx = g.index ? g.index.array : null, N = idx ? idx.length : p.count;
    for (let k = 0; k < N; k++) { const i = idx ? idx[k] : k;
      b.p.push(p.getX(i), p.getY(i), p.getZ(i)); b.n.push(n.getX(i), n.getY(i), n.getZ(i));
      const cc = typeof col === 'function' ? col(p.getX(i), p.getY(i), p.getZ(i)) : col; b.c.push(cc.r, cc.g, cc.b);
      if (uvs) b.u.push(p.getX(i) * uvs, p.getZ(i) * uvs); }
  }
  // lumpy blob placed in the world: squashed sphere, noise-bumped, flat underside (moss cushions, stones)
  function blob(template, x, y, z, sx, sy, sz, rough, rot) {
    const g = template.clone(), p = g.attributes.position, sd = R() * 40, c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < p.count; i++) { let px = p.getX(i), py = p.getY(i), pz = p.getZ(i); const k = 1 + rough * PERLIN.noise(px * 1.8 + sd, py * 1.8, pz * 1.8);
      px *= k * sx; pz *= k * sz; py = (py < 0 ? py * .3 : py * k) * sy;
      p.setXYZ(i, x + px * c - pz * s, y + py, z + px * s + pz * c); }
    g.computeVertexNormals(); return g;
  }

  /* ---------- wet mud band + thin shore highlight, draped on the bank ---------- */
  {
    const T = [.84, .88, .93, 1.0, 1.1, 1.22, 1.38], N = 160, b = buf(), I = [];
    const DARK = lin('#22170f'), HI = lin('#4e4438');
    T.forEach((t, j) => { for (let i = 0; i <= N; i++) { const a = i / N * 6.2832, [x, z] = at(a, t);
      b.p.push(x, soilY(x, z) + .035, z); b.n.push(0, 1, 0); const cc = j === 1 ? HI : DARK; b.c.push(cc.r, cc.g, cc.b); b.u.push(i / N * 24, j / (T.length - 1)); } });
    for (let j = 0; j < T.length - 1; j++) for (let i = 0; i < N; i++) { const q = j * (N + 1) + i; I.push(q, q + N + 1, q + 1, q + 1, q + N + 1, q + N + 2); }
    const G = toGeo(b); G.setIndex(I); G.computeVertexNormals();
    const c = cnv(4, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);   // canvas bottom = v 0 = waterline
    [[0, .95], [.17, 1], [.33, .85], [.5, .6], [.67, .35], [.83, .14], [1, 0]].forEach(([s, a]) => gr.addColorStop(s, `rgba(${a * 255 | 0},${a * 255 | 0},${a * 255 | 0},1)`));
    g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
    mesh(G, track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .2, metalness: 0, alphaMap: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), .9), 'mud');
  }

  /* ---------- moss cushions on the bank ---------- */
  {
    const T0 = welded(new THREE.IcosahedronGeometry(1, 1)), b = buf();
    for (let k = 0, n = 0; k < 60 && n < 15; k++) { const a = R() * 6.2832, t = rr(.97, 1.5), [x, z] = at(a, t); if (!free(x, z)) continue; n++;
      const s = rr(.45, 1.25) * (t < 1.05 ? .7 : 1), col = new THREE.Color().setHSL(rr(.2, .27), rr(.35, .55), rr(.3, .45)).convertSRGBToLinear().multiplyScalar(1.4);
      addGeo(b, blob(T0, x, soilY(x, z) - .08, z, s * rr(1, 1.6), s * rr(.28, .45), s, .3, R() * 6.3), col, .35); }
    mesh(toGeo(b), track(new THREE.MeshStandardMaterial({ map: MOSS.map, normalMap: MOSS.normalMap, vertexColors: true, roughness: .95 }), .25), 'moss');
  }

  /* ---------- stones: a few groups on the rim (wet and dark near the water), flat pebbles on the pond floor ---------- */
  {
    const T0 = welded(new THREE.IcosahedronGeometry(1, 1)), b = buf();   // welded: smooth, water-worn
    const tone = (base, wet) => (x, y, z) => base.clone().multiplyScalar((.8 + .45 * (fbm(x * 3, y * 3, z * 3, 2) + .5)) * wet);
    for (let k = 0, n = 0; k < 80 && n < 22; k++) {
      const floor = n < 8, a = R() * 6.2832, t = floor ? rr(.55, .82) : rr(.9, 1.25), [x, z] = at(a, t); if (!floor && !free(x, z)) continue; n++;
      const s = floor ? rr(.12, .24) : rr(.14, .42), y = soilY(x, z) + (floor ? .02 : -.04), base = lin(pick(['#33312d', '#3a3530', '#2e2c29', '#3c3833', '#322e2b']));   // untextured albedo must be dark: the lights add up to ~4-5
      addGeo(b, blob(T0, x, y, z, s * rr(1, 1.5), s * (floor ? .35 : rr(.5, .8)), s, .35, R() * 6.3), tone(base, floor || t < 1 ? .55 : 1));
      if (!floor && R() < .5) for (let q = 0; q < 2; q++) { const ox = x + rr(-.6, .6), oz = z + rr(-.6, .6); if (inPond(ox, oz, -.6)) continue;   // pebbles beside it
        const s2 = rr(.07, .14); addGeo(b, blob(T0, ox, soilY(ox, oz) - .02, oz, s2 * 1.3, s2 * .6, s2, .3, R() * 6.3), tone(base, .8)); }
    }
    mesh(toGeo(b), track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62 }), .5), 'stones');
  }

  /* ---------- reeds / sedge clumps (a few with cattail heads), swaying ---------- */
  {
    const b = buf(), I = [];
    const quad = (A, B, Cc, D, n, col, sw) => { const f = b.p.length / 3;           // A B bottom, Cc D top
      [A, B, Cc, D].forEach((P, i) => { b.p.push(...P); b.n.push(...n); const cc = col[i]; b.c.push(cc.r, cc.g, cc.b); b.x.push(sw[i]); });
      I.push(f, f + 1, f + 2, f, f + 2, f + 3); };
    const GREEN = lin('#2f4419'), TIP = lin('#76823f'), DRY = lin('#62522f'), HEAD = lin('#3a2210');
    for (let k = 0, n = 0; k < 40 && n < 7; k++) {
      const a = R() * 6.2832, t = rr(.98, 1.1), [cx, cz] = at(a, t); if (!free(cx, cz)) continue; n++;
      const y0 = soilY(cx, cz) - .05, out = [Math.cos(a), Math.sin(a)], blades = 7 + (R() * 5 | 0), H0 = rr(1.4, 2.4);
      for (let q = 0; q < blades; q++) {
        const r0 = rr(0, .3), a0 = R() * 6.2832, bx = cx + Math.cos(a0) * r0, bz = cz + Math.sin(a0) * r0, h = H0 * rr(.6, 1.1), w = rr(.05, .09);
        const lean = rr(.1, .45), ld = [out[0] * .6 + rr(-.6, .6), out[1] * .6 + rr(-.6, .6)], ll = Math.hypot(...ld) || 1, dx = ld[0] / ll, dz = ld[1] / ll;
        const side = [-dz, dx], dry = R() < .25, cattail = q === 0 && R() < .6, SEG = 5;
        const pt = s => [bx + dx * lean * h * s * s, y0 + h * s, bz + dz * lean * h * s * s];
        for (let sI = 0; sI < SEG; sI++) {
          const s0 = sI / SEG, s1 = (sI + 1) / SEG, P0 = pt(s0), P1 = pt(s1), w0 = w * (1 - s0 * (cattail ? .5 : .95)), w1 = w * (1 - s1 * (cattail ? .5 : .95));
          const c0 = (dry ? DRY : GREEN).clone().lerp(TIP, s0 * .8), c1 = (dry ? DRY : GREEN).clone().lerp(TIP, s1 * .8);
          quad([P0[0] - side[0] * w0, P0[1], P0[2] - side[1] * w0], [P0[0] + side[0] * w0, P0[1], P0[2] + side[1] * w0],
            [P1[0] + side[0] * w1, P1[1], P1[2] + side[1] * w1], [P1[0] - side[0] * w1, P1[1], P1[2] - side[1] * w1], [dx, .2, dz], [c0, c0, c1, c1], [s0, s0, s1, s1]);
        }
        if (cattail) { const P0 = pt(.74), P1 = pt(.95), hw = w * 1.15;              // brown seed head: two crossed quads
          for (const [ex, ez] of [[side[0], side[1]], [dx, dz]]) quad([P0[0] - ex * hw, P0[1], P0[2] - ez * hw], [P0[0] + ex * hw, P0[1], P0[2] + ez * hw],
            [P1[0] + ex * hw, P1[1], P1[2] + ez * hw], [P1[0] - ex * hw, P1[1], P1[2] - ez * hw], [-ez, .1, ex], [HEAD, HEAD, HEAD, HEAD], [.78, .78, .95, .95]); }
      }
    }
    const G = toGeo(b, 'aSway'); G.setIndex(I);
    const m = track(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .8 }), .3);
    m.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'attribute float aSway;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float sw = aSway * aSway; transformed.x += sin(uTime * 1.3 + position.x * .7 + position.z * .4) * .1 * sw; transformed.z += cos(uTime * 1.05 + position.z * .6) * .07 * sw;`); };
    m.customProgramCacheKey = () => 'pondReeds';
    mesh(G, m, 'reeds');
  }

  /* ---------- fallen leaves: most float and drift slowly on the water, a few lie on the mud ---------- */
  {
    const b = buf(), I = [], TONES = ['#6e4820', '#86622a', '#583c1c', '#7a6c30', '#4a5424', '#62301a'].map(lin);
    for (let k = 0, n = 0; k < 50 && n < 16; k++) {
      const floats = n < 11, a = R() * 6.2832, t = floats ? rr(.1, .62) : rr(.95, 1.4), [x, z] = at(a, t); if (!floats && !free(x, z)) continue; n++;
      const y = floats ? WATER_Y + .012 + n * .001 : soilY(x, z) + .03, L = rr(.35, .7), r = R() * 6.2832, ex = [Math.cos(r) * L, Math.sin(r) * L], ew = [-ex[1] * .5, ex[0] * .5];
      const f = b.p.length / 3, col = pick(TONES), ph = R() * 6.2832;
      [[-.5, 0], [.5, 0], [.5, 1], [-.5, 1]].forEach(([u, v]) => { b.p.push(x + ew[0] * u + ex[0] * (v - .5), y + (v - .5) * .02, z + ew[1] * u + ex[1] * (v - .5));
        b.n.push(0, 1, 0); b.c.push(col.r, col.g, col.b); b.u.push(u + .5, v); b.x.push(floats ? ph : -1); });
      I.push(f, f + 1, f + 2, f, f + 2, f + 3);
    }
    const G = toGeo(b, 'aPh'); G.setIndex(I);
    const m = track(new THREE.MeshStandardMaterial({ map: LEAF_TEX, alphaTest: .5, side: THREE.DoubleSide, vertexColors: true, roughness: .5 }), .4);
    m.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'attribute float aPh;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        if (aPh >= 0.0) { transformed.x += sin(uTime * .05 + aPh) * .45; transformed.z += cos(uTime * .037 + aPh * 1.7) * .45; transformed.y += sin(uTime * .9 + aPh * 3.0) * .01; }`); };
    m.customProgramCacheKey = () => 'pondLeaves';
    mesh(G, m, 'leaves');
  }
  return { U };
})();
