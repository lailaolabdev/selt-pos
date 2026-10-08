import { useCallback, useEffect, useState } from 'react';
import { printerText as text, type DesktopState, type PrinterInfo, type PrinterSettings } from '@/lib/desktop';
import { CheckCircle2, Printer, RefreshCw, TestTube2 } from 'lucide-react';

export function PrinterPage() {
  const [state, setState] = useState<DesktopState | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [settings, setSettings] = useState<PrinterSettings>({ deviceName: 'COM1', paperWidth: 80, adapter: 'raw', connection: 'serial', printerIp: '192.168.1.100', printerPort: 9100, baudRate: 9600 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const desktop = window.posDesktop;
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const devices = await desktop.listPrinters();
    const next = await desktop.getState();
    const configuredPrinterExists = devices.some(device => device.name === next.settings.deviceName);
    const defaultPrinter = devices.find(device => device.isDefault) || devices[0];
    const selectedSettings: PrinterSettings = {
      ...next.settings,
      connection: next.settings.connection || 'serial',
      printerIp: next.settings.printerIp || '192.168.1.100',
      printerPort: next.settings.printerPort || 9100,
      baudRate: next.settings.baudRate || 9600,
      ...(next.settings.adapter === 'system' && !configuredPrinterExists && defaultPrinter ? { deviceName: defaultPrinter.name } : {}),
    };
    setState(next); setSettings(selectedSettings); setPrinters(devices);
  }, [desktop]);
  useEffect(() => { void refresh().catch(() => setMessage(text.error)); }, [refresh]);
  async function action(work: () => Promise<unknown>, success = text.saved) {
    setBusy(true); setMessage('');
    try { await work(); await refresh(); setMessage(success); } catch { setMessage(text.error); } finally { setBusy(false); }
  }
  const testSelectedPrinter = () => action(async () => {
    if (settings.adapter === 'system' && !settings.deviceName) throw new Error('Select a printer');
    await desktop!.configure(settings);
    await desktop!.testPrint();
  }, text.note);
  if (!desktop) return <p>{text.browser}</p>;
  const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-purple-700 px-5 py-3 font-bold text-white transition-colors hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50';
  return <section className="space-y-6">
    <header>
      <h1 className="text-3xl font-bold">{text.title}</h1>
      <p className="mt-2 text-slate-500">ຄົ້ນຫາເຄື່ອງພິມຈາກ Electron ແລະ ເລືອກເຄື່ອງທີ່ໃຊ້ພິມໃບຮັບເງິນ</p>
    </header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xl font-black">ເຄື່ອງພິມທີ່ພົບ</h2><p className="mt-1 text-sm text-slate-500">{printers.length ? `${printers.length} ເຄື່ອງ` : 'ບໍ່ພົບເຄື່ອງພິມ'}</p></div>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-4 font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => void action(refresh)}><RefreshCw className="h-4 w-4" />{text.refresh}</button>
        </div>
        {printers.length ? <div className="grid gap-3 sm:grid-cols-2">{printers.map(printer => <button key={printer.name} type="button" disabled={busy} onClick={() => setSettings({ ...settings, deviceName: printer.name, adapter: printer.displayName.includes('USB raw') ? 'raw' : 'system', connection: printer.displayName.includes('USB raw') ? 'serial' : settings.connection })} className={`flex min-h-24 items-center gap-3 rounded-xl border-2 p-4 text-left transition-colors ${settings.deviceName === printer.name ? 'border-purple-600 bg-purple-50' : 'border-slate-200 hover:border-purple-300'}`}><Printer className="h-8 w-8 shrink-0 text-purple-700" /><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-800">{printer.displayName || printer.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{printer.name}</span><span className="mt-1 block text-xs font-bold text-emerald-600">{printer.displayName.includes('USB raw') ? 'USB raw ESC/POS' : printer.isDefault ? 'Default printer' : 'Available'}</span></span>{settings.deviceName === printer.name && <CheckCircle2 className="h-5 w-5 shrink-0 text-purple-700" />}</button>)}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">ບໍ່ພົບ USB/COM — ສາມາດເລືອກພິມຜ່ານ IP ດ້ານລຸ່ມໄດ້</div>}
      </div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black">ຕັ້ງຄ່າ ແລະ ທົດສອບ</h2>
        <label className="block text-sm font-bold text-slate-600">ຮູບແບບການພິມ<select className="mt-2 w-full rounded-lg border border-slate-300 p-3" value={settings.adapter} onChange={e => setSettings({ ...settings, deviceName: e.target.value === 'raw' ? (settings.deviceName || 'COM1') : settings.deviceName, adapter: e.target.value as PrinterSettings['adapter'] })}><option value="raw">{text.usb} / POS-80</option><option value="system">{text.system}</option><option value="mock">{text.mock}</option></select></label>
        {settings.adapter === 'raw' && <>
          <label className="block text-sm font-bold text-slate-600">ຊ່ອງທາງການເຊື່ອມຕໍ່<select className="mt-2 w-full rounded-lg border border-slate-300 p-3" value={settings.connection || 'serial'} onChange={e => setSettings({ ...settings, connection: e.target.value as 'serial' | 'network' })}><option value="serial">{text.serial} — auto detect</option><option value="network">{text.network}</option></select></label>
          {settings.connection === 'network' ? <>
            <label className="block text-sm font-bold text-slate-600">{text.ip}<input className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" value={settings.printerIp || ''} placeholder="192.168.1.100" onChange={e => setSettings({ ...settings, printerIp: e.target.value })} /></label>
            <label className="block text-sm font-bold text-slate-600">{text.port}<input type="number" min="1" max="65535" className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono" value={settings.printerPort || 9100} onChange={e => setSettings({ ...settings, printerPort: Number(e.target.value) })} /></label>
          </> : <label className="block text-sm font-bold text-slate-600">COM port<input className="mt-2 w-full rounded-lg border border-slate-300 p-3 font-mono uppercase" value={settings.deviceName || ''} placeholder="COM1" onChange={e => setSettings({ ...settings, deviceName: e.target.value.toUpperCase() })} /></label>}
        </>}
        <label className="block text-sm font-bold text-slate-600">{text.paper}<select className="mt-2 w-full rounded-lg border border-slate-300 p-3" value={settings.paperWidth} onChange={e => setSettings({ ...settings, paperWidth: Number(e.target.value) as 58 | 80 })}><option value="58">58 mm</option><option value="80">80 mm</option></select></label>
        <div className="rounded-lg bg-slate-50 p-3 text-sm"><span className="font-bold text-slate-500">ເຄື່ອງທີ່ເລືອກ:</span><p className="mt-1 truncate font-black text-slate-800">{settings.adapter === 'mock' ? text.mock : settings.adapter === 'raw' ? (settings.connection === 'network' ? `${settings.printerIp || 'ຍັງບໍ່ໃສ່ IP'}:${settings.printerPort || 9100}` : `${settings.deviceName || 'COM1'} · ${settings.baudRate || 9600} baud · RTS`) : settings.deviceName || text.select}</p></div>
        <div className="grid gap-2"><button className={buttonClass} disabled={busy || (settings.adapter === 'system' && !settings.deviceName) || (settings.adapter === 'raw' && settings.connection === 'network' && !settings.printerIp)} onClick={() => void action(() => desktop.configure(settings))}>{text.save}</button><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-purple-200 px-5 py-3 font-bold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || (settings.adapter === 'system' && !settings.deviceName) || (settings.adapter === 'raw' && settings.connection === 'network' && !settings.printerIp)} onClick={testSelectedPrinter}><TestTube2 className="h-4 w-4" />{text.test}</button></div>
        <p className="text-xs leading-5 text-slate-500">{text.note}</p><p role="status" className="rounded-lg bg-slate-50 p-3 text-sm font-bold text-slate-700">{message}</p>
      </div>
    </div>
    <h2 className="text-xl font-bold">{text.jobs}</h2>
    {!state?.jobs.length && <p>{text.empty}</p>}
    {state?.jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-4"><div><p className="font-mono text-sm">{job.paymentId}</p><p>{text.status[job.status]}</p></div>{['failed', 'uncertain', 'submitted', 'mock'].includes(job.status) && <button className={buttonClass} disabled={busy} onClick={() => { if (job.status === 'failed' || window.confirm(text.confirm)) void action(() => desktop.retry(job.id)); }}>{text.retry}</button>}</div>)}
  </section>;
}
