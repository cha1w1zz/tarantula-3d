# บึ้งไทย 3D — project notes for Claude

Browser game: realistic Thai tarantula terrarium simulator. Thai UI. No build step, no npm deps.
Owner prefers: simple Thai explanations, short answers first, plan before big changes, minimal effort / max ROI.
Whenever you use a helper (subagent, skill, or automated tool like code-review), tell the owner which one and, in one short line, what it does.

## Run / publish
- Open `index.html` directly (file://) or via GitHub Pages. three.js **r128** classic scripts (globals), vendored in `lib/`.
- Live link (claude.ai artifact, update in place): https://claude.ai/artifact/KDDtfiat4ynKSTrThpS7zp
  Republish = copy `index.html js/ lib/` to a scratch folder and publish with all js/lib files listed in `files`.
- Commit straight to `main`. End commits with the session attribution lines.

## Files (all share global scope, load order matters)
- `index.html` — markup, CSS, HUD, buttons `#tCricket #tDubia #tMist #tLed #tLamp #tVib #tFollow #tCine #tFast #tQual`, script tags.
- `js/world.js` — renderer, procedural PBR textures (canvas → albedo + normal; `tileFbm` = seamless noise), terrain `groundY/groundN/soilY`. Rocks (`ROCKS`) are real meshes (plane-cut icospheres + cracks, triplanar shader `triplanar()`), each with a top-down height grid rasterised from its mesh (`k.grid`, `gridY`) → the walkable surface = the visible one. Hollow log hide (`LOG`, `BURROW`, `LOG_ENTRY`, `underLog`), moss shells, ferns, bendable foliage (`addFoliage`, `updateFoliage(dt, spheres)`: sedges, strap-leaf clumps (only every 3rd `plantSites` site), round-leaf rosettes, and a dense Zelda-style meadow ~21k blades with `gpuWind` = wind waves in the vertex shader (`TURF_U`), CPU only updates clumps (2.5-unit cells) something touches; meadow casts no shadow), leaves, pebbles, lights (`led`, `lamp`, `hemi`, `moon`, `rim`), god rays (`beams` group: 5 additive sheets under `ledBar` + open cone under lamp, `beamMat`, `ledBeamMat`/`lampBeamMat` `uI`, `BEAM_U.uTime`; edge-on fade via facing term), soft round additive `dust` (600), `applyEnv`, collision sets (`obstacles`, `preyObs`), helpers (`rand clamp lerp frac gauss fbm sstep smin seeded track onRock clearSpot`).
- `js/spider.js` — `SPECIES`, `class Spider`: shell fur + animated hair ribbons (`HAIR_U` shader uniforms), 4-segment IK legs, metachronal tetrapod gait, spring abdomen, fangs/palps, `exuvia()`. Terrain-safe legs: `foothold()` picks reachable, unobstructed footholds; distal segments follow the ground normal; `unclip()` (FABRIK) pushes joints out of rock/soil; body floor from `BODY_UNDER` + hips. API used by game: `pos yaw vel yawRate mode modeT route prey want{threat,rear,stalk,fang,flip,hidden,eat} soft span sp root worldOf update placeFeet dispose exuvia pickables colliders`.
- `js/intro.js` — 10 s hand-drawn 2D intro (Canvas 2D, paper + ink style) shown once per session (`sessionStorage` key `tarantula3d-intro`) before the name/species card; loaded before three.js. Skip / เริ่มเล่น fade into the game. Fast quality = no grain, line boil, glow. Test hook `INTRO.draw(seconds)`.
- `js/facts.js` — `FACTS` (Thai, source-checked; refs in README).
- `js/voice.js` — `VOICE`: spider's speech lines by category (mood/situation + chuunibyou Spider-Man `chatter`), ~37 lines.
- `js/game.js` — calls `updateFoliage` each frame with spider + prey spheres; state `S` (hunger, temp, hum, growth, molt phases normal→premolt→molting→soft), behaviour state machine, path planning around the log, prey (cricket, dubia: jointed `limb()` chains, tripod gait, smooth turning `face`→`yaw`, antennae sweep, cricket crouch→kick jump + night chirp, dubia digs in/out, bitten prey struggles), speech `say(cat, pri)` + `moodTalk()` (bubble `#say` over spider + log), log stamped with real device time, auto-care once per crisis (`S.autoFed` hunger≥85, `S.autoMist` hum<55), wander in stop-and-go bursts, vibration ripples, god-ray strength = ledK/lampK × S.hum × `haze` (mistFx sets 1, decays ~40 s) × more at night, hidden on quality 'min'; cinematic cam `cine`/`setCine` (#tCine: low at span*.35, dist span*1.6, fov≥50, relaxes maxPolarAngle, auto-off with tankView/saver), post-processing (Render → Bokeh DOF → UnrealBloom → grade → FXAA; `quality` high/low), HUD, save (`localStorage` key `tarantula3d-v2`), main loop.

## Science rules baked in
Vibration sensing (no good eyesight), external digestion, premolt fasting + dark abdomen, molt on back, soft pale fangs after molt (no feeding), low humidity → hard molt, live prey dangerous during molt, ectotherm speed ∝ temperature, nocturnal & light-avoiding, Old World = no urticating hairs, threat posture. Names: *Melopoeus minax*, *Chilobrachys huahini*, *Melopoeus lividus* (WSC 2026).

## Testing
Container has no GPU: Chromium/Playwright uses SwiftShader (very slow, ~30 s load). Use `page.evaluate(() => document.getElementById('goBtn').click())` instead of `page.click`, long timeouts, collect `pageerror`. Syntax check: `node -e "new Function(require('fs').readFileSync('js/game.js','utf8'))"`.

## Testing tips
Render on demand: after load set `window.requestAnimationFrame = () => 0`, step `tick(1/30)` + `updateFoliage(...)` yourself, then `loop(); canvas.toDataURL()` (page.screenshot times out under SwiftShader). Leg clipping check: walk routes across rocks and measure how far `l.J` joints/segment middles are inside `groundY` (≈0 now for span 9 and 15).

## Known open items
Log interior a bit dark; ferns slightly stylised (sway in wind + lean from spider body via shader, not per-leaf physics); big spiders' legs can clip log walls inside the tunnel; no sound yet.
