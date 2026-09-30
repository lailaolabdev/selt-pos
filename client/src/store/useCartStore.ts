import { create } from 'zustand';

export type DeviceMode = 'IDLE' | 'ADD' | 'CHECK' | 'CHECKOUT';

interface CartItem {
  name: string;
  imageUrl?: string;
  count: number;
  subtotal: number;
}

interface CartUpdate {
  scannedTagIds?: string[];
  unknownTagIds?: string[];
  unavailableTagIds?: string[];
  items?: CartItem[];
  totalPrice?: number;
  tagIds?: string[];
  status?: 'IDLE' | 'SCANNING' | 'STABLE';
  basketId?: string;
  basketKey?: string;
  isNewBasket?: boolean;
}

interface CartState {
  deviceId: string;
  mode: DeviceMode;
  items: CartItem[];
  totalPrice: number;
  tagIds: string[];
  scannedTagIds: string[];
  unknownTagIds: string[];
  unavailableTagIds: string[];
  isScanning: boolean;
  scannerStatus: 'IDLE' | 'SCANNING' | 'STABLE';
  basketId?: string;
  basketKey?: string;
  isNewBasket: boolean;
  
  setMode: (mode: DeviceMode) => void;
  updateCart: (data: CartUpdate) => void;
  clearCart: () => void;
  setScanning: (isScanning: boolean) => void;
}

export const useCartStore = create<CartState>((set) => ({
  deviceId: import.meta.env.VITE_DEVICE_ID || 'RPi-POS-01',
  mode: 'IDLE',
  items: [],
  totalPrice: 0,
  tagIds: [],
  scannedTagIds: [],
  unknownTagIds: [],
  unavailableTagIds: [],
  isScanning: false,
  scannerStatus: 'IDLE',
  basketId: undefined,
  basketKey: undefined,
  isNewBasket: false,

  setMode: (mode) => set({ mode }),
  
  updateCart: (data) => set({
    items: data.items || [],
    totalPrice: data.totalPrice || 0,
    tagIds: data.tagIds || [],
    scannedTagIds: data.scannedTagIds || data.tagIds || [],
    unknownTagIds: data.unknownTagIds || [],
    unavailableTagIds: data.unavailableTagIds || [],
    scannerStatus: data.status || 'IDLE',
    basketId: data.basketId,
    basketKey: data.basketKey,
    isNewBasket: Boolean(data.isNewBasket),
    isScanning: false,
  }),

  clearCart: () => set({
    items: [],
    totalPrice: 0,
    tagIds: [],
    scannedTagIds: [],
    unknownTagIds: [],
    unavailableTagIds: [],
    isScanning: false,
    basketId: undefined,
    basketKey: undefined,
    isNewBasket: false,
  }),

  setScanning: (isScanning) => set({ isScanning }),
}));
