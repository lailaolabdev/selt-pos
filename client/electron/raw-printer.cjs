const { SerialPort } = require('serialport');

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

function openPort(path, baudRate) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path, baudRate, rtscts: true, autoOpen: false });
    port.open(error => error ? reject(error) : resolve(port));
  });
}

function writePort(port, data) {
  return new Promise((resolve, reject) => {
    port.write(data, error => {
      if (error) return reject(error);
      port.drain(drainError => drainError ? reject(drainError) : resolve());
    });
  });
}

async function printRaster({ bitmap, width, height, portPath = 'COM1', baudRate = 9600 }) {
  const port = await openPort(portPath, baudRate);
  try {
    await writePort(port, Buffer.concat([
      Buffer.from([0x1b, 0x40]),
      rasterCommand(bitmap, width, height),
      Buffer.from([0x1b, 0x64, 0x03]),
      Buffer.from([0x1d, 0x56, 0x00]),
    ]));
  } finally {
    await new Promise(resolve => port.close(() => resolve()));
  }
}

module.exports = { printRaster };
