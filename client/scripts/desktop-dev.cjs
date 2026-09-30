const { spawn } = require('node:child_process');
const path = require('node:path');
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit' });
let desktop;
function stop() { desktop?.kill(); vite.kill(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
vite.on('exit', code => { desktop?.kill(); process.exitCode = code || 0; });
(async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch {}
    if (attempt === 59) throw new Error('Vite startup timed out');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const env = { ...process.env, POS_DEV_URL: 'http://127.0.0.1:5173', POS_KIOSK: process.env.POS_KIOSK || '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  desktop = spawn(require('electron'), ['.'], { stdio: 'inherit', env });
  desktop.on('exit', () => vite.kill());
})().catch(error => { console.error(error); stop(); process.exitCode = 1; });
