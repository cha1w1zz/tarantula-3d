/* ส่งออกฉากเป็น .glb สำหรับเปิดใน Unreal Engine (ปุ่ม #tExport ในแผงตั้งค่า). Loaded after perf.js.
   Takes what is visible now (tank, garden, town, spider, prey, people), bakes every mesh into world space
   (InstancedMesh expanded, SkinnedMesh legs replaced by their invisible bone originals), gives each a plain
   MeshStandardMaterial copy (custom shaders/onBeforeCompile dropped, only drawable textures kept), merges
   the static world per material and writes one binary glTF. 1 unit = 1 m (Unreal imports it as 100 cm). */
const EXPORT = (() => {
  const drawable = t => t && t.image && (t.image instanceof HTMLCanvasElement || t.image instanceof HTMLImageElement ||
    (typeof ImageBitmap !== 'undefined' && t.image instanceof ImageBitmap)) ? t : null;
  const matCache = new Map();
  const matOf = m => {
    if (matCache.has(m)) return matCache.get(m);
    let o = null;
    if (!m.isShaderMaterial && !m.isPointsMaterial && !m.isLineBasicMaterial && !m.isSpriteMaterial && m.blending !== THREE.AdditiveBlending) {
      o = new THREE.MeshStandardMaterial({ color: m.color ? m.color.clone() : 0xffffff, roughness: m.roughness ?? .8, metalness: m.metalness ?? 0,
        map: drawable(m.map), normalMap: drawable(m.normalMap), vertexColors: !!m.vertexColors, side: m.side,
        transparent: !!m.transparent && m.opacity < .99, opacity: m.opacity ?? 1, alphaTest: m.alphaTest || 0 });
      if (m.emissive) o.emissive.copy(m.emissive).multiplyScalar(m.emissiveIntensity ?? 1);
      o.name = m.name || m.type;
    }
    matCache.set(m, o); return o;
  };
  const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
  const bake = (g, M) => {           // plain world-space copy: position/normal/uv/color only
    const out = new THREE.BufferGeometry();
    for (const a of ['position', 'normal', 'uv', 'color']) if (g.attributes[a]) {
      const s = g.attributes[a], n = s.itemSize, f = ['getX', 'getY', 'getZ', 'getW'];
      let arr; if (!s.isInterleavedBufferAttribute && !s.normalized && s.array instanceof Float32Array) arr = new Float32Array(s.array);
      else { arr = new Float32Array(s.count * n); for (let i = 0; i < s.count; i++) for (let j = 0; j < n; j++) arr[i * n + j] = s[f[j]](i); }
      out.setAttribute(a, new THREE.Float32BufferAttribute(arr, n));
    }
    if (out.attributes.color && out.attributes.color.itemSize === 4) {   // glTF allows vec4 colours but keep it simple
      const c = out.attributes.color, a3 = new Float32Array(c.count * 3); for (let i = 0; i < c.count; i++) { a3[i * 3] = c.getX(i); a3[i * 3 + 1] = c.getY(i); a3[i * 3 + 2] = c.getZ(i); }
      out.setAttribute('color', new THREE.Float32BufferAttribute(a3, 3));
    }
    if (g.index) out.setIndex(Array.from(g.index.array));
    const dr = g.drawRange; if (g.index && (dr.start > 0 || dr.count < g.index.count)) out.setIndex(Array.from(g.index.array.slice(dr.start, Math.min(g.index.count, dr.start + dr.count))));
    out.applyMatrix4(M); return out;
  };
  const key = g => ['normal', 'uv', 'color'].map(a => g.attributes[a] ? 1 : 0).join('');
  const merge = list => {            // same attributes → one indexed geometry
    const out = new THREE.BufferGeometry(), atts = Object.keys(list[0].attributes), idx = []; let off = 0;
    for (const a of atts) { const n = list[0].attributes[a].itemSize, arr = new Float32Array(list.reduce((s, g) => s + g.attributes[a].count * n, 0)); let p = 0;
      for (const g of list) { arr.set(g.attributes[a].array, p); p += g.attributes[a].array.length; } out.setAttribute(a, new THREE.Float32BufferAttribute(arr, n)); }
    for (const g of list) { const c = g.attributes.position.count; if (g.index) for (const i of g.index.array) idx.push(i + off); else for (let i = 0; i < c; i++) idx.push(i + off); off += c; }
    out.setIndex(idx); return out;
  };
  function build() {
    matCache.clear(); scene.updateMatrixWorld(true);
    const out = new THREE.Scene(), groups = new Map(), owner = new Map(), skip = new Set(), M = new THREE.Matrix4(), I = new THREE.Matrix4();
    if (typeof beams !== 'undefined') skip.add(beams);
    if (spider) { owner.set(spider.root, 'Spider'); spider.worldMeshes.forEach(w => owner.set(w, 'Spider')); (spider.skinned || []).forEach(s => skip.add(s)); }
    prey.forEach((p, i) => p.mesh && owner.set(p.mesh, p.kind === 'human' ? 'Human_' + p.who : 'Prey_' + p.kind + '_' + i));
    const add = (name, g, mat) => { if (!groups.has(name)) groups.set(name, new Map()); const gm = groups.get(name), k = mat.uuid + key(g);
      if (!gm.has(k)) gm.set(k, { mat, list: [] }); gm.get(k).list.push(g); };
    const walk = (o, who, forced) => {
      if (skip.has(o)) return;
      who = owner.get(o) || who; if (owner.has(o)) forced = who === 'Spider';   // spider leg originals are invisible bones: take them anyway
      if (!forced && !o.visible) return;
      if (o.isMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position) {
        const mats = Array.isArray(o.material) ? o.material : [o.material], g = o.geometry;
        const inst = o.isInstancedMesh ? Math.min(o.count, 20000) : 1;
        for (let k = 0; k < inst; k++) {
          if (o.isInstancedMesh) { o.getMatrixAt(k, I); M.multiplyMatrices(o.matrixWorld, I); } else M.copy(o.matrixWorld);
          if (Array.isArray(o.material) && g.groups.length) g.groups.forEach(gr => { const m = matOf(mats[gr.materialIndex] || mats[0]); if (!m) return;
            const sub = g.clone(); if (g.index) sub.setIndex(Array.from(g.index.array.slice(gr.start, gr.start + gr.count))); add(who, bake(sub, M), m); });
          else { const m = matOf(mats[0]); if (m) add(who, bake(g, M), m); }
        }
      }
      o.children.forEach(c => walk(c, who, forced));
    };
    walk(scene, 'World', false);
    let n = 0;
    for (const [name, gm] of groups) {
      const grp = new THREE.Group(); grp.name = name; out.add(grp);
      for (const { mat, list } of gm.values()) { const mesh = new THREE.Mesh(merge(list), mat); mesh.name = name + '_' + (mat.name || 'mat') + '_' + (n++); grp.add(mesh); }
    }
    return out;
  }
  function save(buf) {
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.href = url; a.download = 'tarantula-scene.glb'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function run(done) {
    const s = build();
    new THREE.GLTFExporter().parse(s, buf => { (done || save)(buf); s.traverse(o => o.geometry && o.geometry.dispose()); }, { binary: true, maxTextureSize: 2048 });
  }
  const b = document.getElementById('tExport');
  if (b) b.onclick = () => { b.disabled = true; b.textContent = '⏳ กำลังส่งออก…';
    setTimeout(() => { try { run(); notice('ส่งออก tarantula-scene.glb แล้ว — ลากเข้า Unreal ได้เลย'); } catch (e) { console.error(e); notice('ส่งออกไม่สำเร็จ: ' + e.message); }
      b.disabled = false; b.textContent = '📦 ส่งออกไป Unreal (.glb)'; }, 50); };
  return { build, run };
})();
