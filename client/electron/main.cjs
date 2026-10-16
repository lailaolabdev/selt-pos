const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { PrintQueue } = require('./queue.cjs');
const { receiptHtml } = require('./receipt.cjs');
const { RfidScanner } = require('./rfid-scanner.cjs');
const { listSerialPorts, listWindowsPrinters, printRaster } = require('./raw-printer.cjs');
const { listUsbPrinters } = require('./usb-printer.cjs');
const apiUrl = (process.env.POS_API_URL || 'https://api-seltpos.soudev.site').replace(/\/$/, '');
let mainWindow, paymentWindow, server, queue, rfidScanner, origin;
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

async function renderReceiptImage(html, paperWidth) {
  const width = paperWidth === 58 ? 384 : 576;
  const canvasLibrary = fs.readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js'), 'utf8')
    .replace(/<\/script/gi, '<\\/script');
  const renderScript = `<script>${canvasLibrary}</script><script>
    window.__renderReceiptCanvas = async () => {
      await document.fonts.ready;
      const body = document.body;
      const bounds = body.getBoundingClientRect();
      const canvas = await html2canvas(body, {
        backgroundColor: '#ffffff',
        logging: false,
        scale: ${width} / bounds.width,
        width: bounds.width,
        height: bounds.height,
        windowWidth: document.documentElement.clientWidth,
      });
      return canvas.toDataURL('image/png');
    };
  </script>`;
  const renderHtml = html.replace('</body>', `${renderScript}</body>`);
  const win = new BrowserWindow({ show: false, width, height: 4000, webPreferences: securePrefs });
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderHtml));
    const contentWidthMm = paperWidth - 4;
    await win.webContents.setZoomFactor(width / (contentWidthMm * 96 / 25.4));
    const dataUrl = await win.webContents.executeJavaScript('window.__renderReceiptCanvas()');
    const image = nativeImage.createFromDataURL(dataUrl);
    const { width: imageWidth, height: imageHeight } = image.getSize();
    if (image.isEmpty() || imageWidth <= 0 || imageHeight <= 0 || imageHeight > 12000) {
      throw new Error('Could not render receipt with html2canvas');
    }
    return { data: image.toPNG().toString('base64'), bitmap: image.getBitmap(), width: imageWidth, height: imageHeight };
  } finally {
    win.destroy();
  }
}

function imagePrintHtml(image) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0;padding:0;background:#fff}img{display:block;width:100%;height:auto}</style></head><body><img src="data:image/png;base64,${image.data}" width="${image.width}" height="${image.height}" /></body></html>`;
}

