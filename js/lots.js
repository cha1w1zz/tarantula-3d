'use strict';
/* =====================================================================
   Town plan (data only). Loaded before world.js so the garden (moss, plants, pebbles, prey spots) keeps clear of the
   buildings, including the ruins that stand inside the garden. city.js builds every lot with its KIND builders
   (+ the extra kinds from city2.js); game.js turns each built shell into a walkable height grid (SOLIDS).
   tile / hsign are names from city.js (T.* tiles, sign rects). rot: E = faces -x (right strip), W = faces +x.
   ===================================================================== */
const LOT_E = -Math.PI / 2, LOT_W = Math.PI / 2;
const LOTS = [
  // back row: faces the street at z ≈ -20
  { kind: 'wood', x: -50.3, z: -29.5, w: 12, d: 11, col: '#cfc2a4', kaw: '#666d76', sign: 0 },
  { kind: 'row', x: -38.5, z: -29.5, w: 8, d: 11, f: 3, tile: 'TILE', col: '#b48f74', lean: .12, neon: 6, fl: 1.5 },
  { kind: 'row', x: -27.5, z: -29, w: 9, d: 10, f: 2, tile: 'PLAST', col: '#bfb49c', flat: 1, hsign: 'SHOKUDO' },
  { kind: 'office', x: -15, z: -29.5, w: 11, d: 11, f: 5, tile: 'TILE', col: '#c7bba2', sign: 1 },
  { kind: 'ruin', x: -2, z: -29.5, w: 10, d: 11, col: '#a8a59c' },
  { kind: 'wood', x: 9.5, z: -29, w: 10, d: 10, col: '#bfb49c', kaw: '#6f6258', caved: 1 },
  { kind: 'row', x: 20, z: -29.5, w: 8, d: 11, f: 3, tile: 'CONC', col: '#a9b0a8', neon: 5, fl: .37 },
  { kind: 'mansion', x: 31, z: -30, w: 11, d: 12, f: 7, col: '#d0c8b8' },
  { kind: 'row', x: 48, z: -30, w: 15, d: 12, f: 4, tile: 'TILE', col: '#8fa39a', neon: 7, fl: .71, tank: 1 },
  // right strip: faces the street at x ≈ 33
  { kind: 'store', x: 46, z: -8, w: 12, d: 15, rot: LOT_E, col: '#d8d4ca' },
  { kind: 'wood', x: 45, z: 7, w: 12, d: 12, rot: LOT_E, col: '#c9bfa6', kaw: '#6d6660', sign: 4, hsign: 'SHOKUDO' },
  { kind: 'row', x: 45, z: 24, w: 11, d: 12, rot: LOT_E, f: 2, tile: 'PLAST', col: '#cbb89a', sign: 3 },
  { kind: 'wood', x: 24.5, z: 17, w: 8, d: 8, rot: LOT_W, col: '#b8ad96', kaw: '#6e6660' },
  { kind: 'shed', x: 24, z: 3, w: 7, d: 5, rot: LOT_W, hh: 3.6, col: '#8f9291' },
  { kind: 'shed', x: 25, z: 31, w: 6, d: 5, rot: LOT_W, hh: 4.2, col: '#7f8a86' },
];
// (x, z) within pad of a lot's footprint (same rotation convention as Object3D.rotation.y)
function lotInside(x, z, pad) {
  pad = pad || 0;
  for (const b of LOTS) { const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0);
    if (Math.abs(dx * c - dz * s) < b.w / 2 + pad && Math.abs(dx * s + dz * c) < b.d / 2 + pad) return true; }
  return false;
}
