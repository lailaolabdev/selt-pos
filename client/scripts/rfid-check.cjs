// Real Nest JSON API + Socket.IO + React in an isolated database/profile.
// Captures are simulated; this test never opens RFID hardware or creates a payment.
const { chromium, expect } = require('@playwright/test');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-rfid-flow-'));
const children = [];
let browser, serverLogs = '';
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function start(cmd, args, cwd, env) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', data => { serverLogs += data; });
  child.stderr.on('data', data => { serverLogs += data; });
  child.on('error', error => { serverLogs += error.message; });
  return child;
}
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Could not start ' + url + '\n' + serverLogs);
}
(async () => {
  const apiPort = await freePort(), webPort = await freePort();
  const api = `http://127.0.0.1:${apiPort}`, web = `http://127.0.0.1:${webPort}`;
  start(process.execPath, ['dist/main.js'], path.join(root, 'server'), {
    PORT: String(apiPort), STORAGE_DRIVER: 'json', JSON_DB_PATH: path.join(artifacts, 'db.json'),
    ADMIN_USERNAME: 'rfid-test', ADMIN_PASSWORD: 'rfid-test-password', ADMIN_TOKEN_SECRET: 'isolated-test-secret',
    MONGO_URI: 'mongodb://127.0.0.1:1/unreachable', PHAJAY_TEST_KEY: 'unused-test-key', PHAJAY_SECRET_KEY: 'unused-test-key',
  });
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], path.join(root, 'client'), {
    VITE_API_URL: api, VITE_SOCKET_URL: api, VITE_DEVICE_ID: 'RPi-POS-01',
  });
  await Promise.all([waitFor(api + '/products'), waitFor(web)]);
  const call = async (endpoint, data, token, method = 'POST') => {
    const response = await fetch(api + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const body = await response.json();
    assert.ok(response.ok, JSON.stringify(body));
    return body;
  };
  const capture = (tagIds, status = 'STABLE', deviceId = 'RPi-POS-01') => call('/tags/capture', { deviceId, tagIds, status });
  const snapshot = () => fetch(api + '/session/RPi-POS-01/snapshot').then(r => r.json());
  const login = await call('/auth/admin/login', { username: 'rfid-test', password: 'rfid-test-password' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  await context.addInitScript(session => localStorage.setItem('4b-admin-session', JSON.stringify(session)), {
    accessToken: login.accessToken, expiresAt: Date.now() + 600000, admin: login.admin,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(web);
  await expect.poll(async () => (await snapshot()).mode).toBe('CHECKOUT');
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await expect.poll(async () => (await snapshot()).mode).toBe('IDLE');
  // A tag already held before opening the form is recovered from CHECK snapshot.
  await capture(['3721168358']);
  await page.getByRole('button', { name: 'ເພີ່ມສິນຄ້າ', exact: true }).click();
  const modal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'ເພີ່ມສິນຄ້າໃໝ່' }) });
  await expect.poll(async () => (await snapshot()).mode).toBe('CHECK');
  await expect(modal.locator('textarea')).toHaveValue('3721168358');
  const go = await promisify(execFile)('go', ['test', './cmd/cart_scanner', '-run', '^TestFramedReaderAgainstJSONServer$', '-count=1', '-v'], {
    cwd: path.join(root, 'hub_scanner'), env: { ...process.env, RFID_TEST_SERVER_URL: api }, timeout: 30000,
  });
  assert.match(go.stdout, /PASS/);
  assert.match(go.stdout, /Server received capture/);
  await expect(modal.locator('textarea')).toHaveValue('3721168358\n3721168362');
  await capture(['WRONG-DEVICE'], 'STABLE', 'OTHER-POS');
  await expect(modal.locator('textarea')).toHaveValue('3721168358\n3721168362');
  // Snapshot polling must not undo a user's removal of a tag from the form.
  await modal.getByRole('button', { name: 'Remove RFID tag 3721168362', exact: true }).click();
  await capture(['3721168358', '3721168362']);
  await expect(modal.locator('textarea')).toHaveValue('3721168358');
  await capture([], 'IDLE');
  await capture(['3721168358', '3721168362']);
  await expect(modal.locator('textarea')).toHaveValue('3721168358\n3721168362');
  await modal.locator('input').nth(0).fill('RFID flow water');
  await modal.locator('input').nth(1).fill('RFID-FLOW-WATER');
  await modal.locator('input').nth(2).fill('1500');
  await modal.locator('input').nth(3).fill('2');
  await modal.locator('input').nth(4).fill('drink');
  await modal.getByRole('button', { name: 'ບັນທຶກສິນຄ້າ', exact: true }).click();
  await expect(modal).toHaveCount(0);
  const product = (await fetch(api + '/products').then(r => r.json())).find(p => p.sku === 'RFID-FLOW-WATER');
  assert.ok(product);
  const tags = await call('/tags/product/' + product._id, undefined, login.accessToken, 'GET');
  assert.equal(tags.length, 2);
  await page.goto(web);
  await expect.poll(async () => (await snapshot()).mode).toBe('CHECKOUT');
  await capture(['3721168358', '3721168362'], 'SCANNING');
  await expect(page.getByText('RFID flow water', { exact: true })).toBeVisible();
  assert.equal((await snapshot()).status, 'SCANNING');
  await expect(page.locator('#checkout-payment-button')).toBeDisabled();
  await capture(['3721168358', '3721168362']);
  await expect(page.getByText('ພ້ອມຊຳລະເງິນ', { exact: true }).first()).toBeVisible();
  await expect(page.locator('#checkout-payment-button')).toBeEnabled();
  await page.screenshot({ path: path.join(artifacts, 'pos-cart.png'), fullPage: true });
  await call('/tags/sync', { deviceId: 'RPi-POS-01', mode: 'add', productId: product._id, tagIds: ['SOLD-TAG'] }, login.accessToken);
  await call('/tags/confirm-sale', { transactionId: 'ISOLATED-TEST', tagIds: ['SOLD-TAG'] }, login.accessToken, 'PATCH');
  await capture(['3721168358', 'SOLD-TAG', 'UNREGISTERED-TAG']);
  await expect(page.getByRole('alert')).toContainText('UNREGISTERED-TAG');
  await expect(page.getByRole('alert')).toContainText('SOLD-TAG');
  await capture([],'IDLE');
  await expect(page.getByText('RFID flow water', { exact: true })).toHaveCount(0);
  // HTTP recovery works when Socket.IO is disconnected.
  await page.evaluate(async () => (await import('/src/lib/socket.ts')).socket.disconnect());
  await capture(['3721168362']);
  await expect(page.getByText('RFID flow water', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.reload();
  await expect(page.getByText('RFID flow water', { exact: true })).toBeVisible();
  // Edit form includes known + unknown tags, even when found tags coexist.
  await page.getByRole('link', { name: 'Admin', exact: true }).click();
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-pencil') }).first().click();
  const editModal = page.locator('.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'ແກ້ໄຂສິນຄ້າ', exact: true }) });
  await expect.poll(async () => (await snapshot()).mode).toBe('CHECK');
  await capture(['3721168358', 'NEW-TAG']);
  await expect.poll(() => editModal.locator('textarea').inputValue()).toContain('NEW-TAG');
  await expect.poll(() => editModal.locator('textarea').inputValue()).toContain('3721168358');
  await expect.poll(() => editModal.locator('textarea').inputValue()).toContain('SOLD-TAG');
  await page.screenshot({ path: path.join(artifacts, 'product-rfid-tags.png'), fullPage: true });
  await editModal.getByRole('button', { name: 'ບັນທຶກການແກ້ໄຂ', exact: true }).click();
  await expect(editModal).toHaveCount(0);
  const editedTags = await call('/tags/product/' + product._id, undefined, login.accessToken, 'GET');
  assert.equal(editedTags.find(t => t.tagId === 'SOLD-TAG').status, 'sold');
  assert.ok(editedTags.find(t => t.tagId === 'NEW-TAG'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ['page mode transitions', 'held tag recovery', 'register product by RFID', 'device filtering', 'manual tag removal', 'actual Go sender', 'Socket.IO POS cart', 'scanning status', 'unknown/sold tag feedback', 'empty cart', 'HTTP fallback', 'reload recovery', 'edit known + unknown tags', 'sold status preserved'], artifacts }));
})().catch(error => { console.error(error); console.error('Artifacts: ' + artifacts); process.exitCode = 1; }).finally(async () => {
  fs.writeFileSync(path.join(artifacts, 'server.log'), serverLogs);
  await browser?.close();
  for (const child of children) child.kill('SIGTERM');
});
