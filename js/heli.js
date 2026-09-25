'use strict';
/* =====================================================================
   Helicopter + fire (loaded last). Both are decoration except HELI.rescue(), used by the survival round (game.js).
     HELI  low-poly rescue helicopter circling the town: spinning rotors (+ a faint rotor disc), blinking red beacon and
           white tail strobe, a searchlight cone (same additive beam shader as the god rays) + a soft light pool on the ground.
           The light sweeps the streets; while the spider hunts ชัยภัทร it follows the chase.
           HELI.rescue(p, done): fly down to p, hover, done() when he is aboard, then climb away out of the tank.
     FIRE  one small fire in the roofless husk in the garden: flame + smoke particles (1 draw call each), off on low/min quality.
   game.js calls FX_UPDATE(dt, night) from loop().
   ===================================================================== */
const HELI = (() => {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.rotation.order = 'YXZ';
  const col = new THREE.Color(), parts = [];
  const put = (geo, hex, f) => { const P = geo.attributes.position, a = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { col.set(f ? f(P.getX(i), P.getY(i), P.getZ(i)) : hex).convertSRGBToLinear(); a.set([col.r, col.g, col.b], i * 3); }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); parts.push(geo.index ? geo.toNonIndexed() : geo); };
  // fuselage: white with a red band, dark glass nose; tail boom, fin, stabiliser, skids, engine hump, searchlight pod
  put(new THREE.SphereGeometry(1, 14, 10).scale(1.05, 1, 2).translate(0, 0, .3), 0, (x, y, z) => z > .9 && y > -.25 ? 0x1b2733 : Math.abs(y + .1) < .17 ? 0xc3281e : y < -.5 ? 0x9a9a96 : 0xe9e7e1);
  put(new THREE.CylinderGeometry(.13, .27, 4.2, 8).rotateX(Math.PI / 2).translate(0, .3, -3.6), 0, (x, y) => y < .25 ? 0xc3281e : 0xe9e7e1);
  put(new THREE.BoxGeometry(.1, 1.3, .8).translate(0, .95, -5.5), 0xc3281e);
  put(new THREE.BoxGeometry(1.5, .07, .42).translate(0, .35, -4.9), 0xe9e7e1);
  for (const s of [-1, 1]) { put(new THREE.BoxGeometry(.1, .1, 3.3).translate(s * .82, -1.32, .3), 0x2b2b2d);
    for (const z of [-.5, 1.1]) put(new THREE.BoxGeometry(.07, .5, .07).rotateZ(s * .35).translate(s * .7, -1.05, z), 0x2b2b2d); }
  put(new THREE.BoxGeometry(.95, .5, 1.5).translate(0, .95, -.5), 0xd9d7d0);
  put(new THREE.CylinderGeometry(.08, .1, .55, 6).translate(0, 1.4, 0), 0x2b2b2d);
  put(new THREE.CylinderGeometry(.16, .2, .28, 8).rotateX(.5).translate(0, -1.02, 1.35), 0x2b2b2d);
  const merged = (() => { const G = new THREE.BufferGeometry(); let n = 0; parts.forEach(p => n += p.attributes.position.count);
    for (const k of ['position', 'normal', 'color']) { const A = new Float32Array(n * 3); let o = 0; parts.forEach(p => { A.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }); G.setAttribute(k, new THREE.BufferAttribute(A, 3)); }
    return G; })();
  const mat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .15 }), .8);
  const hull = new THREE.Mesh(merged, mat); hull.castShadow = true; body.add(hull);
  const dark = track(new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: .6 }), .5);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(8.6, .05, .32), dark); rotor.position.set(0, 1.7, 0); rotor.castShadow = true; body.add(rotor);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.3, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.y = 1.7; body.add(disc);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.35, .12), dark); tail.position.set(.14, .95, -5.55); body.add(tail);
  const bulb = (hex, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(4) })); m.position.set(x, y, z); body.add(m); return m; };
  const beacon = bulb(0xff2a1a, 0, 1.25, -1.2), strobe = bulb(0xffffff, 0, .55, -5.95), belly = bulb(0xff2a1a, 0, -1.02, -.6);
  body.scale.setScalar(.85); scene.add(g);
  // searchlight: cone from the pod to the ground + a soft additive pool of light where it lands
  const beamM = beamMat(0xf4f7ff), cone = new THREE.Mesh(new THREE.CylinderGeometry(.25, 1, 1, 24, 1, true).translate(0, -.5, 0), beamM);
  cone.renderOrder = 2; scene.add(cone); if (typeof beams !== 'undefined') { scene.remove(cone); beams.add(cone); }
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, color: 0xdfe8ff, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.renderOrder = 2; scene.add(pool);
  // flight: an ellipse over the town; aim = where the searchlight points (eases toward its goal)
  const C = { x: 6, z: -3, rx: 38, rz: 21, y: 43 };
  const st = { mode: 'patrol', a: rand(0, 6.3), pos: new V3(), vel: new V3(), yaw: 0, roll: 0, pitch: 0, aim: new V3(0, 0, 0), goal: new V3(), sweepT: 0, t: 0, p: null, done: null, k: 0, gone: false };
  const src = new V3(), dir = new V3(), q = new THREE.Quaternion(), DOWN = new V3(0, -1, 0), tmp = new V3();
  st.pos.set(C.x + Math.cos(st.a) * C.rx, C.y, C.z + Math.sin(st.a) * C.rz); st.aim.set(C.x, 0, C.z);
  // highest ground (roofs included) around (x, z): the hover height must clear them
  const roofAround = (x, z, r) => { let y = -1e9; for (let a = 0; a < 6.3; a += .8) for (const d of [0, r * .5, r]) y = Math.max(y, groundY(x + Math.cos(a) * d, z + Math.sin(a) * d)); return y; };
  function steer(dt, target, speed, turn) {        // fly toward target: accelerate, bank into turns, nose down when fast
    tmp.subVectors(target, st.pos); const d = tmp.length(); if (d > .01) tmp.multiplyScalar(Math.min(speed, d * 1.2) / d);
    st.vel.lerp(tmp, clamp(dt * (turn || 1.2), 0, 1)); st.pos.addScaledVector(st.vel, dt); return d; }
  return {
    group: g, st, pool, disc,
    get busy() { return st.mode !== 'patrol'; },
    rescue(p, done) { st.mode = 'descend'; st.p = p; st.done = done; st.t = 0; st.gone = false; g.visible = true; },
    reset() { st.mode = 'patrol'; st.p = null; st.done = null; st.gone = false; g.visible = true; st.pos.set(C.x + Math.cos(st.a) * C.rx, C.y, C.z + Math.sin(st.a) * C.rz); },
    update(dt, night, chase) {
      st.t += dt; const now = st.t;
      if (st.mode === 'patrol') { st.a += dt * .13; steer(dt, tmp.set(C.x + Math.cos(st.a) * C.rx, C.y + 2 * Math.sin(st.a * 2.3), C.z + Math.sin(st.a) * C.rz), 9, .8); }
      else if (st.mode === 'descend') {                                      // over him, then straight down to a low hover
        const P = st.p.pos, hy = Math.max(roofAround(P.x, P.z, 5.5) + 3.2, groundY(P.x, P.z) + 3.4), flat = Math.hypot(P.x - st.pos.x, P.z - st.pos.z);
        if (flat > 4) steer(dt, tmp.set(P.x, Math.max(hy, Math.min(st.pos.y, 30)), P.z), 16, 1.4);                       // over him (never climbs back up)
        else if (steer(dt, tmp.set(P.x, hy, P.z), 7, 1.6) < 1.5) { st.mode = 'hover'; st.t = 0; }
      } else if (st.mode === 'hover') { const P = st.p.pos; steer(dt, tmp.set(P.x, st.pos.y, P.z), 3, 2);
        if (st.t > 1.6 && st.done) { st.done(); st.done = null; } if (st.t > 3) { st.mode = 'leave'; st.t = 0; } }
      else if (st.mode === 'leave') { steer(dt, tmp.set(st.pos.x * .6, TH + 40, st.pos.z * .6 - 20), 14, .9);
        if (st.pos.y > TH + 12) { st.gone = true; g.visible = false; } if (st.t > 14) this.reset(); }   // back on patrol a while later
      // attitude: face the direction of travel, bank into the turn, nose down with speed
      const sp = Math.hypot(st.vel.x, st.vel.z), wy = sp > .8 ? Math.atan2(st.vel.x, st.vel.z) : st.yaw, dy = Math.atan2(Math.sin(wy - st.yaw), Math.cos(wy - st.yaw));
      st.yaw += dy * clamp(dt * 1.5, 0, 1); st.roll = lerp(st.roll, clamp(-dy * 1.2, -.4, .4), clamp(dt * 2, 0, 1)); st.pitch = lerp(st.pitch, clamp(sp * .012, 0, .2), clamp(dt * 2, 0, 1));
      g.position.copy(st.pos); g.rotation.set(st.pitch, st.yaw, st.roll);
      rotor.rotation.y += dt * 26; tail.rotation.x += dt * 38;
      beacon.visible = Math.sin(now * 6.3) > .2; belly.visible = !beacon.visible; strobe.visible = (now % 1.3) < .07 || ((now % 1.3) > .2 && (now % 1.3) < .27);
      // searchlight: follows the chase, else sweeps the street under the flight path (or points at him while hovering)
      if (st.mode === 'descend' || st.mode === 'hover') st.goal.set(st.p.pos.x, 0, st.p.pos.z);
      else if (chase) st.goal.set(chase.x, 0, chase.z);
      else if ((st.sweepT -= dt) <= 0) { st.sweepT = rand(3, 6); const a = st.a + rand(.2, .9); st.goal.set(C.x + Math.cos(a) * C.rx * rand(.3, .8), 0, C.z + Math.sin(a) * C.rz * rand(.3, .8)); }
      st.aim.lerp(st.goal, clamp(dt * (chase ? 2.5 : .8), 0, 1)); st.aim.y = groundY(st.aim.x, st.aim.z);
      src.set(0, -1.1, 1.35).multiplyScalar(.85).applyEuler(g.rotation).add(g.position);
      dir.subVectors(st.aim, src); const L = dir.length(), on = g.visible && st.mode !== 'leave' && quality !== 'min';
      cone.visible = pool.visible = on;
      if (on) { dir.multiplyScalar(1 / L); cone.position.copy(src); cone.quaternion.setFromUnitVectors(DOWN, dir); const R = 3 + L * .06; cone.scale.set(R, L, R);
        beamM.uniforms.uI.value = .05 + .12 * night; pool.position.set(st.aim.x, st.aim.y + .12, st.aim.z); pool.scale.set(R * 2.4, 1, R * 2.4); pool.material.opacity = .08 + .3 * night; }
    },
  };
})();

