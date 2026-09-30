// Runs against an isolated profile and a fake payment server; never charges or prints.
const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-desktop-check-'));
const paymentId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const receipt = { paymentId, status: 'PAID', deviceId: 'RPi-POS-01', orderNo: 'TEST-ORDER', amount: 12000, paidAt: '2026-09-28T10:00:00Z', paymentMethod: 'PhaJay', items: [{ name: 'ນ້ຳດື່ມ', count: 2, subtotal: 12000 }] };
let requests = 0, desktop;
const server = http.createServer((req, res) => { requests++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(receipt)); });
const env = { ...process.env, POS_KIOSK: '0' }; delete env.ELECTRON_RUN_AS_NODE;
async function launch() {
  desktop = await electron.launch({ executablePath: process.env.POS_CHECK_EXECUTABLE || require('electron'), args: [...(process.env.POS_CHECK_EXECUTABLE ? [] : ['.']), '--user-data-dir=' + profile], cwd: path.resolve(__dirname, '..'), env, timeout: 60000 });
  const page = await desktop.firstWindow();
  await page.route('http://localhost:3000/**', route => {
    const url = route.request().url();
    const data = url.includes('/status') ? receipt : { deviceId: 'RPi-POS-01', mode: 'CHECKOUT', status: 'IDLE', result: { items: [], tagIds: [], totalPrice: 0 } };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.waitForFunction(() => !!window.posDesktop);
  return page;
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  env.POS_API_URL = `http://127.0.0.1:${server.address().port}`;
  let page = await launch();
  await page.evaluate(() => window.posDesktop.configure({ adapter: 'mock', deviceName: '', paperWidth: 80 }));
  await page.evaluate(id => {
    localStorage.setItem('pos-active-payment-v1', JSON.stringify({ deviceId: 'RPi-POS-01', payment: { paymentId: id, orderNo: 'TEST', amount: 12000, status: 'WAITING' } }));
  }, paymentId);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.posDesktop.getState().then(s => s.jobs[0]?.status))).toBe('mock');
  const duplicates = await page.evaluate(id => Promise.all([window.posDesktop.printReceipt(id), window.posDesktop.printReceipt(id)]), paymentId);
  assert.equal(duplicates.length, 2); assert.equal(requests, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem('pos-active-payment-v1')), null);
  await page.evaluate(() => localStorage.setItem('4b-admin-session', JSON.stringify({ accessToken: 'test', expiresAt: Date.now() + 60000, admin: { username: 'staff', displayName: 'Staff' } })));
  await page.goto('http://127.0.0.1:17831/admin/printer');
  await expect(page.getByRole('heading', { name: 'ຕັ້ງຄ່າເຄື່ອງພິມ' })).toBeVisible();
  await page.screenshot({ path: path.join(profile, 'printer-settings.png'), fullPage: true });
  const secure = await desktop.evaluate(({ BrowserWindow }) => {
    const pref = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { node: pref.nodeIntegration, isolation: pref.contextIsolation, sandbox: pref.sandbox };
  });
  assert.deepEqual(secure, { node: false, isolation: true, sandbox: true });
  // Exercise real HTML preparation/submission with a fake OS callback (no paper).
  await desktop.evaluate(({ BrowserWindow, app }) => {
    const main = BrowserWindow.getAllWindows()[0];
    main.webContents.getPrintersAsync = async () => [{ name: 'TEST-PRINTER', displayName: 'Test', isDefault: true, status: 0 }];
    app.on('browser-window-created', (_event, win) => {
      win.webContents.print = (options, callback) => { globalThis.__testPrintOptions = options; callback(true); };
    });
  });
  await page.evaluate(() => window.posDesktop.configure({ adapter: 'system', deviceName: 'TEST-PRINTER', paperWidth: 58 }));
  assert.equal(await page.evaluate(() => window.posDesktop.testPrint()), 'submitted');
  const options = await desktop.evaluate(() => globalThis.__testPrintOptions);
  assert.equal(options.silent, true); assert.equal(options.deviceName, 'TEST-PRINTER'); assert.equal(options.pageSize.width, 58000);
  await page.evaluate(() => window.posDesktop.configure({ adapter: 'mock', deviceName: '', paperWidth: 80 }));
  // Render the actual offline Lao receipt in Chromium and export a PDF for visual QA.
  const { receiptHtml } = require('../electron/receipt.cjs');
  const font = 'data:font/woff2;base64,' + fs.readFileSync(path.resolve(__dirname, '../public/fonts/noto-sans-lao.woff2')).toString('base64');
  const html = receiptHtml(receipt, 80, font);
  const pdfBase64 = await desktop.evaluate(async ({ BrowserWindow }, html) => {
    const win = new BrowserWindow({ show: false, width: 350, height: 550, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
    const pdf = await win.webContents.printToPDF({ pageSize: { width: 3.15, height: 5 }, printBackground: true });
    return pdf.toString('base64');
  }, html);
  fs.writeFileSync(path.join(profile, 'receipt.pdf'), Buffer.from(pdfBase64, 'base64'));
  const receiptPage = desktop.context().pages().find(p => p.url().startsWith('data:'));
  await receiptPage.screenshot({ path: path.join(profile, 'receipt.png') });
  await desktop.close(); desktop = null;
  env.POS_KIOSK = '1';
  page = await launch();
  assert.equal(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isKiosk()), true);
  await page.evaluate(id => window.posDesktop.printReceipt(id), paymentId);
  assert.equal(requests, 1);
  console.log(JSON.stringify({ passed: true, checks: ['paid recovery', 'duplicate protection', 'restart persistence', 'printer settings UI', 'sandboxed IPC', 'offline Lao receipt rendering', 'silent OS submission adapter', 'kiosk mode'], artifacts: profile }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await desktop?.close(); server.close(); });
