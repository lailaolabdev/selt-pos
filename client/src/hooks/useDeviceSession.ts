import { useEffect, useEffectEvent, useState } from 'react';
import { api } from '@/lib/api';
import { socket } from '@/lib/socket';
import { useCartStore, type DeviceMode } from '@/store/useCartStore';

export interface DeviceScan {
  deviceId: string;
  mode: DeviceMode;
  status?: 'IDLE' | 'SCANNING' | 'STABLE';
  tagIds?: string[];
  lastCapturedAt?: string;
  result?: {
    items?: { name: string; imageUrl?: string; count: number; subtotal: number }[];
    totalPrice?: number;
    tagIds?: string[];
    unknownTagIds?: string[];
    unavailableTagIds?: string[];
    scannedTagIds?: string[];
    found?: { tagId: string }[];
    basketId?: string;
    basketKey?: string;
    isNewBasket?: boolean;
  };
}

// Serialize page transitions: an old page's IDLE request must finish before
// the new page sets its mode. Skip requests belonging to unmounted pages.
let modeQueue = Promise.resolve();
let owner: symbol | undefined;
function enqueue(work: () => Promise<void>) {
  const pending = modeQueue.catch(() => undefined).then(work);
  modeQueue = pending.catch(() => undefined);
  return pending;
}

export function useDeviceSession(mode: DeviceMode, onScan?: (data: DeviceScan) => void) {
  const deviceId = useCartStore(state => state.deviceId);
  const [connected, setConnected] = useState(socket.connected);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const receive = useEffectEvent((data: DeviceScan) => onScan?.(data));

  useEffect(() => {
    const lease = Symbol(deviceId);
    owner = lease;
    let stopped = false;
    let configured = false;
    let running = false;
    let eventSequence = 0;
    const active = () => !stopped && owner === lease;
    const accept = (data: DeviceScan) => {
      if (active() && data.deviceId === deviceId && data.mode === mode) receive(data);
    };
    const reconcile = async () => {
      if (!active() || running) return;
      running = true;
      try {
        if (!configured) {
          await enqueue(async () => {
            if (!active()) return;
            await api.post('/session/set-mode', { deviceId, mode });
            if (active()) {
              configured = true;
              useCartStore.getState().setMode(mode);
            }
          });
        }
        if (!active()) return;
        const sequence = eventSequence;
        const { data } = await api.get<DeviceScan>(`/session/${encodeURIComponent(deviceId)}/snapshot`);
        if (!active()) return;
        if (data.mode !== mode) {
          configured = false;
          setReady(false);
          setError('ໂໝດ RFID ປ່ຽນໄປ ກຳລັງເຊື່ອມຕໍ່ໃໝ່');
          return;
        }
        setReady(true);
        setError('');
        // A capture received during the HTTP request is newer than its snapshot.
        if (sequence === eventSequence) accept(data);
      } catch (err) {
        if (active()) {
          configured = false;
          setReady(false);
          setError('ບໍ່ສາມາດເຊື່ອມຕໍ່ RFID session ກັບ server ໄດ້ ກຳລັງລອງໃໝ່');
          console.error('RFID session unavailable:', err);
        }
      } finally { running = false; }
    };
    const onConnect = () => { setConnected(true); configured = false; void reconcile(); };
    const onDisconnect = () => setConnected(false);
    const onUpdate = (data: DeviceScan) => {
      if (data.deviceId !== deviceId || data.mode !== mode) return;
      eventSequence++;
      accept(data);
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('scanUpdate', onUpdate);
    void reconcile();
    const timer = window.setInterval(() => void reconcile(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('scanUpdate', onUpdate);
      if (owner === lease) owner = undefined;
      void enqueue(async () => {
        if (owner !== undefined) return;
        await api.post('/session/set-mode', { deviceId, mode: 'IDLE' });
      }).catch(err => console.error('Could not release RFID session:', err));
    };
  }, [deviceId, mode]);

  return { connected, ready, error, deviceId };
}
