const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const test = require('node:test');

test('escpos-usb discovers VID/PID and sends the full raster, feed, and cut in USB chunks', async () => {
  const transferred = [];
  let closed = false;
  const vendorId = 0x1234;
  const productId = 0x5678;
  const endpoint = { direction: 'out', transfer: (data, callback) => { transferred.push(Buffer.from(data)); callback(null); } };
  const iface = { altSetting: 0, setAltSetting: (_setting, callback) => callback(), isKernelDriverActive: () => false, claim: () => {}, endpoints: [endpoint] };
  const device = {
    deviceDescriptor: { idVendor: vendorId, idProduct: productId },
    configDescriptor: { interfaces: [[{ bInterfaceClass: 7 }]] },
    busNumber: 1,
    deviceAddress: 2,
    interfaces: [iface],
    open: () => {},
    close: () => { closed = true; },
  };
  let devices = [device];
  const fakeUsb = {
    usb: new EventEmitter(),
    getDeviceList: () => devices,
    findByIds: (vid, pid) => devices.find(item => item.deviceDescriptor.idVendor === vid && item.deviceDescriptor.idProduct === pid),
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === 'usb' ? fakeUsb : originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('escpos-usb')];
    const { listUsbPrinters, writeUsb } = require('./usb-printer.cjs');
    const { printRaster } = require('./raw-printer.cjs');
    assert.deepEqual(listUsbPrinters(), [{ vendorId: '1234', productId: '5678', busNumber: 1, deviceAddress: 2 }]);
    const width = 576;
    const height = 300;
    await printRaster({ bitmap: Buffer.alloc(width * height * 4, 255), width, height, connection: 'usb', usbVendorId: vendorId, usbProductId: productId });
    assert.equal(closed, true);
    assert.ok(transferred.length > 1);
    assert.ok(transferred.every(chunk => chunk.length <= 16 * 1024));
    const receipt = Buffer.concat(transferred);
    assert.deepEqual(receipt.subarray(0, 2), Buffer.from([0x1b, 0x40]));
    assert.deepEqual(receipt.subarray(-6), Buffer.from([0x1b, 0x64, 0x03, 0x1d, 0x56, 0x00]));
    devices = [device, { ...device, deviceAddress: 3 }];
    await assert.rejects(writeUsb(Buffer.from([0x1b]), vendorId, productId), /VID\/PID/);
    devices = [device];
    endpoint.transfer = (_data, callback) => callback(new Error('LIBUSB_ERROR_ACCESS'));
    await assert.rejects(writeUsb(Buffer.from([0x1b]), vendorId, productId), /WinUSB.*Zadig/);
    devices = [];
    await assert.rejects(writeUsb(Buffer.from([0x1b]), vendorId, productId), /ບໍ່ພົບ/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('escpos-usb')];
  }
});
