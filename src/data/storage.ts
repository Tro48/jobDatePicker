import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/**
 * Единственное хранилище приложения. MMKV выбран за синхронное чтение: данных
 * мало, и состояние поднимается до первого кадра — без мигания пустым
 * календарём на старте.
 */
export const storage = createMMKV({ id: 'job-date-picker' });

/** Адаптер MMKV под persist-middleware zustand. */
export const mmkvStateStorage: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => {
    storage.remove(name);
  },
};

/** Полный дамп хранилища — основа экспорта данных в JSON. */
export function dumpStorage(): Record<string, string> {
  return Object.fromEntries(
    storage.getAllKeys().map((key: string) => [key, storage.getString(key) ?? '']),
  );
}
