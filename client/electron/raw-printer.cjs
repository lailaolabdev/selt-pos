const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { writeUsb } = require('./usb-printer.cjs');

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

function runPowerShell(script, variables = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      env: { ...process.env, ...variables },
    });
    let output = '';
    let error = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { error += chunk.toString(); });
    child.on('error', cause => { clearTimeout(timer); reject(cause); });
    child.on('close', code => {
      clearTimeout(timer);
      code === 0 ? resolve(output) : reject(new Error(error.trim() || `PowerShell printer command stopped or timed out after ${timeoutMs} ms`));
    });
  });
}

async function listWindowsPrinters() {
  if (process.platform !== 'win32') return [];
  const script = `
$ErrorActionPreference = 'Stop'
@(Get-CimInstance Win32_Printer | ForEach-Object {
  [pscustomobject]@{ name = $_.Name; displayName = $_.Name; portName = $_.PortName; isDefault = [bool]$_.Default; status = [int]$_.PrinterStatus }
}) | ConvertTo-Json -Compress
`;
  try {
    const parsed = JSON.parse((await runPowerShell(script, {}, 15000)).trim());
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(item => item?.name);
  } catch {
    return [];
  }
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
    const output = (await runPowerShell(script, {}, 15000)).trim();
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

async function writeWindowsQueue(file, printerName) {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class RawPosPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DocInfo {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern int StartDocPrinter(IntPtr handle, int level, ref DocInfo info);
  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);
  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  private static extern bool ClosePrinter(IntPtr handle);

  public static void Send(string name, byte[] data) {
    IntPtr handle;
    if (!OpenPrinter(name, out handle, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    try {
      var info = new DocInfo { pDocName = "4B POS Receipt", pDatatype = "RAW" };
      if (StartDocPrinter(handle, 1, ref info) == 0) throw new Win32Exception(Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(handle)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
          int written;
          if (!WritePrinter(handle, data, data.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());
          if (written != data.Length) throw new Exception("Incomplete printer write");
        } finally { EndPagePrinter(handle); }
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
'@
[RawPosPrinter]::Send($env:POS_PRINTER_NAME, [System.IO.File]::ReadAllBytes($env:POS_PRINT_DATA_PATH))
`;
  await runPowerShell(script, { POS_PRINTER_NAME: printerName, POS_PRINT_DATA_PATH: file });
}

async function printRaster({ bitmap, width, height, connection = 'serial', portPath = 'COM1', baudRate = 115200, printerIp, printerPort = 9100, printerName, usbVendorId, usbProductId }) {
  if (['serial', 'spooler'].includes(connection) && process.platform !== 'win32') throw new Error('Raw Windows printer requires Windows');
  if (!['serial', 'network', 'spooler', 'usb'].includes(connection)) throw new Error('Unknown raw printer connection');
  if (!Buffer.isBuffer(bitmap) || bitmap.length !== width * height * 4 || width <= 0 || height <= 0 || height > 65535) {
    throw new Error('Invalid receipt bitmap dimensions');
  }
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
  if (connection === 'usb') {
    await writeUsb(data, usbVendorId, usbProductId);
    return;
  }
  await fs.writeFile(file, data);
  try {
    if (connection === 'spooler') {
      if (!printerName || !printerName.trim()) throw new Error('ກະລຸນາໃສ່ຊື່ຄິວເຄື່ອງພິມ Windows');
      await writeWindowsQueue(file, printerName.trim());
      return;
    }
    const script = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.IO.Ports',
      '$port = New-Object System.IO.Ports.SerialPort($env:POS_SERIAL_PORT, [int]$env:POS_SERIAL_BAUD, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)',
      '$port.Handshake = [System.IO.Ports.Handshake]::None',
      '$port.WriteTimeout = 60000',
      '$port.Open()',
      '$bytes = [System.IO.File]::ReadAllBytes($env:POS_PRINT_DATA_PATH)',
      '$port.Write($bytes, 0, $bytes.Length)',
      '$drainMs = [Math]::Ceiling(($bytes.Length * 10 * 1000) / [int]$env:POS_SERIAL_BAUD) + 500',
      'Start-Sleep -Milliseconds $drainMs',
      '$port.Close()',
    ].join('; ');
    await runPowerShell(script, { POS_SERIAL_PORT: portPath, POS_SERIAL_BAUD: String(baudRate), POS_PRINT_DATA_PATH: file });
  } finally {
    await fs.rm(file, { force: true });
  }
}

module.exports = { listSerialPorts, listWindowsPrinters, printRaster };
