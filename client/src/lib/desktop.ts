export type PrintStatus = 'queued' | 'printing' | 'submitted' | 'failed' | 'uncertain' | 'mock';
export interface PrintJob { id: string; paymentId: string; status: PrintStatus; attempts: number; createdAt: string; error?: string }
export interface PrinterSettings {
  deviceName: string;
  paperWidth: 58 | 80;
  adapter: 'system' | 'raw' | 'mock';
  connection?: 'serial' | 'network';
  printerIp?: string;
  printerPort?: number;
  baudRate?: number;
}
export interface PrinterInfo { name: string; displayName: string; isDefault: boolean; status: number }
export interface DesktopState { settings: PrinterSettings; jobs: PrintJob[] }
export interface RfidScannerConfig { port: string; baudRate: number; deviceId: string; serverUrl: string }
export interface RfidLogEntry { at: string; stream: 'stdout' | 'stderr' | 'system'; text: string }
export interface RfidScannerState { status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'; pid: number | null; executablePath: string | null; logFile?: string; config: RfidScannerConfig; logs: RfidLogEntry[] }
declare global {
  interface Window {
    posDesktop?: {
      listPrinters(): Promise<PrinterInfo[]>;
      getState(): Promise<DesktopState>;
      configure(settings: PrinterSettings): Promise<PrinterSettings>;
      printReceipt(paymentId: string): Promise<PrintJob>;
      retry(id: string): Promise<PrintJob>;
      testPrint(): Promise<'submitted' | 'mock'>;
      rfidState(): Promise<RfidScannerState>;
      rfidStart(config: RfidScannerConfig): Promise<RfidScannerState>;
      rfidStop(): Promise<RfidScannerState>;
      rfidRestart(config: RfidScannerConfig): Promise<RfidScannerState>;
      onRfidEvent(callback: (event: { type: 'state' | 'log'; data: RfidScannerState | RfidLogEntry }) => void): () => void;
      openPayment(paymentId: string): Promise<boolean>;
      closePayment(): Promise<boolean>;
    };
  }
}
export const printerText = {
  title: 'ຕັ້ງຄ່າເຄື່ອງພິມ', browser: 'ກະລຸນາເປີດຜ່ານແອັບ POS ເພື່ອໃຊ້ເຄື່ອງພິມ',
  system: 'ເຄື່ອງພິມຈິງ', mock: 'ຈຳລອງການພິມ', select: 'ເລືອກເຄື່ອງພິມ',
  usb: 'USB / COM ອັດຕະໂນມັດ', network: 'ພິມຜ່ານ IP', serial: 'USB / COM', ip: 'IP ເຄື່ອງພິມ', port: 'Port TCP',
  paper: 'ຂະໜາດເຈ້ຍ', save: 'ບັນທຶກ', test: 'ພິມທົດສອບ', refresh: 'ໂຫຼດໃໝ່',
  saved: 'ບັນທຶກແລ້ວ', error: 'ບໍ່ສາມາດດຳເນີນການໄດ້ ກະລຸນາກວດເຄື່ອງພິມ ແລະການເຊື່ອມຕໍ່',
  jobs: 'ລາຍການພິມ', empty: 'ຍັງບໍ່ມີລາຍການພິມ', retry: 'ພິມອີກຄັ້ງ',
  confirm: 'ກວດເຈ້ຍກ່ອນ: ໃບຮັບເງິນອາດພິມແລ້ວ. ຕ້ອງການພິມອີກຄັ້ງບໍ?',
  note: 'ສົ່ງງານແລ້ວ ໝາຍເຖິງສົ່ງເຂົ້າລະບົບພິມ; ກະລຸນາກວດເຈ້ຍທີ່ເຄື່ອງພິມ',
  paid: 'ຊຳລະສຳເລັດ',
  status: { queued: 'ລໍຖ້າພິມ', printing: 'ກຳລັງສົ່ງງານ', submitted: 'ສົ່ງງານພິມແລ້ວ', failed: 'ພິມບໍ່ສຳເລັດ', uncertain: 'ກະລຸນາກວດເຈ້ຍກ່ອນພິມຊ້ຳ', mock: 'ຈຳລອງສຳເລັດ' } satisfies Record<PrintStatus, string>,
};
