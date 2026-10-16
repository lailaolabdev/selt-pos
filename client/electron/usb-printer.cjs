const USB_TRANSFER_BYTES = 16 * 1024;

function usbAdapter() {
  // escpos-usb still calls the pre-v2 top-level event API. node-usb v2 keeps
  // that API on `usb.usb`, while its device lookup functions remain top-level.
  const usb = require('usb');
  if (typeof usb.on !== 'function' && usb.usb) {
    usb.on = usb.usb.on.bind(usb.usb);
    usb.removeAllListeners = usb.usb.removeAllListeners.bind(usb.usb);
  }
  return require('escpos-usb');
}

function listUsbPrinters() {
  const USB = usbAdapter();
  return USB.findPrinter().map(device => ({
    vendorId: device.deviceDescriptor.idVendor.toString(16).padStart(4, '0'),
    productId: device.deviceDescriptor.idProduct.toString(16).padStart(4, '0'),
    busNumber: device.busNumber,
    deviceAddress: device.deviceAddress,
  }));
}

function callAdapter(adapter, method, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`USB printer ${method} timed out`)), 20000);
    const complete = error => {
      clearTimeout(timer);
      error ? reject(error) : resolve();
    };
    try {
      adapter[method](...args, complete);
    } catch (error) {
      complete(error);
    }
  });
}

function usbPrintError(error) {
  const detail = String(error?.message || error);
  if (/LIBUSB_ERROR_(?:NOT_SUPPORTED|ACCESS|BUSY)/i.test(detail)) {
    return new Error('ເປີດ USB printer ບໍ່ໄດ້: ກວດວ່າເລືອກ WinUSB ໃນ Zadig ແລະປິດແອັບອື່ນທີ່ໃຊ້ເຄື່ອງພິມ', { cause: error });
  }
  if (/LIBUSB_ERROR_NO_DEVICE/i.test(detail)) {
    return new Error('USB printer ຫຼຸດການເຊື່ອມຕໍ່; ກະລຸນາກວດສາຍ USB ແລະເປີດເຄື່ອງພິມ', { cause: error });
  }
  if (/USB printer .* timed out/i.test(detail)) {
    return new Error('USB printer ບໍ່ຕອບສະໜອງ; ກະລຸນາກວດສາຍ USB ແລະເປີດເຄື່ອງພິມ', { cause: error });
  }
  return error;
}

async function writeUsb(data, vendorId, productId) {
  if (!Buffer.isBuffer(data) || !data.length) throw new Error('Invalid USB print data');
  if (![vendorId, productId].every(id => Number.isInteger(id) && id > 0 && id <= 0xffff)) throw new Error('Invalid USB printer VID/PID');
  const USB = usbAdapter();
  const matches = require('usb').getDeviceList().filter(device =>
    device.deviceDescriptor.idVendor === vendorId && device.deviceDescriptor.idProduct === productId);
  if (!matches.length) throw new Error('ບໍ່ພົບເຄື່ອງພິມ USB ທີ່ເລືອກ');
  if (matches.length > 1) throw new Error('ພົບ USB ທີ່ມີ VID/PID ຄືກັນຫຼາຍອັນ; ກະລຸນາຕໍ່ເຄື່ອງພິມພຽງໜຶ່ງເຄື່ອງ');
  const adapter = new USB(vendorId, productId);
  let printError;
  try {
    await callAdapter(adapter, 'open');
    adapter.endpoint.timeout = 15000;
    for (let offset = 0; offset < data.length; offset += USB_TRANSFER_BYTES) {
      await callAdapter(adapter, 'write', data.subarray(offset, offset + USB_TRANSFER_BYTES));
    }
  } catch (error) {
    printError = error;
    throw usbPrintError(error);
  } finally {
    try {
      await callAdapter(adapter, 'close');
    } catch (error) {
      if (!printError) throw error;
    }
  }
}

module.exports = { listUsbPrinters, writeUsb };
