import { useCallback, useEffect, useState } from 'react';
import { printerText as text, type DesktopState, type PrinterInfo, type PrinterSettings } from '@/lib/desktop';
export function PrinterPage() {
  const [state, setState] = useState<DesktopState | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [settings, setSettings] = useState<PrinterSettings>({ deviceName: '', paperWidth: 80, adapter: 'system' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const desktop = window.posDesktop;
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const [next, devices] = await Promise.all([desktop.getState(), desktop.listPrinters()]);
    const configuredPrinterExists = devices.some(device => device.name === next.settings.deviceName);
    const defaultPrinter = devices.find(device => device.isDefault) || devices[0];
    const selectedSettings = next.settings.adapter === 'system' && !configuredPrinterExists && defaultPrinter
      ? { ...next.settings, deviceName: defaultPrinter.name }
      : next.settings;
    setState(next); setSettings(selectedSettings); setPrinters(devices);
  }, [desktop]);
  useEffect(() => { void refresh().catch(() => setMessage(text.error)); }, [refresh]);
  async function action(work: () => Promise<unknown>, success = text.saved) {
    setBusy(true); setMessage('');
    try { await work(); await refresh(); setMessage(success); } catch { setMessage(text.error); } finally { setBusy(false); }
  }
  if (!desktop) return <p>{text.browser}</p>;
  const buttonClass = 'rounded-lg bg-purple-700 px-5 py-3 font-bold text-white disabled:opacity-50';
  return <section className="space-y-6">
    <h1 className="text-3xl font-bold">{text.title}</h1>
    <div className="space-y-4 rounded-xl bg-white p-6">
      <label className="block">{text.title}<select className="ml-4 rounded border p-3" value={settings.adapter} onChange={e => setSettings({ ...settings, adapter: e.target.value as PrinterSettings['adapter'] })}><option value="system">{text.system}</option><option value="mock">{text.mock}</option></select></label>
      <label className="block">{text.select}<select className="ml-4 rounded border p-3" disabled={settings.adapter === 'mock'} value={settings.deviceName} onChange={e => setSettings({ ...settings, deviceName: e.target.value })}><option value="">{text.select}</option>{printers.map(p => <option key={p.name} value={p.name}>{p.displayName || p.name}</option>)}</select></label>
      <label className="block">{text.paper}<select className="ml-4 rounded border p-3" value={settings.paperWidth} onChange={e => setSettings({ ...settings, paperWidth: Number(e.target.value) as 58 | 80 })}><option value="58">58 mm</option><option value="80">80 mm</option></select></label>
      <div className="flex gap-3"><button className={buttonClass} disabled={busy} onClick={() => void action(() => desktop.configure(settings))}>{text.save}</button><button className={buttonClass} disabled={busy} onClick={() => void action(() => desktop.testPrint(), text.note)}>{text.test}</button><button className={buttonClass} disabled={busy} onClick={() => void action(refresh)}>{text.refresh}</button></div>
      <p>{text.note}</p><p role="status">{message}</p>
    </div>
    <h2 className="text-xl font-bold">{text.jobs}</h2>
    {!state?.jobs.length && <p>{text.empty}</p>}
    {state?.jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-4"><div><p className="font-mono text-sm">{job.paymentId}</p><p>{text.status[job.status]}</p></div>{['failed', 'uncertain', 'submitted', 'mock'].includes(job.status) && <button className={buttonClass} disabled={busy} onClick={() => { if (job.status === 'failed' || window.confirm(text.confirm)) void action(() => desktop.retry(job.id)); }}>{text.retry}</button>}</div>)}
  </section>;
}
