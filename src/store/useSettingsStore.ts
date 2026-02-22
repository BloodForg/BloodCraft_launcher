import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  gamePath: string;
  ramGb: number;
  javaMode: 'auto' | 'custom';
  javaPath: string;
  setGamePath: (value: string) => void;
  setRamGb: (value: number) => void;
  setJavaMode: (value: 'auto' | 'custom') => void;
  setJavaPath: (value: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      gamePath: '~/Library/Application Support/BloodCraft',
      ramGb: 6,
      javaMode: 'auto',
      javaPath: '',
      setGamePath: (value) => set({ gamePath: value }),
      setRamGb: (value) => set({ ramGb: value }),
      setJavaMode: (value) => set({ javaMode: value }),
      setJavaPath: (value) => set({ javaPath: value })
    }),
    { name: 'bloodcraft-settings' }
  )
);