async function printHtml(html, settings) {
  if (settings.adapter === 'mock') return 'mock';
  const image = await renderReceiptImage(html, settings.paperWidth);
  if (['raw-network', 'raw-serial', 'raw-spooler', 'raw-usb'].includes(settings.adapter)) {
    await printRaster({
      bitmap: image.bitmap,
      width: image.width,
      height: image.height,
      connection: settings.adapter === 'raw-network' ? 'network' : settings.adapter === 'raw-spooler' ? 'spooler' : settings.adapter === 'raw-usb' ? 'usb' : 'serial',
      printerName: settings.deviceName,
      printerIp: settings.printerIp,
      printerPort: settings.printerPort,
      portPath: settings.portPath,
      baudRate: settings.baudRate,
      usbVendorId: settings.adapter === 'raw-usb' ? Number.parseInt(settings.usbVendorId, 16) : undefined,
      usbProductId: settings.adapter === 'raw-usb' ? Number.parseInt(settings.usbProductId, 16) : undefined,
    });
    return 'submitted';
  }
  if (settings.adapter !== 'system') throw new Error('Select a printer connection in settings');
  if (!settings.deviceName) throw new Error('Select a printer in settings');
  const win = new BrowserWindow({ show: false, webPreferences: securePrefs });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(imagePrintHtml(image)));
    // The receipt image already includes its cut-space. Keep the proven 58mm
    // driver allowance, but remove the extra tail on 80mm to avoid a long
    // blank section before the cutter.
    const tailAllowance = settings.paperWidth === 58 ? 1500 : 0;
    const pageHeight = Math.max(10000, Math.ceil((image.height / image.width) * settings.paperWidth * 1000) + tailAllowance);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Printer submission timed out; check paper before retry')), 30000);
      // Keep Chromium's default single-copy/page handling: some Windows
      // thermal drivers reject explicit pageRanges and cancel the job.
      win.webContents.print({ silent: true, deviceName: settings.deviceName, printBackground: true,
        margins: { marginType: 'none' }, pageSize: { width: settings.paperWidth * 1000, height: pageHeight } },
      (success, reason) => { clearTimeout(timer); success ? resolve() : reject(new Error(reason || 'Printer submission failed')); });
    });
    return 'submitted';
  } finally { win.destroy(); }
}
async function createWindow() {
  const url = process.env.POS_DEV_URL || await serve(); origin = new URL(url).origin;
  mainWindow = new BrowserWindow({ width: 1024, height: 768, icon: path.join(__dirname, '../dist/logo.png'), kiosk: process.env.POS_KIOSK !== '0', fullscreen: process.env.POS_KIOSK !== '0', autoHideMenuBar: true,
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
  rfidScanner = new RfidScanner({
    stateFile: path.join(app.getPath('userData'), 'rfid-scanner.json'),
    apiUrl,
    deviceId: process.env.POS_DEVICE_ID || 'RPi-POS-01',
    onEvent: (type, data) => mainWindow?.webContents.send('rfid:event', { type, data }),
  });
  handle('printer:list', async () => {
    const [electronPrinters, windowsPrinters] = await Promise.all([
      mainWindow.webContents.getPrintersAsync().catch(() => []),
      listWindowsPrinters(),
    ]);
    const windowsByName = new Map(windowsPrinters.map(printer => [printer.name.toLowerCase(), printer]));
    const merged = electronPrinters.map(printer => ({
      name: printer.name,
      displayName: printer.displayName,
      isDefault: printer.isDefault,
      status: printer.status,
      portName: windowsByName.get(printer.name.toLowerCase())?.portName,
    }));
    const known = new Set(merged.map(printer => printer.name.toLowerCase()));
    for (const printer of windowsPrinters) if (!known.has(printer.name.toLowerCase())) merged.push(printer);
    return merged;
  });
  handle('printer:ports', () => listSerialPorts());
  handle('printer:usb', () => listUsbPrinters());
  handle('printer:state', () => ({ settings: queue.state.settings, jobs: queue.state.jobs.slice(-100).reverse() }));
  handle('printer:configure', settings => queue.serial(async () => {
    if (!settings || ![58, 80].includes(settings.paperWidth) || !['system', 'raw-network', 'raw-serial', 'raw-spooler', 'raw-usb', 'mock'].includes(settings.adapter) || typeof settings.deviceName !== 'string') throw new Error('Invalid printer settings');
    if (settings.adapter === 'system' && !(await mainWindow.webContents.getPrintersAsync()).some(p => p.name === settings.deviceName)) throw new Error('Unknown printer');
    if (settings.adapter === 'raw-spooler' && (process.platform !== 'win32' || !settings.deviceName.trim())) throw new Error('ກະລຸນາໃສ່ຊື່ຄິວເຄື່ອງພິມ Windows');
    if (settings.adapter === 'raw-network' && (!settings.printerIp || !require('node:net').isIP(settings.printerIp) || !Number.isInteger(Number(settings.printerPort)) || Number(settings.printerPort) < 1 || Number(settings.printerPort) > 65535)) throw new Error('Enter a valid printer IP and port');
    if (settings.adapter === 'raw-serial' && (process.platform !== 'win32' || !/^COM\d+$/i.test(settings.portPath || '') || ![9600, 19200, 38400, 57600, 115200].includes(Number(settings.baudRate)))) throw new Error('Select a valid Windows COM port and baud rate');
    const usbIdPattern = /^(?:0x)?[0-9a-f]{1,4}$/i;
    if (settings.adapter === 'raw-usb' && (typeof settings.usbVendorId !== 'string' || typeof settings.usbProductId !== 'string' || !usbIdPattern.test(settings.usbVendorId) || !usbIdPattern.test(settings.usbProductId) || !Number.parseInt(settings.usbVendorId.replace(/^0x/i, ''), 16) || !Number.parseInt(settings.usbProductId.replace(/^0x/i, ''), 16))) throw new Error('ກະລຸນາໃສ່ VID ແລະ PID ຂອງເຄື່ອງພິມ USB');
    queue.state.settings = {
      deviceName: settings.deviceName.trim(),
      paperWidth: settings.paperWidth,
      adapter: settings.adapter,
      printerIp: settings.adapter === 'raw-network' ? settings.printerIp : undefined,
      printerPort: settings.adapter === 'raw-network' ? Number(settings.printerPort) : undefined,
      portPath: settings.adapter === 'raw-serial' ? settings.portPath.toUpperCase() : undefined,
      baudRate: settings.adapter === 'raw-serial' ? Number(settings.baudRate) : undefined,
      usbVendorId: settings.adapter === 'raw-usb' ? Number.parseInt(settings.usbVendorId.replace(/^0x/i, ''), 16).toString(16).padStart(4, '0') : undefined,
      usbProductId: settings.adapter === 'raw-usb' ? Number.parseInt(settings.usbProductId.replace(/^0x/i, ''), 16).toString(16).padStart(4, '0') : undefined,
    }; queue.save(); return queue.state.settings;
  }));
  handle('printer:enqueue', id => { if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid payment id'); return queue.enqueue(id); });
  handle('printer:retry', id => { if (typeof id !== 'string' || !idPattern.test(id)) throw new Error('Invalid job id'); return queue.retry(id); });
  handle('printer:test', () => queue.serial(async () => {
    const settings = queue.state.settings;
    const html = await prepare({ status: 'PAID', orderNo: 'TEST', amount: 1000, paymentMethod: 'TEST', paidAt: new Date().toISOString(), items: [{ name: 'ຍິນດີຕອນຮັບສູ່ 4B POS', count: 1, subtotal: 1000 }] }, settings);
    return printHtml(html, settings);
  }));
  handle('rfid:state', () => rfidScanner.snapshot());
  handle('rfid:start', config => rfidScanner.start(config));
  handle('rfid:stop', () => rfidScanner.stop());
  handle('rfid:restart', config => rfidScanner.restart(config));
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
  if (queue.state.settings.adapter === 'raw') {
    queue.state.settings = { deviceName: '', paperWidth: queue.state.settings.paperWidth || 58, adapter: 'system' };
    queue.save();
  }
  const installedPrinters = await mainWindow.webContents.getPrintersAsync().catch(() => []);
  const currentPrinter = queue.state.settings.deviceName;
  if (queue.state.settings.adapter === 'system' && !currentPrinter && installedPrinters.length) {
    const defaultPrinter = installedPrinters.find(printer => [printer.name, printer.displayName].some(value => String(value || '').trim().toLowerCase() === 'pos 80'))
      || installedPrinters.find(printer => printer.isDefault)
      || installedPrinters[0];
    queue.state.settings.deviceName = defaultPrinter.name;
    queue.save();
  }
  await queue.resume();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(createWindow).catch(error => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { void rfidScanner?.stop(); server?.close(); });
}
