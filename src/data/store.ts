import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStateStorage } from './storage.ts';
import { MAIN_TRACK_NAME, migrateAlarm, migratePayments, migrateTracks } from './migrations.ts';
import type { LegacyFlatState } from './migrations.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_SHIFT_TYPES } from '@/domain/shifts.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import { clampSnoozeMinutes, restartOnce } from '@/domain/alarm.ts';
import type { Alarm } from '@/domain/alarm.ts';
import { addDays } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { LATEST_RELEASE_ID } from '@/domain/releaseNotes.ts';
import type { ReleaseManifest } from '@/domain/release.ts';
import type {
  ActiveSchedule,
  DayOverride,
  PaymentRecord,
  PaymentRule,
  PayrollSettings,
  ScheduleTrack,
  ShiftType,
} from '@/domain/types.ts';

/**
 * Версия схемы хранилища. Поднимается при любом несовместимом изменении формы
 * состояния, вместе с веткой в migrate — иначе у пользователя после обновления
 * сборки молча пропадут данные.
 */
export const SCHEMA_VERSION = 12;

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Что известно про вышедшую сборку APK.
 *
 * Кеш, а не данные пользователя: список выпусков лежит в сети, а календарь
 * должен знать про новую сборку сразу при открытии, не дожидаясь запроса и не
 * дёргая сеть на каждом запуске.
 */
export interface BuildCheck {
  /** Когда последний раз ходили за списком выпусков. 0 — ещё ни разу. */
  checkedAt: number;
  /** Сборка новее установленной или null. */
  build: ReleaseManifest | null;
  /**
   * Отпечаток сборки, про которую человек уже сказал «понял». Полоска на
   * календаре молчит, пока не выйдет следующая сборка или пока он сам не
   * нажмёт проверку в настройках.
   */
  dismissedRuntime: string | null;
}

/**
 * Показ совпадающих выходных.
 *
 * Отдельная настройка, а не всегда включённое поведение: у того, кто ведёт
 * чужой график ради одного взгляда на смены, лишний блок на календаре только
 * отнимает место.
 */
export interface SharedDaysOffSettings {
  /** Блок со списком общих выходных на календаре. */
  enabled: boolean;
}

/**
 * Несколько человек, чьи выходные интересны разом: «друзья», «семья».
 *
 * Нужна, потому что в списке иначе можно спросить только «когда свободны я и
 * Аня». Группа отвечает на «когда свободны мы все», и по-другому этот ответ не
 * получить: пересечение двух строк списка в уме не считается.
 */
export interface SharedGroup {
  id: string;
  name: string;
  /** Дорожки участников. Пустая группа ни с чем не совпадает. */
  trackIds: string[];
}

export interface AppState {
  appearance: ThemePreference;
  /**
   * Отслеживаемые графики. Пусто — ни одного не заведено, экраны показывают
   * «График не выбран». Второй появляется под вторую работу или под график
   * близкого человека.
   */
  tracks: ScheduleTrack[];
  /**
   * На какую дорожку смотрит приложение. null — на первую: разрешает это
   * activeTrack, и через него же ходят все, кому дорожка нужна.
   *
   * В хранилище не уходит намеренно: это состояние взгляда, а не данные. Любой
   * set в persist сериализует всё состояние и синхронно пишет его в MMKV, и
   * переключение вкладки не должно стоить записи на диск. Цена — приложение
   * всегда открывается на первом графике, а открываться на своей работе и
   * правильнее.
   */
  activeTrackId: string | null;
  /**
   * Справочник смен. В хранилище не уходит: он задан кодом, и снимок из старой
   * сборки перекрывал бы новые поля — так пропал признак многодневности у
   * отпуска, и карточка дня переставала спрашивать количество дней.
   */
  shiftTypes: ShiftType[];
  payroll: PayrollSettings;
  sharedDaysOff: SharedDaysOffSettings;
  sharedGroups: SharedGroup[];
  /** Список будильников. Порядок — как их завёл пользователь. */
  alarms: Alarm[];
  payments: PaymentRecord[];
  /**
   * До какой записи «что нового» человек уже дочитал. null — не видел ничего:
   * так выглядит обновление с прошлой схемы хранилища.
   */
  lastSeenReleaseId: string | null;
  buildCheck: BuildCheck;
}

/** Часть состояния, которая переживает перезапуск. */
export type PersistedState = Omit<AppState, 'shiftTypes' | 'activeTrackId'>;

