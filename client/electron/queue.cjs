const fs = require('node:fs');
class PrintQueue {
  constructor(file, adapter) {
    this.file = file; this.adapter = adapter; this.tail = Promise.resolve();
    this.state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { settings: { deviceName: '', paperWidth: 80, adapter: 'system' }, jobs: [] };
    for (const job of this.state.jobs) if (job.status === 'printing') { job.status = 'uncertain'; job.error = 'App stopped while submitting; check paper before retry'; }
    this.save();
  }
  save() {
    const fd = fs.openSync(this.file + '.tmp', 'w');
    try { fs.writeFileSync(fd, JSON.stringify(this.state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(this.file + '.tmp', this.file);
  }
  serial(fn) { const result = this.tail.then(fn); this.tail = result.catch(() => {}); return result; }
  enqueue(paymentId) { return this.serial(async () => {
    let job = this.state.jobs.find(j => j.paymentId === paymentId);
    if (!job) { job = { id: paymentId, paymentId, status: 'queued', attempts: 0, createdAt: new Date().toISOString() }; this.state.jobs.push(job); this.save(); }
    if (job.status === 'queued') await this.run(job);
    return { ...job };
  }); }
  retry(id) { return this.serial(async () => {
    const job = this.state.jobs.find(j => j.id === id);
    if (!job || !['failed', 'uncertain', 'submitted', 'mock'].includes(job.status)) throw new Error('Job cannot be retried');
    job.reprint = Boolean(job.reprint) || ['submitted', 'mock', 'uncertain'].includes(job.status); job.status = 'queued'; this.save();
    await this.run(job); return { ...job };
  }); }
  async run(job) {
    try {
      // Fetch and render before marking printing: failures here are safe to retry.
      const prepared = await this.adapter.prepare(job, this.state.settings);
      job.status = 'printing'; job.attempts++; job.error = ''; this.save();
      job.status = await this.adapter.print(prepared, this.state.settings);
    } catch (error) { job.status = job.status === 'printing' ? 'uncertain' : 'failed'; job.error = error.message; }
    this.save();
  }
  resume() { return this.serial(async () => { for (const job of this.state.jobs) if (job.status === 'queued') await this.run(job); }); }
}
module.exports = { PrintQueue };
