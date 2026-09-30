const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('posDesktop', {
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  getState: () => ipcRenderer.invoke('printer:state'),
  configure: settings => ipcRenderer.invoke('printer:configure', settings),
  printReceipt: paymentId => ipcRenderer.invoke('printer:enqueue', paymentId),
  retry: id => ipcRenderer.invoke('printer:retry', id),
  testPrint: () => ipcRenderer.invoke('printer:test'),
  closePayment: () => ipcRenderer.invoke('payment:close'),
  openPayment: paymentId => ipcRenderer.invoke('payment:open', paymentId),
});
