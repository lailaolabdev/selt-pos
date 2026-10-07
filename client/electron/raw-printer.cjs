const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
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

async function printRaster({ bitmap, width, height, portPath = 'COM1', baudRate = 9600 }) {
  if (process.platform !== 'win32') throw new Error('Raw COM printer requires Windows');
  const file = path.join(os.tmpdir(), `4b-pos-print-${crypto.randomUUID()}.bin`);
  const data = Buffer.concat([
    Buffer.from([0x1b, 0x40]),
    rasterCommand(bitmap, width, height),
    Buffer.from([0x1b, 0x64, 0x03]),
    Buffer.from([0x1d, 0x56, 0x00]),
  ]);
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
    await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script, portPath, String(baudRate), file], { windowsHide: true });
      let error = '';
      child.stderr.on('data', chunk => { error += chunk.toString(); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(error.trim() || `COM printer exited with code ${code}`)));
    });
  } finally {
    await fs.rm(file, { force: true });
  }
}

module.exports = { printRaster };
