const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PrintQueue } = require('./queue.cjs');
const { receiptHtml } = require('./receipt.cjs');
function fixture(adapter) { return new PrintQueue(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pos-print-')), 'queue.json'), adapter); }
test('socket and polling duplicates submit exactly once, including restart', async () => {
  let calls = 0;
  const adapter = { prepare: async () => 'receipt', print: async () => { calls++; return 'submitted'; } };
  const q = fixture(adapter);
  await Promise.all([q.enqueue('paid'), q.enqueue('paid'), q.enqueue('paid')]);
  assert.equal(calls, 1);
  const restarted = new PrintQueue(q.file, adapter);
  await restarted.enqueue('paid'); assert.equal(calls, 1);
  await restarted.retry('paid'); assert.equal(calls, 2); assert.equal(restarted.state.jobs[0].reprint, true);
});
test('network or offline printer failure stays retryable without submitting', async () => {
  let offline = true, calls = 0;
  const q = fixture({ prepare: async () => { if (offline) throw new Error('offline'); return 'receipt'; }, print: async () => { calls++; return 'submitted'; } });
  assert.equal((await q.enqueue('paid')).status, 'failed'); assert.equal(calls, 0);
  offline = false; assert.equal((await q.retry('paid')).status, 'submitted'); assert.equal(calls, 1);
});
test('interrupted submission never automatically reprints', async () => {
  let calls = 0;
  const adapter = { prepare: async () => 'receipt', print: async () => { calls++; throw new Error('timeout'); } };
  const q = fixture(adapter);
  assert.equal((await q.enqueue('paid')).status, 'uncertain');
  const restarted = new PrintQueue(q.file, adapter);
  await restarted.resume(); await restarted.enqueue('paid'); assert.equal(calls, 1);
  restarted.state.jobs[0].status = 'printing'; restarted.save();
  const crashed = new PrintQueue(q.file, adapter); assert.equal(crashed.state.jobs[0].status, 'uncertain');
});
test('receipt rejects unpaid or mismatched totals and escapes product markup', () => {
  const receipt = { status: 'PAID', orderNo: 'ORDER', amount: 1000, items: [{ name: '<script>alert(1)</script>', count: 1, subtotal: 1000 }] };
  assert.match(receiptHtml(receipt, 58, 'data:font/woff2;base64,AA'), /&lt;script&gt;/);
  assert.throws(() => receiptHtml({ ...receipt, status: 'WAITING' }, 80, ''));
  assert.throws(() => receiptHtml({ ...receipt, amount: 2000 }, 80, ''));
});
