import { create } from 'zustand';
import { Shop, City, AccessEntry } from '../types';

interface MapState {
  cities: City[];
  selectedCity: City | null;
  shops: Shop[];
  wholesaleShops: Shop[];
  accessList: AccessEntry[];
  pulseOrigin: Shop | null;
  
  setCities: (cities: City[]) => void;
  selectCity: (city: City) => void;
  setShops: (shops: Shop[]) => void;
  setWholesaleShops: (shops: Shop[]) => void;
  setAccessList: (list: AccessEntry[]) => void;
  triggerPulse: (shop: Shop) => void;
}

export const useMapStore = create<MapState>((set) => ({
  cities: [],
  selectedCity: null,
  shops: [],
  wholesaleShops: [],
  accessList: [],
  pulseOrigin: null,
  
  setCities: (cities) => set({ cities }),
  selectCity: (city) => set({ selectedCity: city }), // НЕ сбрасываем shops
  setShops: (shops) => set({ shops }),
  setWholesaleShops: (shops) => set({ wholesaleShops: shops }),
  setAccessList: (list) => set({ accessList: list }),
  triggerPulse: (shop) => {
    set({ pulseOrigin: shop });
    setTimeout(() => set({ pulseOrigin: null }), 1000);
  }
}));
