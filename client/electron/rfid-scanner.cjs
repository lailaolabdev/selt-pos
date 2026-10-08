const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function executableCandidates() {
  const name = process.platform === 'win32' ? 'cart_scanner.exe' : 'cart_scanner';
  return [
    process.env.RFID_SCANNER_PATH,
    process.platform === 'win32' ? path.join('C:\\', 'hub_scanner', 'cart_scanner.exe') : null,
    path.join(process.resourcesPath, 'rfid', name),
    path.join(__dirname, 'bin', name),
    path.join(__dirname, '../../hub_scanner', name),
    path.join(__dirname, '../../hub_scanner', 'cart_scanner'),
  ].filter(Boolean);
}

function findExecutable() {
  return executableCandidates().find(candidate => fs.existsSync(candidate)) || null;
}

class RfidScanner {
  constructor({ stateFile, apiUrl, deviceId, onEvent }) {
    this.stateFile = stateFile;
    this.defaultApiUrl = apiUrl || 'https://api-seltpos.soudev.site';
    this.onEvent = onEvent;
    this.child = null;
    this.buffer = { stdout: '', stderr: '' };
    this.state = {
      status: 'stopped',
      pid: null,
      executablePath: findExecutable(),
      logFile: path.join(path.dirname(stateFile), 'rfid-scanner.log'),
      config: {
        port: '',
        baudRate: 9600,
        deviceId: deviceId || 'RPi-POS-01',
        serverUrl: this.defaultApiUrl,
      },
      logs: [],
    };
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      this.state.config = { ...this.state.config, ...(saved.config || {}) };
    } catch {
      // First run: use defaults.
    }
    this.state.executablePath = findExecutable();
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(this.state.config.serverUrl)) {
      this.state.config.serverUrl = this.defaultApiUrl;
      this.save();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(this.stateFile, JSON.stringify({ config: this.state.config }, null, 2));
  }

  emit(type, data) {
    this.onEvent?.(type, data);
  }

  snapshot() {
    return {
      ...this.state,
      executablePath: this.state.executablePath,
    };
  }

  appendLog(stream, text) {
    if (stream === 'system') {
      const entry = { at: new Date().toISOString(), stream, text: text.trim() };
      if (entry.text) this.state.logs.push(entry);
      this.writeLogFile(entry);
      this.emit('log', entry);
      return;
    }
    this.buffer[stream] += text;
    const lines = this.buffer[stream].split(/\r?\n/);
    this.buffer[stream] = lines.pop() || '';
    for (const line of lines) {
      if (!line) continue;
      const entry = { at: new Date().toISOString(), stream, text: line };
      this.state.logs.push(entry);
      this.writeLogFile(entry);
      this.emit('log', entry);
    }
    this.emit('state', this.snapshot());
  }

  writeLogFile(entry) {
    try {
      fs.mkdirSync(path.dirname(this.state.logFile), { recursive: true });
      fs.appendFileSync(this.state.logFile, `[${entry.at}] [${entry.stream}] ${entry.text}\n`);
    } catch {
      // The live Electron log remains available even if the file cannot be written.
    }
  }

  updateStatus(status, error = '') {
    this.state.status = status;
    this.state.pid = this.child?.pid || null;
    if (error) this.appendLog('system', error);
    else this.emit('state', this.snapshot());
  }

  configure(config = {}) {
    const next = {
      ...this.state.config,
      port: typeof config.port === 'string' ? config.port.trim() : this.state.config.port,
      baudRate: Number(config.baudRate || this.state.config.baudRate || 9600),
      deviceId: typeof config.deviceId === 'string' && config.deviceId.trim() ? config.deviceId.trim() : this.state.config.deviceId,
      serverUrl: typeof config.serverUrl === 'string' && config.serverUrl.trim() ? config.serverUrl.trim().replace(/\/$/, '') : this.state.config.serverUrl,
    };
    if (!Number.isInteger(next.baudRate) || next.baudRate <= 0) throw new Error('RFID baud rate must be a positive number');
    this.state.config = next;
    this.save();
    return this.state.config;
  }

  start(config) {
    if (this.child && !this.child.killed) return this.snapshot();
    const executable = findExecutable();
    this.state.executablePath = executable;
    if (!executable) throw new Error('RFID scanner executable not found. Build cart_scanner for this POS first.');
    this.configure(config);
    const env = { ...process.env, RFID_SERVER_URL: this.state.config.serverUrl, RFID_DEVICE_ID: this.state.config.deviceId, RFID_BAUD: String(this.state.config.baudRate) };
    if (this.state.config.port) env.RFID_PORT = this.state.config.port;
    else delete env.RFID_PORT;
    this.buffer = { stdout: '', stderr: '' };
    this.state.logs = [];
    this.writeLogFile({ at: new Date().toISOString(), stream: 'system', text: '--- RFID scanner started ---' });
    this.child = spawn(executable, [], { cwd: path.dirname(executable), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.state.status = 'starting';
    this.state.pid = this.child.pid || null;
    this.emit('state', this.snapshot());
    this.child.stdout.on('data', chunk => this.appendLog('stdout', chunk.toString()));
    this.child.stderr.on('data', chunk => this.appendLog('stderr', chunk.toString()));
    this.child.once('spawn', () => this.updateStatus('running'));
    this.child.once('error', error => this.updateStatus('error', `Process error: ${error.message}`));
    this.child.once('close', (code, signal) => {
      if (this.buffer.stdout) this.appendLog('stdout', `${this.buffer.stdout}\n`);
      if (this.buffer.stderr) this.appendLog('stderr', `${this.buffer.stderr}\n`);
      this.child = null;
      this.state.pid = null;
      if (this.state.status !== 'error') this.state.status = code === 0 ? 'stopped' : 'error';
      this.appendLog('system', `RFID scanner stopped (code=${code ?? 'null'}, signal=${signal || 'none'})\n`);
      this.emit('state', this.snapshot());
    });
    return this.snapshot();
  }

  async stop() {
    if (!this.child || this.child.killed) {
      this.state.status = 'stopped';
      this.state.pid = null;
      return this.snapshot();
    }
    const child = this.child;
    this.state.status = 'stopping';
    this.emit('state', this.snapshot());
    await new Promise(resolve => {
      const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} resolve(); }, 3000);
      child.once('close', () => { clearTimeout(timer); resolve(); });
      try { child.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
    });
    return this.snapshot();
  }

  async restart(config) {
    await this.stop();
    return this.start(config);
  }
}

module.exports = { RfidScanner };
