/** Device adapter contract used by the durable queue. Never called directly by React. */
export interface ReceiptPrinter {
  prepare(job: { paymentId: string; reprint?: boolean }, settings: { deviceName: string; paperWidth: 58 | 80; adapter: 'system' | 'mock' }): Promise<string>;
  print(html: string, settings: { deviceName: string; paperWidth: 58 | 80; adapter: 'system' | 'mock' }): Promise<'submitted' | 'mock'>;
}
