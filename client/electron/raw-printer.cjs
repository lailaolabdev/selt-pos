const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');

function rasterCommand(bitmap, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = Buffer.alloc(bytesPerRow * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 4;
      const blue = bitmap[pixel];
      const green = bitmap[pixel + 1];
      const red = bitmap[pixel + 2];
      const alpha = bitmap[pixel + 3];
      if (alpha > 20 && (red + green + blue) / 3 < 210) {
        data[y * bytesPerRow + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]),
    data,
  ]);
}

function runPowerShell(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script, ...args], { windowsHide: true });
    let output = '';
    let error = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { error += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(error.trim() || `PowerShell exited with code ${code}`)));
  });
}

async function listSerialPorts() {
  if (process.platform !== 'win32') return [];
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$ports = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match "\\(COM\\d+\\)" } | ForEach-Object {',
    '  $match = [regex]::Match($_.Name, "\\(COM\\d+\\)")',
    '  [pscustomobject]@{ path = $match.Value.TrimStart("(").TrimEnd(")"); displayName = $_.Name }',
    '})',
    '$ports | ConvertTo-Json -Compress',
  ].join('; ');
  try {
    const output = (await runPowerShell(script)).trim();
    if (!output) return [];
    const parsed = JSON.parse(output);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(item => item?.path).map(item => ({ path: item.path, displayName: item.displayName || item.path }));
  } catch {
    return [];
  }
}

function writeNetwork(data, printerIp, printerPort = 9100) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printerIp, port: Number(printerPort) });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    socket.setTimeout(10000, () => finish(new Error(`Network printer timeout: ${printerIp}:${printerPort}`)));
    socket.once('error', finish);
    socket.once('connect', () => socket.end(data, () => finish()));
  });
}

async function printRaster({ bitmap, width, height, connection = 'serial', portPath = 'COM1', baudRate = 9600, printerIp, printerPort = 9100 }) {
  if (process.platform !== 'win32') throw new Error('Raw printer requires Windows');
  const file = path.join(os.tmpdir(), `4b-pos-print-${crypto.randomUUID()}.bin`);
  const data = Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    rasterCommand(bitmap, width, height),
    Buffer.from([0x1b, 0x64, 0x03]),
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
  if (connection === 'network') {
    if (!printerIp || !net.isIP(printerIp)) throw new Error('Enter a valid printer IP address');
    await writeNetwork(data, printerIp, printerPort);
    return;
  }
  await fs.writeFile(file, data);
  try {
    const script = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.IO.Ports',
      '$port = New-Object System.IO.Ports.SerialPort($args[0], [int]$args[1], [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)',
      '$port.Handshake = [System.IO.Ports.Handshake]::RequestToSend',
      '$port.Open()',
      '$bytes = [System.IO.File]::ReadAllBytes($args[2])',
      '$port.Write($bytes, 0, $bytes.Length)',
      'Start-Sleep -Milliseconds 250',
      '$port.Close()',
    ].join('; ');
    await runPowerShell(script, [portPath, String(baudRate), file]);
  } finally {
    await fs.rm(file, { force: true });
  }
}

module.exports = { listSerialPorts, printRaster };
