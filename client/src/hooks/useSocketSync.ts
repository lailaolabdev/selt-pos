import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { api } from '@/lib/api';
import { useCartStore } from '@/store/useCartStore';

export const useSocketSync = () => {
  const { updateCart, deviceId, setScanning } = useCartStore();

  useEffect(() => {
    const syncSnapshot = async () => {
      try {
        const response = await api.get(`/session/${deviceId}/snapshot`);
        const data = response.data;
        if (data?.deviceId === deviceId && data?.mode === 'CHECKOUT') {
          updateCart({ ...data.result, status: data.status });
        }
      } catch (error) {
        console.error('Failed to sync cart snapshot:', error);
      }
    };

    const onConnect = () => {
      console.log('Connected to socket server');
      syncSnapshot();
    };

    const onScanUpdate = (data: { deviceId: string; mode: string; status?: 'IDLE' | 'SCANNING' | 'STABLE'; result?: Parameters<typeof updateCart>[0] }) => {
      console.log('📬 Received scanUpdate:', data);
      if (data.deviceId === deviceId) {
        if (data.mode === 'CHECKOUT') {
          updateCart({ ...data.result, status: data.status });
        } else if (data.mode === 'ADD' || data.mode === 'CHECK') {
          // Handle other modes if needed
          console.log(`Scan update for ${data.mode}:`, data.result);
        }
      }
    };

    socket.on('connect', onConnect);
    socket.on('scanUpdate', onScanUpdate);
    syncSnapshot();

    return () => {
      socket.off('connect', onConnect);
      socket.off('scanUpdate', onScanUpdate);
    };
  }, [deviceId, updateCart, setScanning]);
};
