// Export the real spider parts for BP_Tarantula: node spider_kit.js  →  unreal/kit/<species>_<Part>.glb (+ webs.glb: EXPORT.webs)
// Opens index.html in headless Chrome/Edge (DevTools protocol, no npm packages) and calls EXPORT.kit() for every species.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(ROOT, 'unreal/kit');
const BROWSERS = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const exe = BROWSERS.find(p => fs.existsSync(p));
const PORT = 9333, prof = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-'));
const br = spawn(exe, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--allow-file-access-from-files',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let tabs;
  for (let i = 0; i < 50 && !tabs; i++) { await sleep(300); try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch (e) {} }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); let id = 0; const wait = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait[m.id]) { wait[m.id](m); delete wait[m.id]; } else if (m.method === 'Runtime.exceptionThrown') console.log('page error', m.params.exceptionDetails.exception?.description); };
  await new Promise(r => ws.onopen = r);
  const send = (method, params) => new Promise(r => { wait[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600)); return r.result.result.value; };
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "sessionStorage.setItem('tarantula3d-intro','1')" });
  await send('Page.navigate', { url: 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html' });
  for (let i = 0; i < 200; i++) { await sleep(500); if (await ev("typeof EXPORT !== 'undefined' && typeof spider !== 'undefined' && !!spider").catch(() => false)) break; }
  fs.mkdirSync(OUT, { recursive: true });
  for (const sp of await ev('Object.keys(SPECIES)')) {
    const files = await ev(`new Promise(r => EXPORT.kit('${sp}', o => { const out = {}; for (const k in o) { const b = new Uint8Array(o[k]); let s = '';
      for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); out[k] = btoa(s); } r(out); }))`);
    for (const k in files) { const f = path.join(OUT, `${sp}_${k}.glb`); fs.writeFileSync(f, Buffer.from(files[k], 'base64')); console.log(f, fs.statSync(f).size); }
  }
  const wb = await ev(`new Promise(r => EXPORT.webs(buf => { const b = new Uint8Array(buf); let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); r(btoa(s)); }))`);
  fs.writeFileSync(path.join(OUT, 'webs.glb'), Buffer.from(wb, 'base64')); console.log('webs.glb', fs.statSync(path.join(OUT, 'webs.glb')).size);
  ws.close(); br.kill();
})().catch(e => { console.error(e); br.kill(); process.exit(1); });
