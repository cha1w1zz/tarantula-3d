'use strict';
/* =====================================================================
   City, part 2: extra building kinds for the lots in js/lots.js (ruins that stand in the garden, rubble, wall fragments).
   Loaded before city.js; city.js calls CITY_EXT(kit) with its builders (face, wall, box, lump, mossAlong, windowAt, ...)
   and merges the returned kinds into its KIND table. decorate(kit) runs after the streets, before the meshes are merged.
   ===================================================================== */
function CITY_EXT(K) {
  return { kinds: {}, decorate() {} };
}
