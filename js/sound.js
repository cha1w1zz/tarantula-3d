'use strict';
/* =====================================================================
   Realistic ambient sound (WebAudio, all generated in code, no files), loaded last.
     room      terrarium room hum (low filtered noise + faint mains hum) + soft wind that swells and fades
     steps     the spider's feet: soft taps, deeper and heavier as it grows (lower filter, a thump for a giant)
     rotor     distant helicopter blades: filtered noise chopped at blade rate, louder as it comes closer
   Volume by distance from the camera. Starts after the first click/key (browser rule); drawer toggle #tSound (saved in S.sound);
   muted while the tab is hidden. Hooks FX_UPDATE (called from game.js loop) so game.js needs no change.
   ===================================================================== */
const SOUND = (() => {
  let ctx = null, master = null, noise = null, room = null, wind = null, rotor = null, lastTap = 0;
  const on = () => !S || S.sound !== false;
  function noiseBuf(sec, brown) { const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); let l = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; d[i] = brown ? (l = (l + .02 * w) / 1.02) * 3.5 : w; } return b; }
  const loop = (buf, ...chain) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; let n = s; for (const c of chain) { n.connect(c); n = c; } s.start(); return n; };
  const filt = (type, f, q) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || .7; return x; };
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  function start() {
    if (ctx || !on()) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); master = gain(.9); master.connect(ctx.destination);
    noise = noiseBuf(2, false); const brown = noiseBuf(4, true);
    // room: low rumble + 100 Hz mains hum of the lights/pump
    room = gain(.06); loop(brown, filt('lowpass', 260), room).connect(master);
    const hum = ctx.createOscillator(); hum.frequency.value = 100; const hg = gain(.004); hum.connect(hg); hg.connect(master); hum.start();
    // wind: band-passed noise, swelling slowly (two slow LFOs → gain + filter)
    wind = gain(.02); const wf = filt('bandpass', 420, .6); loop(noise, wf, wind).connect(master);
    const lfo = ctx.createOscillator(), lg = gain(.018); lfo.frequency.value = .07; lfo.connect(lg); lg.connect(wind.gain); lfo.start();
    const lfo2 = ctx.createOscillator(), lg2 = gain(160); lfo2.frequency.value = .031; lfo2.connect(lg2); lg2.connect(wf.frequency); lfo2.start();
    // rotor: dull thud of the blades (≈ 17 Hz chop) on low noise; volume set each frame from the nearest helicopter
    rotor = gain(0); const chop = gain(.5), bl = ctx.createOscillator(), bg = gain(.5); bl.type = 'triangle'; bl.frequency.value = 17; bl.connect(bg); bg.connect(chop.gain); bl.start();
    loop(brown, filt('lowpass', 320), chop, rotor).connect(master);
  }
  // one footfall: short noise tap + (big spider) a soft low thump
  function step(x, y, z, L) {
    if (!ctx || ctx.state !== 'running') return; const t = ctx.currentTime; if (t - lastTap < .045) return; lastTap = t;
    const d = camera.position.distanceTo(_sv.set(x, y, z)), v = .5 / (1 + d / 18) * (.35 + .65 * clamp(L / 30, 0, 1)); if (v < .01) return;
    const s = ctx.createBufferSource(); s.buffer = noise; const f = filt('lowpass', clamp(3200 / Math.sqrt(L / 4), 180, 3200)), g = gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * .5, t + .004); g.gain.exponentialRampToValueAtTime(.0005, t + .05 + L * .004);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + .3);
    if (L > 12) { const o = ctx.createOscillator(), og = gain(0); o.frequency.setValueAtTime(90 - L, t); o.frequency.exponentialRampToValueAtTime(35, t + .18);
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(v * .6 * clamp((L - 12) / 20, 0, 1), t + .01); og.gain.exponentialRampToValueAtTime(.0005, t + .25);
      o.connect(og); og.connect(master); o.start(t); o.stop(t + .3); } }
  const _sv = new V3();
  function update() {
    if (!ctx) return; const want = on() && !document.hidden;
    if (want && ctx.state === 'suspended') ctx.resume(); else if (!want && ctx.state === 'running') ctx.suspend();
    if (ctx.state !== 'running') return; const t = ctx.currentTime;
    // helicopters: loudness from the nearest one (inverse distance), none when both are gone out of the lid
    let hv = 0; for (const h of [HELI, HELI2]) if (h.group.visible) hv = Math.max(hv, .5 / (1 + camera.position.distanceTo(h.st.pos) / 14));
    rotor.gain.setTargetAtTime(hv, t, .3);
    // room hum: louder close to the glass/floor than from far out
    room.gain.setTargetAtTime(.04 + .04 / (1 + camera.position.length() / 90), t, .5);
    // footsteps: a foot that just landed
    if (spider && spider.legs) for (const l of spider.legs) { if (l._snd && !l.swing && l.foot) step(l.foot.x, l.foot.y, l.foot.z, spider.span); l._snd = l.swing; }
  }
  const kick = () => { start(); if (ctx && ctx.state === 'suspended' && on()) ctx.resume(); };
  addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
  return { update, step, get ctx() { return ctx; } };
})();
// drawer toggle (saved in the game save as S.sound)
(() => { const b = document.getElementById('tSound'); if (!b) return; const sync = () => b.classList.toggle('on', !S || S.sound !== false);
  b.onclick = () => { S.sound = S.sound === false; sync(); log(S.sound ? '🔊 เสียงบรรยากาศ: เปิด' : '🔇 เสียงบรรยากาศ: ปิด'); }; sync(); setInterval(sync, 2000); })();
// ride on the per-frame FX hook game.js already calls
{ const fx = FX_UPDATE; FX_UPDATE = function (...a) { fx.apply(this, a); SOUND.update(); }; }
