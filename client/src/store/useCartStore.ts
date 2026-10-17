import { create } from 'zustand';

export type DeviceMode = 'IDLE' | 'ADD' | 'CHECK' | 'CHECKOUT' | 'PAYMENT';

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
  
  updateCart: (data) => set((state) => ({
    items: data.items ?? state.items,
    totalPrice: data.totalPrice ?? state.totalPrice,
    tagIds: data.tagIds ?? state.tagIds,
    scannedTagIds: data.scannedTagIds ?? data.tagIds ?? state.scannedTagIds,
    unknownTagIds: data.unknownTagIds ?? state.unknownTagIds,
    unavailableTagIds: data.unavailableTagIds ?? state.unavailableTagIds,
    scannerStatus: data.status ?? state.scannerStatus,
    basketId: data.basketId ?? state.basketId,
    basketKey: data.basketKey ?? state.basketKey,
    isNewBasket: data.isNewBasket ?? state.isNewBasket,
    isScanning: data.status === 'SCANNING',
  })),

  clearCart: () => set({
    items: [],
    totalPrice: 0,
    tagIds: [],
    scannedTagIds: [],
    unknownTagIds: [],
    unavailableTagIds: [],
    scannerStatus: 'IDLE',
    isScanning: false,
    basketId: undefined,
    basketKey: undefined,
    isNewBasket: false,
  }),

  setScanning: (isScanning) => set({ isScanning }),
}));
