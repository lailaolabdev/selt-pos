/** Device adapter contract used by the durable queue. Never called directly by React. */
export interface ReceiptPrinter {
  prepare(job: { paymentId: string; reprint?: boolean }, settings: { deviceName: string; paperWidth: 58 | 80; adapter: 'system' | 'raw-network' | 'raw-serial' | 'raw-spooler' | 'raw-usb' | 'mock'; printerIp?: string; printerPort?: number; portPath?: string; baudRate?: number; usbVendorId?: string; usbProductId?: string }): Promise<string>;
  print(html: string, settings: { deviceName: string; paperWidth: 58 | 80; adapter: 'system' | 'raw-network' | 'raw-serial' | 'raw-spooler' | 'raw-usb' | 'mock'; printerIp?: string; printerPort?: number; portPath?: string; baudRate?: number; usbVendorId?: string; usbProductId?: string }): Promise<'submitted' | 'mock'>;
}
export interface RfidScannerConfig { port: string; baudRate: number; deviceId: string; serverUrl: string }
export interface RfidLogEntry { at: string; stream: 'stdout' | 'stderr' | 'system'; text: string }
export interface RfidScannerState { status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error'; pid: number | null; executablePath: string | null; logFile?: string; config: RfidScannerConfig; logs: RfidLogEntry[] }
