import { useCallback, useEffect, useState } from 'react';
import { Play, Radio, RefreshCw, RotateCcw, Square } from 'lucide-react';
import type { RfidLogEntry, RfidScannerState } from '@/lib/desktop';

const defaultConfig = { port: '', baudRate: 9600, deviceId: 'RPi-POS-01', serverUrl: 'https://api-seltpos.soudev.site' };
const statusText: Record<RfidScannerState['status'], string> = {
  stopped: 'ຢຸດຢູ່', starting: 'ກຳລັງເລີ່ມ', running: 'ກຳລັງເຮັດວຽກ', stopping: 'ກຳລັງຢຸດ', error: 'ມີບັນຫາ',
};

export function RfidPage() {
  const desktop = window.posDesktop;
  const [state, setState] = useState<RfidScannerState | null>(null);
  const [config, setConfig] = useState(defaultConfig);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!desktop) return;
    const next = await desktop.rfidState();
    setState(next);
    setConfig(next.config);
  }, [desktop]);

  useEffect(() => {
    if (!desktop) return;
    void refresh().catch(error => setMessage(error instanceof Error ? error.message : 'ບໍ່ສາມາດອ່ານສະຖານະ RFID'));
    const unsubscribe = desktop.onRfidEvent(event => {
      if (event.type === 'state') setState(event.data as RfidScannerState);
      if (event.type === 'log') setState(previous => previous ? { ...previous, logs: [...previous.logs, event.data as RfidLogEntry] } : previous);
    });
    const timer = window.setInterval(() => void refresh().catch(() => {}), 2000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, [desktop, refresh]);

  async function action(work: () => Promise<RfidScannerState>) {
    setBusy(true); setMessage('');
    try { setState(await work()); } catch (error) { setMessage(error instanceof Error ? error.message : 'ບໍ່ສາມາດສັ່ງ RFID scanner ໄດ້'); } finally { setBusy(false); }
  }

  if (!desktop) return <p>ກະລຸນາເປີດຜ່ານແອັບ POS</p>;
  const status = state?.status || 'stopped';
  const active = status === 'running' || status === 'starting' || status === 'stopping';
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const field = 'mt-2 w-full rounded-lg border border-slate-300 p-3';

  return <section className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold">ຈັດການ RFID Reader</h1><p className="mt-2 text-slate-500">ເປີດ, ຢຸດ, restart ແລະເບິ່ງ log ຈາກ RFID reader ທີ່ຕໍ່ກັບ POS</p></div>
      <div className={`rounded-full px-4 py-2 text-sm font-black ${status === 'running' ? 'bg-emerald-100 text-emerald-700' : status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}><span className="mr-2 inline-block h-2 w-2 rounded-full bg-current" />{statusText[status]}{state?.pid ? ` · PID ${state.pid}` : ''}</div>
    </header>
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3"><Radio className="h-8 w-8 text-purple-700" /><h2 className="text-xl font-black">ຕັ້ງຄ່າ</h2></div>
        <label className="block text-sm font-bold text-slate-600">Port <span className="font-normal text-slate-400">(ວ່າງ = auto discover)</span><input className={`${field} font-mono uppercase`} value={config.port} placeholder="COM3" onChange={e => setConfig({ ...config, port: e.target.value.toUpperCase() })} /></label>
        <label className="block text-sm font-bold text-slate-600">Baud rate<input type="number" min="1" className={`${field} font-mono`} value={config.baudRate} onChange={e => setConfig({ ...config, baudRate: Number(e.target.value) })} /></label>
        <label className="block text-sm font-bold text-slate-600">Device ID<input className={`${field} font-mono`} value={config.deviceId} onChange={e => setConfig({ ...config, deviceId: e.target.value })} /></label>
        <label className="block text-sm font-bold text-slate-600">Server URL<input className={`${field} font-mono text-xs`} value={config.serverUrl} onChange={e => setConfig({ ...config, serverUrl: e.target.value })} /></label>
        <div className="grid gap-2">
          <button className={`${button} bg-emerald-600 text-white hover:bg-emerald-700`} disabled={busy || active} onClick={() => void action(() => desktop.rfidStart(config))}><Play className="h-4 w-4" />Run</button>
          <button className={`${button} bg-slate-700 text-white hover:bg-slate-800`} disabled={busy || !active} onClick={() => void action(() => desktop.rfidStop())}><Square className="h-4 w-4" />Stop</button>
          <button className={`${button} border border-purple-200 text-purple-700 hover:bg-purple-50`} disabled={busy} onClick={() => void action(() => desktop.rfidRestart(config))}><RotateCcw className="h-4 w-4" />Restart</button>
          <button className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50`} disabled={busy} onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Refresh</button>
        </div>
        {state?.executablePath && <p className="break-all text-xs leading-5 text-slate-400">Scanner: {state.executablePath}</p>}
        {state?.logFile && <p className="break-all text-xs leading-5 text-slate-400">Full log: {state.logFile}</p>}
        {message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{message}</p>}
      </div>
      <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-xl font-black text-white">RFID log</h2><span className="text-xs text-slate-400">{state?.logs.length || 0} lines</span></div>
        <pre className="h-[520px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-4 font-mono text-xs leading-5 text-emerald-300">{state?.logs.length ? state.logs.map(log => `[${new Date(log.at).toLocaleTimeString()}] ${log.stream}: ${log.text}`).join('\n') : 'ຍັງບໍ່ມີ log — ກົດ Run ເພື່ອເລີ່ມ scanner'}</pre>
      </div>
    </div>
  </section>;
}
