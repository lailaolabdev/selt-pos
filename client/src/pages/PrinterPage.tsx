import { useCallback, useEffect, useState } from 'react';
import { printerText as text, type DesktopState, type PrinterInfo, type PrinterSettings, type SerialPortInfo, type UsbPrinterInfo } from '@/lib/desktop';
import { CheckCircle2, Printer, RefreshCw, TestTube2 } from 'lucide-react';

const validUsbId = (value: string) => /^(?:0x)?[0-9a-f]{1,4}$/i.test(value) && Number.parseInt(value.replace(/^0x/i, ''), 16) > 0;

export function PrinterPage() {
  const [state, setState] = useState<DesktopState | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinterInfo[]>([]);
  const [usbDiscoveryError, setUsbDiscoveryError] = useState(false);
  const [settings, setSettings] = useState<PrinterSettings>({ deviceName: '', paperWidth: 58, adapter: 'system' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const desktop = window.posDesktop;
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const [devices, ports, usb, next] = await Promise.all([desktop.listPrinters(), desktop.listSerialPorts(), desktop.listUsbPrinters().then(devices => ({ devices, error: false }), () => ({ devices: [] as UsbPrinterInfo[], error: true })), desktop.getState()]);
    const configuredPrinterExists = devices.some(device => device.name === next.settings.deviceName);
    const defaultPrinter = devices.find(device => [device.name, device.displayName].some(value => value.trim().toLowerCase() === 'pos 80'))
      || devices.find(device => device.isDefault)
      || devices[0];
    const selectedSettings: PrinterSettings = {
      ...next.settings,
      ...(next.settings.adapter === 'system' && !configuredPrinterExists ? { deviceName: defaultPrinter?.name || '' } : {}),
    };
    setState(next); setSettings(selectedSettings); setPrinters(devices); setSerialPorts(ports); setUsbPrinters(usb.devices); setUsbDiscoveryError(usb.error);
  }, [desktop]);
  useEffect(() => { void refresh().catch(() => setMessage(text.error)); }, [refresh]);
  async function action(work: () => Promise<unknown>, success = text.saved) {
    setBusy(true); setMessage('');
    try { await work(); await refresh(); setMessage(success); } catch (error) { setMessage(error instanceof Error ? error.message : text.error); } finally { setBusy(false); }
  }
  const readyToTest = settings.adapter === 'system' ? Boolean(settings.deviceName)
    : settings.adapter === 'raw-spooler' ? Boolean(settings.deviceName.trim())
    : settings.adapter === 'raw-usb' ? validUsbId(settings.usbVendorId || '') && validUsbId(settings.usbProductId || '')
    : settings.adapter === 'raw-network' ? Boolean(settings.printerIp && settings.printerPort)
      : settings.adapter === 'raw-serial' ? Boolean(settings.portPath && settings.baudRate) : false;
  const testSelectedPrinter = () => action(async () => {
    if (!readyToTest) throw new Error('ກະລຸນາຕັ້ງຄ່າການເຊື່ອມຕໍ່ printer ໃຫ້ຄົບ');
    await desktop!.configure(settings);
    await desktop!.testPrint();
  }, text.note);
  if (!desktop) return <p>{text.browser}</p>;
  const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-purple-700 px-5 py-3 font-bold text-white transition-colors hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50';
  return <section className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">{text.title}</h1>
      <p className="mt-2 text-slate-500">ຄົ້ນຫາເຄື່ອງພິມຈາກ Electron, Windows ແລະ USB ເພື່ອພິມໃບຮັບເງິນ</p>
    </header>
    <div className="grid max-w-3xl gap-6">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xl font-black">ຄິວເຄື່ອງພິມ Windows</h2><p className="mt-1 text-sm text-slate-500">{printers.length ? `${printers.length} ເຄື່ອງ` : 'ບໍ່ພົບເຄື່ອງພິມ'}</p></div>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => void action(refresh)}><RefreshCw className="h-4 w-4" />{text.refresh}</button>
        </div>
        {printers.length ? <div className="grid gap-3">{printers.map(printer => <button key={printer.name} type="button" disabled={busy} onClick={() => setSettings({ ...settings, deviceName: printer.name, adapter: /^USB\d+$/i.test(printer.portName || '') ? 'raw-spooler' : settings.adapter === 'raw-spooler' ? 'raw-spooler' : 'system' })} className={`flex min-h-24 w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${settings.deviceName === printer.name ? 'border-purple-600 bg-purple-50' : 'border-slate-200 hover:border-purple-300'}`}><Printer className="h-8 w-8 shrink-0 text-purple-700" /><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-800">{printer.displayName || printer.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{printer.name}</span><span className="mt-1 block text-xs font-bold text-emerald-600">{printer.portName ? `${printer.portName} · ` : ''}{printer.isDefault ? 'ເຄື່ອງພິມຫຼັກ' : 'ພ້ອມໃຊ້'}</span></span>{settings.deviceName === printer.name && <CheckCircle2 className="h-5 w-5 shrink-0 text-purple-700" />}</button>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">ບໍ່ພົບຄິວເຄື່ອງພິມ. ຖ້າໃຊ້ Zadig ໃຫ້ເລືອກວິທີ USB ຜ່ານ Zadig; ຖ້າໃຊ້ຄິວ Windows ໃຫ້ເລືອກວິທີ USB ຜ່ານຄິວ Windows</div>}
      </div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">ຕັ້ງຄ່າ ແລະ ທົດສອບ</h2>
        <label className="block text-sm font-bold text-slate-600">{text.connection}<select className="mt-2 w-full rounded-lg border border-slate-300 p-3" value={settings.adapter} onChange={e => setSettings({ ...settings, adapter: e.target.value as PrinterSettings['adapter'] })}><option value="system">{text.systemSpooler}</option><option value="raw-usb">{text.rawUsb}</option><option value="raw-spooler">{text.rawSpooler}</option><option value="raw-network">{text.rawNetwork}</option><option value="raw-serial">{text.rawSerial}</option></select></label>
        {settings.adapter === 'system' && <p className="rounded-lg bg-purple-50 p-3 text-sm font-semibold text-purple-800">ວິທີນີ້ໃຊ້ Windows driver ແລະຄ່າ Auto cut ຂອງ driver.</p>}
        {settings.adapter === 'raw-usb' && <div className="space-y-3"><p className="rounded-lg bg-purple-50 p-3 text-sm font-semibold text-purple-800">ໃຊ້ກັບເຄື່ອງພິມທີ່ຕິດຕັ້ງ WinUSB ຜ່ານ Zadig. ວິທີນີ້ສົ່ງ ESC/POS ແລະຄຳສັ່ງຕັດເຈ້ຍໄປທີ່ USB ໂດຍກົງ; ບໍ່ໃຊ້ຄິວ Windows ຫຼື USB008.</p>{usbDiscoveryError && <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">ອ່ານລາຍຊື່ USB ບໍ່ໄດ້. ກວດກາການຕິດຕັ້ງແອັບ ຫຼືໃສ່ VID/PID ເອງ.</p>}{usbPrinters.length > 0 && <div className="grid gap-2">{usbPrinters.map(printer => <button key={`${printer.vendorId}:${printer.productId}:${printer.busNumber}:${printer.deviceAddress}`} type="button" disabled={busy} onClick={() => setSettings({ ...settings, adapter: 'raw-usb', usbVendorId: printer.vendorId, usbProductId: printer.productId })} className={`min-h-11 rounded-lg border px-3 py-2 text-left font-mono text-sm ${settings.usbVendorId === printer.vendorId && settings.usbProductId === printer.productId ? 'border-purple-600 bg-purple-50 text-purple-800' : 'border-slate-300 text-slate-700'}`}>{printer.vendorId.toUpperCase()}:{printer.productId.toUpperCase()} · USB {printer.busNumber}/{printer.deviceAddress}</button>)}</div>}{!usbDiscoveryError && !usbPrinters.length && <p className="text-sm font-semibold text-slate-500">ບໍ່ພົບເຄື່ອງພິມ USB ອັດຕະໂນມັດ; ສາມາດໃສ່ VID/PID ຈາກ Zadig ໄດ້</p>}<div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold text-slate-600">ລະຫັດຜູ້ຜະລິດ (VID)<input className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" placeholder="0x1234" value={settings.usbVendorId || ''} onChange={e => setSettings({ ...settings, usbVendorId: e.target.value.trim() })} /></label><label className="block text-sm font-bold text-slate-600">ລະຫັດອຸປະກອນ (PID)<input className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" placeholder="0x5678" value={settings.usbProductId || ''} onChange={e => setSettings({ ...settings, usbProductId: e.target.value.trim() })} /></label></div></div>}
        {settings.adapter === 'raw-spooler' && <div className="space-y-3"><label className="block text-sm font-bold text-slate-600">ຊື່ຄິວເຄື່ອງພິມໃນ Windows<input className="mt-2 w-full rounded-lg border border-slate-300 p-3" placeholder="PrinterPOS-80" value={settings.deviceName} onChange={e => setSettings({ ...settings, deviceName: e.target.value })} /></label><p className="rounded-lg bg-purple-50 p-3 text-sm font-semibold text-purple-800">USB008 ແມ່ນຊື່ພອດ ບໍ່ແມ່ນ COM Port. ໃຫ້ໃສ່ຊື່ເຄື່ອງພິມໃນ Windows ເຊັ່ນ PrinterPOS-80; ລະບົບຈະສົ່ງ ESC/POS ແລະຄຳສັ່ງຕັດເຈ້ຍຜ່ານຄິວນັ້ນ.</p></div>}
        {settings.adapter === 'raw-network' && <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3"><label className="block text-sm font-bold text-slate-600">IP ເຄື່ອງພິມ<input className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" inputMode="decimal" placeholder="192.168.1.50" value={settings.printerIp || ''} onChange={e => setSettings({ ...settings, printerIp: e.target.value.trim() })} /></label><label className="block text-sm font-bold text-slate-600">Port<input className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" type="number" min="1" max="65535" value={settings.printerPort ?? 9100} onChange={e => setSettings({ ...settings, printerPort: Number(e.target.value) })} /></label><p className="col-span-full rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">ໃຊ້ໄດ້ກັບ printer ທີ່ຮອງຮັບ ESC/POS ຜ່ານ TCP (ປົກກະຕິ Port 9100). ສົ່ງຄຳສັ່ງຕັດກະດາດໂດຍກົງ.</p></div>}
        {settings.adapter === 'raw-serial' && <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-bold text-slate-600">COM Port<select className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" value={settings.portPath || ''} onChange={e => setSettings({ ...settings, portPath: e.target.value })}><option value="">ເລືອກ COM Port</option>{serialPorts.map(port => <option key={port.path} value={port.path}>{port.path} · {port.displayName}</option>)}</select></label><label className="block text-sm font-bold text-slate-600">Baud rate<select className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" value={settings.baudRate ?? 115200} onChange={e => setSettings({ ...settings, baudRate: Number(e.target.value) })}>{[9600, 19200, 38400, 57600, 115200].map(rate => <option key={rate} value={rate}>{rate}</option>)}</select></label><p className="col-span-full rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800">ເລືອກ COM Port ທີ່ຜູກກັບ printer. ຄວາມໄວ baud rate ຕ້ອງກົງກັບຄ່າຂອງ printer.</p></div>}
        <label className="block text-sm font-bold text-slate-600">{text.paper}<select className="mt-2 w-full rounded-lg border border-slate-300 p-3" value={settings.paperWidth} onChange={e => setSettings({ ...settings, paperWidth: Number(e.target.value) as 58 | 80 })}><option value="58">58 mm</option><option value="80">80 mm</option></select></label>
        {settings.adapter === 'system' && <div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-bold text-slate-500">ເຄື່ອງທີ່ເລືອກ:</span><p className="mt-1 truncate font-black text-slate-800">{printers.find(printer => printer.name === settings.deviceName)?.displayName || text.select}</p></div>}
        <div className="grid gap-2"><button className={buttonClass} disabled={busy || !readyToTest} onClick={() => void action(() => desktop.configure(settings))}>{text.save}</button><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-purple-200 px-5 py-3 font-bold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !readyToTest} onClick={testSelectedPrinter}><TestTube2 className="h-4 w-4" />{text.test}</button></div>
        <p className="text-xs leading-5 text-slate-500">{text.note}</p><p role="status" className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">{message}</p>
      </div>
    </div>
    <h2 className="text-xl font-bold">{text.jobs}</h2>
    {!state?.jobs.length && <p>{text.empty}</p>}
    {state?.jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-4"><div><p className="font-mono text-sm">{job.paymentId}</p><p>{text.status[job.status]}</p></div>{['failed', 'uncertain', 'submitted', 'mock'].includes(job.status) && <button className={buttonClass} disabled={busy} onClick={() => { if (job.status === 'failed' || window.confirm(text.confirm)) void action(() => desktop.retry(job.id)); }}>{text.retry}</button>}</div>)}
  </section>;
}
