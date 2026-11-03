// UI-only state: toasts, effect toggles, demo helpers. Kept apart from the
// incident store so visual preferences never mix with domain data.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Language } from '@/types';
import { uid } from '@/utils';

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface UIState {
  toasts: Toast[];
  effectsEnabled: boolean;
  cursorEnabled: boolean;
  citizenLang: Language;
  fieldOfficerId: string;
  demoOpen: boolean;
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
  setEffects: (v: boolean) => void;
  setCursor: (v: boolean) => void;
  setCitizenLang: (l: Language) => void;
  setFieldOfficer: (id: string) => void;
  setDemoOpen: (v: boolean) => void;
}

export const useUI = create<UIState>()(
  persist(
    (set, get) => ({
      toasts: [],
      effectsEnabled: true,
      cursorEnabled: true,
      citizenLang: 'en',
      fieldOfficerId: 'off-ak',
      demoOpen: false,
      pushToast: (message, tone = 'success') => {
        const id = uid('t');
        set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-4) }));
        setTimeout(() => get().dismissToast(id), 4200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setEffects: (effectsEnabled) => set({ effectsEnabled }),
      setCursor: (cursorEnabled) => set({ cursorEnabled }),
      setCitizenLang: (citizenLang) => set({ citizenLang }),
      setFieldOfficer: (fieldOfficerId) => set({ fieldOfficerId }),
      setDemoOpen: (demoOpen) => set({ demoOpen }),
    }),
    {
      name: 'enviro-intel-ui-v1',
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          return sessionStorage;
        }
      }),
      partialize: (s) => ({ effectsEnabled: s.effectsEnabled, cursorEnabled: s.cursorEnabled, citizenLang: s.citizenLang, fieldOfficerId: s.fieldOfficerId }),
    },
  ),
);

export const toast = (message: string, tone?: ToastTone) => useUI.getState().pushToast(message, tone);
