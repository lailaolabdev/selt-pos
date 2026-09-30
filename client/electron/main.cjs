const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PrintQueue } = require('./queue.cjs');
const { receiptHtml } = require('./receipt.cjs');
const apiUrl = (process.env.POS_API_URL || 'http://localhost:3000').replace(/\/$/, '');
let mainWindow, paymentWindow, server, queue, origin;
const idPattern = /^[a-f0-9]{24}$/i;
const securePrefs = { nodeIntegration: false, contextIsolation: true, sandbox: true };
async function paymentData(id, suffix) {
  if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid payment id');
  const response = await fetch(`${apiUrl}/payments/phajay/${id}/${suffix}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Cannot load paid transaction');
  return response.json();
}
function guard(event) {
  if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) throw new Error('Untrusted IPC sender');
}
function handle(channel, fn) { ipcMain.handle(channel, (event, ...args) => { guard(event); return fn(...args); }); }
async function serve() {
  const root = path.join(__dirname, '../dist');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
  server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403).end(); return; }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      fs.createReadStream(file).pipe(response);
    } catch { response.writeHead(400).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(17831, '127.0.0.1', resolve); });
  return 'http://127.0.0.1:17831';
}
async function prepare(receipt, settings, reprint = false) {
  if (settings.adapter === 'system') {
    if (!settings.deviceName) throw new Error('Select a printer in settings');
    const printers = await mainWindow.webContents.getPrintersAsync();
    if (!printers.some(p => p.name === settings.deviceName)) throw new Error('Configured printer is unavailable');
  }
  return receiptHtml(receipt, settings.paperWidth, 'data:font/woff2;base64,' + fs.readFileSync(path.join(__dirname, '../public/fonts/noto-sans-lao.woff2')).toString('base64'), reprint);
}
async function printHtml(html, settings) {
  if (settings.adapter === 'mock') return 'mock';
  const win = new BrowserWindow({ show: false, webPreferences: securePrefs });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const height = await win.webContents.executeJavaScript('document.fonts.ready.then(() => { if (!document.fonts.check("12px Lao")) throw new Error("Receipt font unavailable"); return Math.ceil(document.body.getBoundingClientRect().height * 25400 / 96); })');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Printer submission timed out; check paper before retry')), 30000);
      win.webContents.print({ silent: true, deviceName: settings.deviceName, printBackground: true,
        margins: { marginType: 'none' }, pageSize: { width: settings.paperWidth * 1000, height: Math.max(100000, height + 5000) } },
      (success, reason) => { clearTimeout(timer); success ? resolve() : reject(new Error(reason || 'Printer submission failed')); });
    });
    return 'submitted';
  } finally { win.destroy(); }
}
async function createWindow() {
  const url = process.env.POS_DEV_URL || await serve(); origin = new URL(url).origin;
  mainWindow = new BrowserWindow({ width: 1024, height: 768, kiosk: process.env.POS_KIOSK !== '0', fullscreen: process.env.POS_KIOSK !== '0', autoHideMenuBar: true,
    webPreferences: { ...securePrefs, preload: path.join(__dirname, 'preload.cjs') } });
  Menu.setApplicationMenu(null);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const name of ['will-navigate', 'will-redirect']) mainWindow.webContents.on(name, (event, target) => { if (new URL(target).origin !== origin) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  /** @type {import('./types').ReceiptPrinter} */
  const printer = {
    prepare: async (job, settings) => {
      const receipt = await paymentData(job.paymentId, 'receipt');
      if (receipt.deviceId !== (process.env.POS_DEVICE_ID || 'RPi-POS-01')) throw new Error('Receipt belongs to another POS');
      return prepare(receipt, settings, job.reprint);
    }, print: printHtml,
  };
  queue = new PrintQueue(path.join(app.getPath('userData'), 'print-queue.json'), printer);
  handle('printer:list', async () => (await mainWindow.webContents.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName, isDefault: p.isDefault, status: p.status })));
  handle('printer:state', () => ({ settings: queue.state.settings, jobs: queue.state.jobs.slice(-100).reverse() }));
  handle('printer:configure', settings => queue.serial(async () => {
    if (!settings || ![58, 80].includes(settings.paperWidth) || !['system', 'mock'].includes(settings.adapter) || typeof settings.deviceName !== 'string') throw new Error('Invalid printer settings');
    if (settings.adapter === 'system' && !(await mainWindow.webContents.getPrintersAsync()).some(p => p.name === settings.deviceName)) throw new Error('Unknown printer');
    queue.state.settings = { deviceName: settings.deviceName, paperWidth: settings.paperWidth, adapter: settings.adapter }; queue.save(); return queue.state.settings;
  }));
  handle('printer:enqueue', id => { if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid payment id'); return queue.enqueue(id); });
  handle('printer:retry', id => { if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid job id'); return queue.retry(id); });
  handle('printer:test', () => queue.serial(async () => {
    const settings = queue.state.settings;
    const html = await prepare({ status: 'PAID', orderNo: 'TEST', amount: 1000, paymentMethod: 'TEST', paidAt: new Date().toISOString(), items: [{ name: 'ທົດສອບການພິມ', count: 1, subtotal: 1000 }] }, settings);
    return printHtml(html, settings);
  }));
  handle('payment:close', () => { if (paymentWindow && !paymentWindow.isDestroyed()) paymentWindow.close(); return true; });
  handle('payment:open', async id => {
    const data = await paymentData(id, 'status'); const target = new URL(data.redirectURL);
    const allowed = (process.env.POS_PAYMENT_ORIGINS || 'https://payment-link-sandbox.netlify.app,https://payment-gateway.phajay.co').split(',').map(s => s.trim());
    if (target.protocol !== 'https:' || !allowed.includes(target.origin)) throw new Error('Payment origin not allowed');
    if (paymentWindow && !paymentWindow.isDestroyed()) paymentWindow.destroy();
    paymentWindow = new BrowserWindow({ parent: mainWindow, modal: true, width: 1000, height: 800, autoHideMenuBar: true, webPreferences: securePrefs });
    const child = paymentWindow;
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const name of ['will-navigate', 'will-redirect']) child.webContents.on(name, (event, next) => {
      const nextUrl = new URL(next);
      if (nextUrl.origin === origin && nextUrl.pathname === '/payment-return') { event.preventDefault(); child.close(); return; }
      if (nextUrl.protocol !== 'https:' || !allowed.includes(nextUrl.origin)) event.preventDefault();
    });
    child.on('closed', () => { if (paymentWindow === child) paymentWindow = null; mainWindow?.focus(); });
    await child.loadURL(target.href); return true;
  });
  await mainWindow.loadURL(url);
  await queue.resume();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => server?.close());
}