/**
 * Снимок хранилища любой прошлой версии. Шире нынешнего состояния: до версии 9
 * график и правки лежали в корне, и миграция обязана уметь их прочитать.
 */
export type PersistedSnapshot = Partial<AppState> & LegacyFlatState;

export interface AppActions {
  setAppearance: (value: ThemePreference) => void;
  /** Заводит дорожку и делает её активной. Возвращает id — экран открывается сразу по нему. */
  addTrack: (input: NewTrack) => string;
  /** Правка названия и признака «мои часы». */
  updateTrack: (id: string, patch: Partial<Pick<ScheduleTrack, 'name' | 'own'>>) => void;
  /** Числа аванса и зарплаты у конкретной работы. */
  setTrackPayrollRules: (id: string, rules: PaymentRule[]) => void;
  /**
   * Выбор графика для дорожки: паттерн копируется из пресета, а не хранится
   * ссылкой — правка пресета в будущей версии не должна задним числом
   * переписывать уже прожитые месяцы.
   */
  setTrackSchedule: (id: string, presetId: string, anchorDate: IsoDate) => void;
  removeTrack: (id: string) => void;
  setActiveTrack: (id: string) => void;
  /**
   * Убирает все дорожки разом. Аварийный выход с экрана ошибки: сломать показ
   * может любая из них, а не только активная, поэтому сбрасываются все.
   */
  clearSchedule: () => void;
  setPayroll: (payroll: PayrollSettings) => void;
  setSharedDaysOff: (patch: Partial<SharedDaysOffSettings>) => void;
  /** Заводит группу и возвращает её id — экран правки открывается сразу по нему. */
  addSharedGroup: (name: string, trackIds: string[]) => string;
  updateSharedGroup: (id: string, patch: Partial<Omit<SharedGroup, 'id'>>) => void;
  removeSharedGroup: (id: string) => void;
  /** Заводит будильник и возвращает его id — экран правки открывается сразу по нему. */
  addAlarm: (alarm: Omit<Alarm, 'id'>) => string;
  updateAlarm: (id: string, patch: Partial<Omit<Alarm, 'id'>>) => void;
  removeAlarm: (id: string) => void;
  /**
   * Пауза и запуск: настройки сохраняются, а отзвонивший разовый будильник при
   * запуске переезжает на ближайший день с этим временем.
   */
  setAlarmEnabled: (id: string, enabled: boolean) => void;
  /** Гасит разом несколько будильников — так выключаются отзвонившие разовые. */
  disableAlarms: (ids: string[]) => void;
  /** Дальше — правки активной дорожки: чужой отпуск не должен попадать в мою сводку. */
  setOverride: (override: DayOverride) => void;
  /** Ставит одинаковую правку на несколько дней подряд: отпуск, больничный. */
  setOverrideRange: (startDate: IsoDate, days: number, shiftTypeId: string, note?: string) => void;
  clearOverride: (date: IsoDate) => void;
  /** Убирает правки на отрезке дат включительно — снятие отпуска целиком. */
  clearOverrideRange: (startDate: IsoDate, days: number) => void;
  addPayment: (payment: Omit<PaymentRecord, 'id'>) => void;
  removePayment: (id: string) => void;
  /** «Что нового» прочитано: полоска на календаре больше не показывается. */
  markReleasesSeen: () => void;
  /** Отметка похода в сеть — ставится до запроса, чтобы два экрана не пошли разом. */
  markBuildChecked: (checkedAt: number) => void;
  setKnownBuild: (build: ReleaseManifest | null) => void;
  /** «Понял»: полоска про эту сборку молчит до следующей. */
  dismissBuildNotice: () => void;
  /** Ручная проверка в настройках снимает молчание — иначе оно навсегда. */
  allowBuildNotice: () => void;
}

/** Что нужно, чтобы завести дорожку: остальное собирается из пресета. */
export interface NewTrack {
  name: string;
  own: boolean;
  presetId: string;
  anchorDate: IsoDate;
}

/**
 * Дорожка, на которую сейчас смотрит приложение.
 *
 * Пустой или неизвестный `activeTrackId` — это первая дорожка, а не пустота.
 * Правило живёт здесь, а не в миграции, потому что миграция не панацея:
 * zustand зовёт её только при смене версии схемы, и на втором запуске
 * приложение поднималось бы с несуществующим выбором. Заодно это закрывает
 * дорожку, удалённую на другом экране.
 *
 * Обычная функция, а не хук: её зовут и из селекторов, и из действий, и из
 * `getState()` на экране ошибки.
 */
