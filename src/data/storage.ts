import { createMMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/**
 * Единственное хранилище приложения. MMKV выбран за синхронное чтение: данных
 * мало, и состояние поднимается до первого кадра — без мигания пустым
 * календарём на старте.
 */
export const storage = createMMKV({ id: 'job-date-picker' });

/**
 * Последнее записанное значение по ключу.
 *
 * zustand пишет всё состояние на каждый set, включая те, что ничего не
 * изменили: middleware не сравнивает, а просто сериализует и кладёт. Запись в
 * MMKV синхронная, то есть блокирует поток JS вместе с отрисовкой. Сверка
 * отсекает повторы, не трогая ни хранилище, ни middleware.
 */
const written = new Map<string, string>();

/** Адаптер MMKV под persist-middleware zustand. */
export const mmkvStateStorage: StateStorage = {
  getItem: (name) => {
    const value = storage.getString(name) ?? null;
    if (value !== null) written.set(name, value);
    return value;
  },
  setItem: (name, value) => {
    if (written.get(name) === value) return;
    written.set(name, value);
    storage.set(name, value);
  },
  removeItem: (name) => {
    written.delete(name);
    storage.remove(name);
  },
};