const FIRE = (() => {
  const at = new V3(4.9, 0, 14.4); at.y = groundY(at.x, at.z) + .05;
  const NF = 70, NS = 34, mk = (n, add, size) => {
    const G = new THREE.BufferGeometry(); G.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); G.setAttribute('aL', new THREE.BufferAttribute(new Float32Array(n), 1));
    const M = new THREE.ShaderMaterial({ uniforms: { uS: { value: size }, uAdd: { value: add ? 1 : 0 } }, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute float aL; uniform float uS, uAdd; varying float vL; void main(){ vL = aL; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uS * (uAdd > .5 ? (1.0 - aL * .7) : (.5 + aL * 1.4)) * 300.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uAdd; varying float vL; void main(){ vec2 c = gl_PointCoord - .5; float r = length(c); if (r > .5) discard; float s = smoothstep(.5, .0, r);
        if (uAdd > .5) { vec3 col = mix(vec3(1.0, .85, .45), vec3(.9, .22, .04), smoothstep(.1, .7, vL)) * (1.0 - smoothstep(.55, 1.0, vL)); gl_FragColor = vec4(col * s * 1.6, 1.0); }
        else gl_FragColor = vec4(vec3(.16, .15, .14), s * .32 * smoothstep(0.0, .15, vL) * (1.0 - vL)); }` });
    const P = new THREE.Points(G, M); P.frustumCulled = false; P.position.copy(at); scene.add(P); return P; };
  const flame = mk(NF, true, .8), smoke = mk(NS, false, 1.7);
  const S = [[flame, NF, .55, 2.5], [smoke, NS, 3.2, 10]].map(([o, n, v, top]) => ({ o, n, v, top, life: new Float32Array(n).map(() => Math.random()), sp: new Float32Array(n).map(() => rand(.7, 1.3)), jx: new Float32Array(n).map(() => rand(-1, 1)), jz: new Float32Array(n).map(() => rand(-1, 1)) }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,170,80,1)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.copy(at).add(new V3(0, .7, 0)); glow.scale.setScalar(4.6); scene.add(glow);
  let t = 0;
  return { at, flame, smoke, glow, update(dt, night) {
    const on = quality === 'high'; flame.visible = smoke.visible = glow.visible = on; if (!on) return; t += dt;
    for (const s of S) { const P = s.o.geometry.attributes.position, A = s.o.geometry.attributes.aL, fl = s === S[0];
      for (let i = 0; i < s.n; i++) { let L = s.life[i] + dt * s.sp[i] / (fl ? 1.1 : 5.5); if (L >= 1) { L -= 1; s.jx[i] = rand(-1, 1); s.jz[i] = rand(-1, 1); }
        s.life[i] = L; const wob = Math.sin(t * 7 + i) * .08 * L, spread = fl ? .75 * (1 - L) : .3 + L * 1.8, drift = fl ? 0 : L * L * 2.2;
        P.setXYZ(i, s.jx[i] * spread + wob + drift, L * s.top * (fl ? (1 - .3 * Math.abs(s.jx[i])) : 1), s.jz[i] * spread * .8 + wob * .5); A.setX(i, L); }
      P.needsUpdate = A.needsUpdate = true; }
    glow.material.opacity = (.35 + .25 * night) * (.8 + .2 * Math.sin(t * 17) * Math.sin(t * 5.3));
  } };
})();

const FX_HIDE = [FIRE.flame, FIRE.smoke, FIRE.glow, HELI.pool, HELI.disc];   // soft / additive FX: kept out of the depth-of-field depth pass
function FX_UPDATE(dt, night, chase) { HELI.update(dt, night, chase); FIRE.update(dt, night); }