export function activeTrack(state: AppState): ScheduleTrack | null {
  return state.tracks.find((track) => track.id === state.activeTrackId) ?? state.tracks[0] ?? null;
}

/**
 * Дорожка, по которой звонят будильники.
 *
 * Намеренно не активная: вкладка — это то, на что человек сейчас смотрит, а
 * будильник от взгляда зависеть не может. Переключение на график близкого
 * человека иначе переставляло бы собственные подъёмы по его сменам, да ещё и
 * на каждый клик заново прописывало весь набор в AlarmManager.
 *
 * Пока будильник не научился выбирать графики сам, звонит он по первой своей
 * работе.
 */
export function alarmTrack(state: AppState): ScheduleTrack | null {
  return state.tracks.find((track) => track.own) ?? state.tracks[0] ?? null;
}

/** Копия паттерна из пресета: правка пресета в будущей версии не должна
 * задним числом переписывать уже прожитые месяцы. */
function scheduleFromPreset(presetId: string, anchorDate: IsoDate): ActiveSchedule {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new ReferenceError(`Неизвестный график "${presetId}"`);
  return { presetId, pattern: preset.pattern, anchorDate };
}

/**
 * Правка активной дорожки на месте.
 *
 * Все действия по правкам дня и графику ходят через неё: без активной дорожки
 * менять нечего, и состояние остаётся как было.
 */
function patchActiveTrack(
  state: AppState,
  patch: (track: ScheduleTrack) => ScheduleTrack,
): Partial<AppState> {
  const current = activeTrack(state);
  if (!current) return {};
  return { tracks: state.tracks.map((track) => (track.id === current.id ? patch(track) : track)) };
}

const DEFAULT_PAYROLL: PayrollSettings = {
  currency: '₽',
  forecastFromLastClosedMonth: true,
};

export const INITIAL_STATE: AppState = {
  appearance: 'system',
  tracks: [],
  activeTrackId: null,
  shiftTypes: DEFAULT_SHIFT_TYPES,
  payroll: DEFAULT_PAYROLL,
  sharedDaysOff: { enabled: false },
  sharedGroups: [],
  alarms: [],
  payments: [],
  // Новая установка «что нового» не видит: рассказывать про изменения тому,
  // кто только поставил приложение, нечего.
  lastSeenReleaseId: LATEST_RELEASE_ID,
  buildCheck: { checkedAt: 0, build: null, dismissedRuntime: null },
};

/** Единственное место, где чинятся значения из формы: отсрочка вне диапазона. */
function normalizeAlarm(alarm: Alarm): Alarm {
  return { ...alarm, snoozeMinutes: clampSnoozeMinutes(alarm.snoozeMinutes) };
}

