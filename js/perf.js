'use strict';
/* =====================================================================
   Performance helpers (round 7), loaded LAST (after webs.js has ray cast the scene).
   1. Static batching: meshes listed in STATIC_BATCH (world.js: rocks, moss-mound layers, fern stems,
      tank frame bars) that share a material + shadow flags are glued into ONE mesh each.
      Same triangles, same look; ~150 fewer draw calls per pass (main + shadow maps + DOF depth).
   2. Build the people's walk grid (humanNav) and the blood textures/shaders now, while the start card
      is up, instead of as a hitch the first time the people are released.
   ===================================================================== */
(() => {
  const _n = new THREE.Matrix3(), _v = new V3();
  // one geometry from many (all with the same attribute set), each baked into world space
  function mergeWorld(list) {
    const names = Object.keys(list[0].geometry.attributes), indexed = !!list[0].geometry.index;
    let nv = 0, ni = 0;
    list.forEach(m => { const g = m.geometry; nv += g.attributes.position.count; ni += indexed ? g.index.count : 0; });
    const G = new THREE.BufferGeometry(), out = {};
    names.forEach(n => { const a = list[0].geometry.attributes[n]; out[n] = new a.array.constructor(nv * a.itemSize); });
    const I = indexed ? new (nv > 65535 ? Uint32Array : Uint16Array)(ni) : null;
    let v = 0, o = 0;
    list.forEach(m => {
      const g = m.geometry, cnt = g.attributes.position.count; m.updateMatrixWorld(true);
      const M = m.matrixWorld, still = M.equals(new THREE.Matrix4()); _n.getNormalMatrix(M);
      names.forEach(n => {
        const a = g.attributes[n], w = a.itemSize, A = out[n];
        if (still || (n !== 'position' && n !== 'normal')) { A.set(a.array.subarray(0, cnt * w), v * w); return; }
        for (let i = 0; i < cnt; i++) { _v.fromBufferAttribute(a, i); if (n === 'position') _v.applyMatrix4(M); else _v.applyMatrix3(_n).normalize(); A[(v + i) * 3] = _v.x; A[(v + i) * 3 + 1] = _v.y; A[(v + i) * 3 + 2] = _v.z; }
      });
      if (indexed) { const ix = g.index; for (let i = 0; i < ix.count; i++) I[o++] = ix.getX(i) + v; }
      v += cnt;
    });
    names.forEach(n => { const a = list[0].geometry.attributes[n]; G.setAttribute(n, new THREE.BufferAttribute(out[n], a.itemSize, a.normalized)); });
    if (I) G.setIndex(new THREE.BufferAttribute(I, 1));
    G.computeBoundingSphere(); G.computeBoundingBox();
    return G;
  }
  const groups = new Map();
  STATIC_BATCH.forEach(m => {
    const g = m.geometry;
    if (m.parent !== scene || m.children.length || !m.visible || m.isInstancedMesh || g.groups.length > 1 || g.morphAttributes.position
      || Object.values(g.attributes).some(a => a.isInterleavedBufferAttribute || a.array.length !== a.count * a.itemSize)) return;
    const sig = Object.keys(g.attributes).sort().map(n => n + g.attributes[n].itemSize + g.attributes[n].array.constructor.name + g.attributes[n].normalized).join(',');
    const key = [m.material.uuid, m.castShadow, m.receiveShadow, m.renderOrder, m.frustumCulled, !!g.index, sig,
      m.customDepthMaterial ? m.customDepthMaterial.uuid : '', m.customDistanceMaterial ? m.customDistanceMaterial.uuid : ''].join('|');
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m);
  });
  let saved = 0;
  groups.forEach(list => {
    if (list.length < 2) return;
    const a = list[0], mesh = new THREE.Mesh(mergeWorld(list), a.material);
    mesh.castShadow = a.castShadow; mesh.receiveShadow = a.receiveShadow; mesh.renderOrder = a.renderOrder; mesh.frustumCulled = a.frustumCulled;
    mesh.customDepthMaterial = a.customDepthMaterial; mesh.customDistanceMaterial = a.customDistanceMaterial;
    mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.name = 'batch';
    scene.add(mesh);
    list.forEach(m => { scene.remove(m); m.geometry.dispose(); });
    saved += list.length - 1;
  });
  STATIC_BATCH.length = 0;
  window.PERF = { batched: saved };
  // the people's walk grid is static: build it now (hidden behind the start card) rather than on the first release
  if (typeof humanNav === 'function') humanNav();
  // blood/silk textures + shaders: made now instead of in the frame the first person walks in (~0.2 s hitch)
  if (typeof BLOOD !== 'undefined' && BLOOD.warm) BLOOD.warm();
})();
