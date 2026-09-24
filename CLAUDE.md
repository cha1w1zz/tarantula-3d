# บึ้งไทย 3D — project notes for Claude

Browser game: realistic Thai tarantula terrarium simulator. Thai UI. No build step, no npm deps.
Owner prefers: simple Thai explanations, short answers first, plan before big changes, minimal effort / max ROI.

## Run / publish
- Open `index.html` directly (file://) or via GitHub Pages. three.js **r128** classic scripts (globals), vendored in `lib/`.
- Live link (claude.ai artifact, update in place): https://claude.ai/artifact/KDDtfiat4ynKSTrThpS7zp
  Republish = copy `index.html js/ lib/` to a scratch folder and publish with all js/lib files listed in `files`.
- Commit straight to `main`. End commits with the session attribution lines.

## Files (all share global scope, load order matters)
- `index.html` — markup, CSS, HUD, buttons `#tCricket #tDubia #tMist #tLed #tLamp #tVib #tFollow #tFast #tQual`, script tags.
- `js/world.js` — renderer, procedural PBR textures (canvas → albedo + normal), terrain `groundY/soilY` (rocks are part of the ground → climbable), hollow log hide (`LOG`, `BURROW`, `LOG_ENTRY`, `underLog`), moss shells, ferns, leaves, pebbles, lights (`led`, `lamp`, `hemi`, `moon`, `rim`), `applyEnv`, collision sets (`obstacles`, `preyObs`, `logCircles`), helpers (`rand clamp lerp frac gauss fbm track`).
- `js/spider.js` — `SPECIES`, `class Spider`: shell fur + animated hair ribbons (`HAIR_U` shader uniforms), 4-segment IK legs, metachronal tetrapod gait, spring abdomen, fangs/palps, `exuvia()`. API used by game: `pos yaw vel yawRate mode modeT route prey want{threat,rear,stalk,fang,flip,hidden,eat} soft span sp root worldOf update placeFeet dispose exuvia pickables`.
- `js/facts.js` — `FACTS` (Thai, source-checked; refs in README).
- `js/game.js` — state `S` (hunger, temp, hum, growth, molt phases normal→premolt→molting→soft), behaviour state machine, path planning around the log, prey (cricket, dubia), vibration ripples, post-processing (Render → Bokeh DOF → UnrealBloom → grade → FXAA; `quality` high/low), HUD, save (`localStorage` key `tarantula3d-v2`), main loop.

## Science rules baked in
Vibration sensing (no good eyesight), external digestion, premolt fasting + dark abdomen, molt on back, soft pale fangs after molt (no feeding), low humidity → hard molt, live prey dangerous during molt, ectotherm speed ∝ temperature, nocturnal & light-avoiding, Old World = no urticating hairs, threat posture. Names: *Melopoeus minax*, *Chilobrachys huahini*, *Melopoeus lividus* (WSC 2026).

## Testing
Container has no GPU: Chromium/Playwright uses SwiftShader (very slow, ~30 s load). Use `page.evaluate(() => document.getElementById('goBtn').click())` instead of `page.click`, long timeouts, collect `pageerror`. Syntax check: `node -e "new Function(require('fs').readFileSync('js/game.js','utf8'))"`.

## Known open items
Log interior a bit dark; rocks read as smooth domes; ferns slightly stylised; big spiders' legs can clip log walls inside the tunnel; no sound yet.