function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setAppearance: (appearance) => set({ appearance }),

      addTrack: ({ name, own, presetId, anchorDate }) => {
        const id = createId();
        const track: ScheduleTrack = {
          id,
          // Первую дорожку заводят, просто выбрав график: имя у неё никто не
          // спрашивал, и подставить его должно приложение.
          name: name.trim() || MAIN_TRACK_NAME,
          own,
          schedule: scheduleFromPreset(presetId, anchorDate),
          overrides: {},
          payrollRules: DEFAULT_PAYMENT_RULES,
        };
        // Новая дорожка сразу становится активной: её и заводили, чтобы смотреть.
        set((state) => ({ tracks: [...state.tracks, track], activeTrackId: id }));
        return id;
      },

      updateTrack: (id, patch) =>
        set((state) => ({
          tracks: state.tracks.map((track) => (track.id === id ? { ...track, ...patch } : track)),
        })),

      // Чинить выбор здесь не нужно: указавший в никуда activeTrackId
      // разрешается в первую дорожку сам, в activeTrack.
      removeTrack: (id) =>
        set((state) => ({ tracks: state.tracks.filter((track) => track.id !== id) })),

      setActiveTrack: (id) => {
        const state = get();
        if (state.activeTrackId === id || !state.tracks.some((track) => track.id === id)) return;
        set({ activeTrackId: id });
      },

      setTrackPayrollRules: (id, rules) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === id ? { ...track, payrollRules: rules } : track,
          ),
        })),

      setTrackSchedule: (id, presetId, anchorDate) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === id
              ? { ...track, schedule: scheduleFromPreset(presetId, anchorDate) }
              : track,
          ),
        })),

      clearSchedule: () => set({ tracks: [], activeTrackId: null }),

      setPayroll: (payroll) => set({ payroll }),

      setSharedDaysOff: (patch) =>
        set((state) => ({ sharedDaysOff: { ...state.sharedDaysOff, ...patch } })),

      addSharedGroup: (name, trackIds) => {
        const id = createId();
        set((state) => ({ sharedGroups: [...state.sharedGroups, { id, name, trackIds }] }));
        return id;
      },

      updateSharedGroup: (id, patch) =>
        set((state) => ({
          sharedGroups: state.sharedGroups.map((group) =>
            group.id === id ? { ...group, ...patch } : group,
          ),
        })),

      removeSharedGroup: (id) =>
        set((state) => ({
          sharedGroups: state.sharedGroups.filter((group) => group.id !== id),
        })),

      addAlarm: (alarm) => {
        const id = createId();
        set((state) => ({ alarms: [...state.alarms, normalizeAlarm({ ...alarm, id })] }));
        return id;
      },

      updateAlarm: (id, patch) =>
        set((state) => ({
          alarms: state.alarms.map((alarm) =>
            alarm.id === id ? normalizeAlarm({ ...alarm, ...patch }) : alarm,
          ),
        })),

      removeAlarm: (id) =>
        set((state) => ({ alarms: state.alarms.filter((alarm) => alarm.id !== id) })),

      setAlarmEnabled: (id, enabled) =>
        set((state) => ({
          alarms: state.alarms.map((alarm) =>
            alarm.id === id
              ? { ...(enabled ? restartOnce(alarm, new Date()) : alarm), enabled }
              : alarm,
          ),
        })),

      // Пустой список — не «записать то же самое», а не записывать вовсе:
      // любой set в persist сериализует всё состояние и синхронно кладёт его в
      // MMKV. Проверка стоит до set, а не внутри него.
      disableAlarms: (ids) => {
        if (ids.length === 0) return;
        set((state) => ({
          alarms: state.alarms.map((alarm) =>
            ids.includes(alarm.id) ? { ...alarm, enabled: false } : alarm,
          ),
        }));
      },

      setOverride: (override) =>
        set((state) =>
          patchActiveTrack(state, (track) => {
            // Правка, в которой не осталось ни смены, ни часов, ни заметки, — это
            // отсутствие правки. Без этой ветки стёртая заметка оставляла бы за
            // собой пустую запись, и день до конца жизни числился бы тронутым.
            const empty =
              override.shiftTypeId === undefined &&
              override.workedMinutesOverride === undefined &&
              (override.note === undefined || override.note.length === 0);

            if (empty) {
              const { [override.date]: removed, ...rest } = track.overrides;
              return { ...track, overrides: rest };
            }
            return { ...track, overrides: { ...track.overrides, [override.date]: override } };
          }),
        ),

      setOverrideRange: (startDate, days, shiftTypeId, note) =>
        set((state) =>
          patchActiveTrack(state, (track) => {
            const overrides = { ...track.overrides };
            for (let offset = 0; offset < days; offset += 1) {
              const date = addDays(startDate, offset);
              overrides[date] = { date, shiftTypeId, note };
            }
            return { ...track, overrides };
          }),
        ),

      clearOverrideRange: (startDate, days) =>
        set((state) =>
          patchActiveTrack(state, (track) => {
            const overrides = { ...track.overrides };
            for (let offset = 0; offset < days; offset += 1) {
              delete overrides[addDays(startDate, offset)];
            }
            return { ...track, overrides };
          }),
        ),

      clearOverride: (date) =>
        set((state) =>
          patchActiveTrack(state, (track) => {
            const { [date]: removed, ...rest } = track.overrides;
            return { ...track, overrides: rest };
          }),
        ),

      addPayment: (payment) =>
        set((state) => ({ payments: [...state.payments, { ...payment, id: createId() }] })),

      removePayment: (id) =>
        set((state) => ({ payments: state.payments.filter((item) => item.id !== id) })),

      markReleasesSeen: () => set({ lastSeenReleaseId: LATEST_RELEASE_ID }),

      markBuildChecked: (checkedAt) =>
        set((state) => ({ buildCheck: { ...state.buildCheck, checkedAt } })),

      setKnownBuild: (build) => set((state) => ({ buildCheck: { ...state.buildCheck, build } })),

      dismissBuildNotice: () =>
        set((state) => ({
          buildCheck: {
            ...state.buildCheck,
            dismissedRuntime: state.buildCheck.build?.runtimeVersion ?? null,
          },
        })),

      allowBuildNotice: () =>
        set((state) => ({ buildCheck: { ...state.buildCheck, dismissedRuntime: null } })),
    }),
    {
      name: 'app-state',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => mmkvStateStorage),
      /** В хранилище уходят только данные пользователя, справочники — нет. */
      partialize: (state): PersistedState => ({
        appearance: state.appearance,
        tracks: state.tracks,
        payroll: state.payroll,
        sharedDaysOff: state.sharedDaysOff,
        sharedGroups: state.sharedGroups,
        alarms: state.alarms,
        payments: state.payments,
        lastSeenReleaseId: state.lastSeenReleaseId,
        buildCheck: state.buildCheck,
      }),
      migrate: (persisted, version) => migrateState(persisted as PersistedSnapshot, version),
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
 *
 * В версии 7 смена в ручной правке стала необязательной: правка может держать
 * одну заметку, не отвязывая день от графика. Старые записи читаются как есть —
 * смена в них указана всегда.
 *
 * В версии 8 появились отметка прочитанного «что нового» и кеш проверки
 * выпусков.
 *
 * В версии 9 график перестал быть единственным: он и правки дней уехали внутрь
 * дорожки, а дорожек может быть несколько. Плоский снимок сворачивается в одну.
 *
 * В версии 10 туда же уехали числа аванса и зарплаты — у каждой работы свои, —
 * а у выплаты появилась работа, за которую она получена.
 *
 * В версии 11 добавились настройки показа совпадающих выходных.
 *
 * В версии 12 появились группы людей, а отметка дней в сетке уехала из
 * настроек: теперь это выбор в самом списке, и хранить его незачем.
 */
