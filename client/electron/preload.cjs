const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('posDesktop', {
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  getState: () => ipcRenderer.invoke('printer:state'),
  configure: settings => ipcRenderer.invoke('printer:configure', settings),
  printReceipt: paymentId => ipcRenderer.invoke('printer:enqueue', paymentId),
  retry: id => ipcRenderer.invoke('printer:retry', id),
  testPrint: () => ipcRenderer.invoke('printer:test'),
  rfidState: () => ipcRenderer.invoke('rfid:state'),
  rfidStart: config => ipcRenderer.invoke('rfid:start', config),
  rfidStop: () => ipcRenderer.invoke('rfid:stop'),
  rfidRestart: config => ipcRenderer.invoke('rfid:restart', config),
  onRfidEvent: callback => {
    const listener = (_event, event) => callback(event);
    ipcRenderer.on('rfid:event', listener);
    return () => ipcRenderer.removeListener('rfid:event', listener);
  },
  closePayment: () => ipcRenderer.invoke('payment:close'),
  openPayment: paymentId => ipcRenderer.invoke('payment:open', paymentId),
});
