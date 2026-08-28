import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStateStorage } from './storage.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_SHIFT_TYPES } from '@/domain/shifts.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import { addDays } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import type {
  ActiveSchedule,
  DayOverride,
  PaymentRecord,
  PayrollSettings,
  ShiftType,
} from '@/domain/types.ts';

/**
 * Версия схемы хранилища. Поднимается при любом несовместимом изменении формы
 * состояния, вместе с веткой в migrate — иначе у пользователя после обновления
 * сборки молча пропадут данные.
 */
export const SCHEMA_VERSION = 2;

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppState {
  appearance: ThemePreference;
  /** null, пока пользователь не выбрал график. */
  schedule: ActiveSchedule | null;
  /**
   * Справочник смен. В хранилище не уходит: он задан кодом, и снимок из старой
   * сборки перекрывал бы новые поля — так пропал признак многодневности у
   * отпуска, и карточка дня переставала спрашивать количество дней.
   */
  shiftTypes: ShiftType[];
  payroll: PayrollSettings;
  /** Ручные правки по датам: ключ — дата в формате YYYY-MM-DD. */
  overrides: Record<IsoDate, DayOverride>;
  payments: PaymentRecord[];
}

/** Часть состояния, которая переживает перезапуск. */
export type PersistedState = Omit<AppState, 'shiftTypes'>;

export interface AppActions {
  setAppearance: (value: ThemePreference) => void;
  /** Выбор графика: паттерн копируется из пресета, а не хранится ссылкой. */
  selectSchedule: (presetId: string, anchorDate: IsoDate) => void;
  setAnchorDate: (anchorDate: IsoDate) => void;
  clearSchedule: () => void;
  setPayroll: (payroll: PayrollSettings) => void;
  setOverride: (override: DayOverride) => void;
  /** Ставит одинаковую правку на несколько дней подряд: отпуск, больничный. */
  setOverrideRange: (startDate: IsoDate, days: number, shiftTypeId: string, note?: string) => void;
  clearOverride: (date: IsoDate) => void;
  /** Убирает правки на отрезке дат включительно — снятие отпуска целиком. */
  clearOverrideRange: (startDate: IsoDate, days: number) => void;
  addPayment: (payment: Omit<PaymentRecord, 'id'>) => void;
  removePayment: (id: string) => void;
  /** Полный сброс — используется при импорте и в отладке. */
  replaceAll: (state: AppState) => void;
}

const DEFAULT_PAYROLL: PayrollSettings = {
  currency: '₽',
  rules: DEFAULT_PAYMENT_RULES,
  forecastFromLastClosedMonth: true,
};

export const INITIAL_STATE: AppState = {
  appearance: 'system',
  schedule: null,
  shiftTypes: DEFAULT_SHIFT_TYPES,
  payroll: DEFAULT_PAYROLL,
  overrides: {},
  payments: [],
};

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setAppearance: (appearance) => set({ appearance }),

      selectSchedule: (presetId, anchorDate) => {
        const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
        if (!preset) throw new ReferenceError(`Неизвестный график "${presetId}"`);
        // Паттерн копируется намеренно: правка пресета в будущей версии не
        // должна задним числом переписывать уже прожитые месяцы.
        set({ schedule: { presetId, pattern: preset.pattern, anchorDate } });
      },

      setAnchorDate: (anchorDate) =>
        set((state) => (state.schedule ? { schedule: { ...state.schedule, anchorDate } } : state)),

      clearSchedule: () => set({ schedule: null }),

      setPayroll: (payroll) => set({ payroll }),

      setOverride: (override) =>
        set((state) => ({ overrides: { ...state.overrides, [override.date]: override } })),

      setOverrideRange: (startDate, days, shiftTypeId, note) =>
        set((state) => {
          const overrides = { ...state.overrides };
          for (let offset = 0; offset < days; offset += 1) {
            const date = addDays(startDate, offset);
            overrides[date] = { date, shiftTypeId, note };
          }
          return { overrides };
        }),

      clearOverrideRange: (startDate, days) =>
        set((state) => {
          const overrides = { ...state.overrides };
          for (let offset = 0; offset < days; offset += 1) {
            delete overrides[addDays(startDate, offset)];
          }
          return { overrides };
        }),

      clearOverride: (date) =>
        set((state) => {
          const { [date]: removed, ...rest } = state.overrides;
          return { overrides: rest };
        }),

      addPayment: (payment) =>
        set((state) => ({ payments: [...state.payments, { ...payment, id: createId() }] })),

      removePayment: (id) =>
        set((state) => ({ payments: state.payments.filter((item) => item.id !== id) })),

      replaceAll: (next) => set(next),
    }),
    {
      name: 'app-state',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => mmkvStateStorage),
      /** В хранилище уходят только данные пользователя, справочники — нет. */
      partialize: (state): PersistedState => ({
        appearance: state.appearance,
        schedule: state.schedule,
        payroll: state.payroll,
        overrides: state.overrides,
        payments: state.payments,
      }),
      migrate: (persisted, version) => migrateState(persisted as Partial<AppState>, version),
    },
  ),
);

/**
 * Перенос данных со старых версий схемы.
 *
 * Достраивает отсутствующие поля значениями по умолчанию — иначе неполный
 * объект из старой сборки уронил бы приложение. Справочник смен при этом
 * всегда берётся из кода: в версии 1 он лежал в хранилище, и после обновления
 * приложение читало устаревшие описания смен вместо новых.
 */
export function migrateState(persisted: Partial<AppState>, _version: number): AppState {
  return { ...INITIAL_STATE, ...persisted, shiftTypes: DEFAULT_SHIFT_TYPES };
}