export function migrateState(persisted: PersistedSnapshot, _version: number): AppState {
  // Плоские поля прошлых схем разбираются по дорожкам и дальше не едут: без
  // этого они остались бы висеть в состоянии мёртвым грузом.
  const { schedule, overrides, payroll: legacyPayroll, ...rest } = persisted;
  const { rules, ...payroll } = legacyPayroll ?? {};

  // График сбрасывается, если смена, на которую он ссылается, исчезла из
  // справочника: разложить такой график нельзя, а падает он на каждой дате.
  // Сама дорожка при этом остаётся — в ней лежат правки дней.
  const tracks = migrateTracks(persisted, DEFAULT_SHIFT_TYPES);

  // Будильники переносятся после дорожек: старому «по графику» нужно знать, к
  // какой работе его привязать. До версии 4 будильник был не списком, а одним
  // набором настроек по типам смен — переносить оттуда нечего: звонить он не
  // успел ни разу, ни одна сборка с нативной частью не выходила.
  const alarms = Array.isArray(persisted.alarms)
    ? persisted.alarms.map((alarm) => migrateAlarm(alarm, tracks))
    : [];

  return {
    ...INITIAL_STATE,
    ...rest,
    tracks,
    payments: migratePayments(persisted.payments, tracks),
    // Числа выплат уехали в дорожки: в общих настройках денег их больше нет.
    payroll: { ...DEFAULT_PAYROLL, ...payroll },
    alarms,
    shiftTypes: DEFAULT_SHIFT_TYPES,
    // Обновление со старой схемы — это человек, который только что получил
    // новую версию: ему «что нового» показать надо, поэтому null, а не
    // значение по умолчанию для новой установки.
    lastSeenReleaseId: persisted.lastSeenReleaseId ?? null,
    // Кеш проверки и настройки совпадений достраиваются по частям: в старом
    // снимке их нет вовсе, а в снимке поновее может не быть половины полей.
    buildCheck: { ...INITIAL_STATE.buildCheck, ...persisted.buildCheck },
    sharedDaysOff: { ...INITIAL_STATE.sharedDaysOff, ...persisted.sharedDaysOff },
    // Участники, чьи дорожки удалили, из групп выбрасываются: иначе группа
    // навсегда осталась бы без совпадений и объяснить это было бы нечем.
    sharedGroups: (persisted.sharedGroups ?? []).map((group) => ({
      ...group,
      trackIds: group.trackIds.filter((id) => tracks.some((track) => track.id === id)),
    })),
  };
}
