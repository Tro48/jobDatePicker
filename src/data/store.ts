import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { mmkvStateStorage } from './storage.ts';
import {
  MAIN_TRACK_NAME,
  migrateAlarm,
  migrateCustomSchedules,
  migrateNotes,
  migratePayments,
  migrateShiftTypes,
  migrateTracks,
} from './migrations.ts';
import type { LegacyFlatState } from './migrations.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_SHIFT_TYPES, sanitizeShiftType, shiftTypeUsage } from '@/domain/shifts.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import { clampSnoozeMinutes, restartOnce } from '@/domain/alarm.ts';
import type { Alarm } from '@/domain/alarm.ts';
import { normalizeNoteText } from '@/domain/notes.ts';
import type { SharedOverride } from '@/domain/share.ts';
import { addDays } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { LATEST_RELEASE_ID } from '@/domain/releaseNotes.ts';
import { paintSlot, paletteOf, sanitizePalette } from '@/theme/slots.ts';
import type { Palette } from '@/theme/palette.ts';
import type { ReleaseManifest } from '@/domain/release.ts';
import type {
  CustomSchedule,
  DayNote,
  DayOverride,
  PaymentRecord,
  PaymentRule,
  PayrollSettings,
  SchedulePattern,
  SchedulePeriod,
  ScheduleTrack,
  ShiftType,
  ShiftTypeDraft,
} from '@/domain/types.ts';

/**
 * Версия схемы хранилища. Поднимается при любом несовместимом изменении формы
 * состояния, вместе с веткой в migrate — иначе у пользователя после обновления
 * сборки молча пропадут данные.
 */
export const SCHEMA_VERSION = 19;

/**
 * Что выбрано в списке тем: встроенная или своя.
 *
 * Своя записана как «custom:<id>» — одной строкой, а не парой полей: список
 * тем на экране один, и выбор в нём один. Тема, которую удалили, оставляет
 * строку, которой ничего не соответствует, — приложение тогда рисуется
 * системной темой, а не падает.
 */
export type ThemePreference = 'system' | 'light' | 'dark' | `custom:${string}`;

/**
 * Своя тема: имя и полная палитра.
 *
 * Палитра целиком, а не поправки к встроенной: тема живёт сама по себе, её
 * можно переименовать, скопировать и удалить, не оглядываясь на то, от какой
 * из встроенных её когда-то сняли. Цена — цвет, добавленный в палитру новой
 * версией приложения, до заведённых тем не доедет: в них он останется тем, что
 * скопировался в день создания.
 */
export interface CustomTheme {
  id: string;
  name: string;
  colors: Palette;
}

/** Предел длины имени темы: длиннее не помещается в строку списка. */
export const MAX_THEME_NAME_LENGTH = 40;

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
/**
 * Производственный календарь.
 *
 * Включён по умолчанию: праздник в клетке нужен всем, а вот пятидневке он ещё
 * и делает день нерабочим. Выключается теми, у кого работа праздников не
 * замечает — в магазине или на посту 12 июня такой же рабочий день.
 */
export interface HolidaySettings {
  enabled: boolean;
}

/**
 * Слот поддержки на «Сводке».
 *
 * Одно место на всё приложение: и карточка «без рекламы и без подписки», и
 * реклама, когда она появится, и покупка её отключения. Хранить приходится
 * ровно три вещи — покупку, скрытую рекламу и скрытую карточку доната.
 */
export interface SupportState {
  /** Реклама выключена покупкой. Держится отдельно от purchasedAt: покупку
   * восстанавливают с сервера магазина, а этот флаг работает и офлайн. */
  adsHidden: boolean;
  /** Когда купили отключение рекламы. null — не покупали. */
  purchasedAt: number | null;
  /** «Не показывать» на карточке доната. Второе нажатие её не вернёт. */
  donationDismissed: boolean;
}

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
  /** Свои темы в порядке заведения. Показываются в том же списке, что встроенные. */
  themes: CustomTheme[];
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
   * Справочник смен: десять встроенных плюс всё, что человек завёл сам.
   *
   * До версии 13 задавался кодом и в хранилище не уходил. Своей вечерней смены
   * у людей от этого не появлялось, поэтому теперь справочник хранится — а от
   * старой беды (снимок из прошлой сборки перекрывает новые поля) защищает
   * migrateShiftTypes: встроенная смена собирается из кода, и из снимка в неё
   * попадает только то, что правили руками.
   */
  shiftTypes: ShiftType[];
  /**
   * Графики, собранные в конструкторе. Лежат рядом с встроенными пресетами и
   * попадают в тот же список выбора.
   *
   * Дорожка на них не ссылается: при выборе графика раскладка копируется в
   * дорожку, как и у пресетов. Поэтому удаление собранного графика не ломает
   * тех, кто по нему уже живёт, — presetId просто перестаёт на что-то указывать.
   */
  customSchedules: CustomSchedule[];
  holidays: HolidaySettings;
  support: SupportState;
  payroll: PayrollSettings;
  sharedDaysOff: SharedDaysOffSettings;
  sharedGroups: SharedGroup[];
  /** Список будильников. Порядок — как их завёл пользователь. */
  alarms: Alarm[];
  /**
   * Заметки к дням — все разом, а не внутри дорожек.
   *
   * Заметка про день, а не про работу: «забрать посылку» не принадлежит ни
   * основному графику, ни складу, и переключение вкладки её прятать не должно.
   * Общий список, сгруппированный по дням, из такого хранения собирается одной
   * группировкой по дате.
   */
  notes: DayNote[];
  payments: PaymentRecord[];
  /**
   * До какой записи «что нового» человек уже дочитал. null — не видел ничего:
   * так выглядит обновление с прошлой схемы хранилища.
   */
  lastSeenReleaseId: string | null;
  buildCheck: BuildCheck;
}

/** Часть состояния, которая переживает перезапуск. */
export type PersistedState = Omit<AppState, 'activeTrackId'>;

/**
 * Снимок хранилища любой прошлой версии. Шире нынешнего состояния: до версии 9
 * график и правки лежали в корне, и миграция обязана уметь их прочитать.
 */
export type PersistedSnapshot = Partial<AppState> & LegacyFlatState;

export interface AppActions {
  setAppearance: (value: ThemePreference) => void;
  /**
   * Заводит свою тему копией переданной палитры и возвращает её id — редактор
   * открывается сразу по нему.
   *
   * Палитру передаёт экран: тема снимается с той, что сейчас показана, — со
   * светлой, если в системе день, и с тёмной, если ночь. Спрашивать это
   * отдельно незачем: человек и так смотрит на ту тему, от которой пляшет.
   */
  addTheme: (name: string, colors: Palette) => string;
  renameTheme: (id: string, name: string) => void;
  /**
   * Задаёт цвет одному слоту темы. Неправильный цвет не сохраняется: поле
   * правят по букве, и «#12» — это середина набора, а не значение.
   */
  setThemeColor: (id: string, slotId: string, hex: string) => void;
  /**
   * Удаляет тему. Если её сейчас показывали, оформление возвращается к
   * системному: экран не должен остаться без палитры.
   */
  removeTheme: (id: string) => void;
  /** Заводит свой тип смены и возвращает его id — редактор открывается сразу по нему. */
  addShiftType: (draft: ShiftTypeDraft) => string;
  /**
   * Правка типа смены. У встроенной вид и многодневность не меняются: они
   * заданы кодом, и на них завязаны и встроенные графики, и сводка часов.
   */
  updateShiftType: (id: string, draft: Partial<ShiftTypeDraft>) => void;
  /**
   * Удаление своей смены. Встроенная не удаляется, и занятая графиком — тоже:
   * без неё график перестанет раскладываться. Ручные правки на удалённую смену
   * теряют смену, но сохраняют часы.
   */
  removeShiftType: (id: string) => void;
  /** Заводит собранный график и возвращает его id — список выбора сразу встаёт на него. */
  addCustomSchedule: (name: string, pattern: SchedulePattern) => string;
  updateCustomSchedule: (id: string, patch: Partial<Omit<CustomSchedule, 'id'>>) => void;
  /**
   * Убирает собранный график из списка выбора. Дорожки, которые по нему живут,
   * продолжают жить: раскладка у них своя.
   */
  removeCustomSchedule: (id: string) => void;
  /** Заводит дорожку и делает её активной. Возвращает id — экран открывается сразу по нему. */
  addTrack: (input: NewTrack) => string;
  /** Правка названия и признака «мои часы». */
  updateTrack: (id: string, patch: Partial<Pick<ScheduleTrack, 'name' | 'own'>>) => void;
  /** Числа аванса и зарплаты у конкретной работы. */
  setTrackPayrollRules: (id: string, rules: PaymentRule[]) => void;
  /**
   * Правка одного периода истории по его номеру: паттерн копируется из
   * пресета, а не хранится ссылкой — правка пресета в будущей версии не должна
   * задним числом переписывать уже прожитые месяцы.
   */
  setTrackSchedule: (id: string, index: number, entry: ScheduleEntry) => void;
  /**
   * Смена графика с указанного дня: прежний остаётся на прожитых месяцах.
   * Период с тем же startsOn заменяется — иначе на одну дату их станет два.
   */
  addTrackSchedule: (id: string, entry: ScheduleEntry) => void;
  /** Убрать период истории. Последний убирать можно: дорожка остаётся без графика. */
  removeTrackSchedule: (id: string, index: number) => void;
  removeTrack: (id: string) => void;
  setActiveTrack: (id: string) => void;
  /**
   * Убирает все дорожки разом. Аварийный выход с экрана ошибки: сломать показ
   * может любая из них, а не только активная, поэтому сбрасываются все.
   */
  clearSchedule: () => void;
  /**
   * Заменяет всё состояние разом — восстановление из резервной копии.
   *
   * Именно замена, а не слияние: слить два набора графиков и правок так, чтобы
   * человек понял результат, нельзя, и любая попытка кончилась бы дублями
   * смен и выплат. Необратимость этого действия объясняет экран до вызова.
   */
  restoreState: (next: AppState) => void;
  /** Добавляет полученный график отдельной дорожкой вместе с его сменами. */
  addSharedTrack: (input: IncomingTrack) => string;
  setHolidays: (patch: Partial<HolidaySettings>) => void;
  setSupport: (patch: Partial<SupportState>) => void;
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
  /**
   * Заводит заметку на день и возвращает её id. Пустой текст не сохраняется:
   * заметка без текста — это ничего.
   */
  addNote: (note: Pick<DayNote, 'date' | 'text' | 'remindAt'>) => string | null;
  updateNote: (id: string, patch: Partial<Pick<DayNote, 'text' | 'remindAt'>>) => void;
  removeNote: (id: string) => void;
  /** Дальше — правки активной дорожки: чужой отпуск не должен попадать в мою сводку. */
  setOverride: (override: DayOverride) => void;
  /** Ставит одинаковую правку на несколько дней подряд: отпуск, больничный. */
  setOverrideRange: (startDate: IsoDate, days: number, shiftTypeId: string) => void;
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

/**
 * График, пришедший с другого телефона: он приносит с собой свои смены и
 * раскладку, потому что ни того, ни другого у принимающего может не быть.
 */
export interface IncomingTrack {
  name: string;
  own: boolean;
  shiftTypes: ShiftType[];
  pattern: SchedulePattern;
  anchorDate: IsoDate;
  /** Правки как они приехали: заметка внутри правки разбирается в свою запись. */
  overrides: SharedOverride[];
  payments: Array<Omit<PaymentRecord, 'id' | 'trackId'>>;
}

/** Период истории в том виде, в каком его задаёт экран: раскладку возьмём из пресета. */
export interface ScheduleEntry {
  presetId: string;
  /** С какого дня действует этот график. */
  startsOn: IsoDate;
  /** Точка выравнивания раскладки. По умолчанию совпадает с началом. */
  anchorDate: IsoDate;
  /** Своё начало смен: id смены → «ЧЧ:ММ». Пусто — как в справочнике. */
  shiftStarts?: Record<string, string>;
}

/** Что нужно, чтобы завести дорожку: остальное собирается из пресета. */
export interface NewTrack {
  name: string;
  own: boolean;
  presetId: string;
  anchorDate: IsoDate;
  /** Своё начало смен: id смены → «ЧЧ:ММ». Пусто — как в справочнике. */
  shiftStarts?: Record<string, string>;
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

/**
 * Дорожка, по которой считается сводка.
 *
 * Не активная: у чужого графика часы и деньги не считаются вовсе — он заведён,
 * чтобы видеть общие выходные, а ставки и выплаты близкого человека приложение
 * не знает. Поэтому вкладка с его календарём сводку не переключает: она
 * остаётся на своей работе.
 *
 * null — своих графиков нет ни одного, и складывать нечего.
 */
export function summaryTrack(state: AppState): ScheduleTrack | null {
  const active = activeTrack(state);
  return active?.own ? active : (state.tracks.find((track) => track.own) ?? null);
}

/**
 * Копия раскладки в дорожку: правка пресета в будущей версии не должна задним
 * числом переписывать уже прожитые месяцы. По той же причине копируется и
 * собранный руками график — иначе его правка молча меняла бы прошлое.
 *
 * Ищется и среди встроенных пресетов, и среди собранных: для дорожки они
 * ничем не отличаются.
 */
function scheduleFromPreset(
  { presetId, startsOn, anchorDate, shiftStarts }: ScheduleEntry,
  customSchedules: CustomSchedule[],
): SchedulePeriod {
  const pattern =
    SCHEDULE_PRESETS.find((item) => item.id === presetId)?.pattern ??
    customSchedules.find((item) => item.id === presetId)?.pattern;

  if (!pattern) throw new ReferenceError(`Неизвестный график "${presetId}"`);
  // Пустой набор не сохраняется вовсе: смены без своего времени должны и
  // дальше идти по справочнику, а не застыть на его сегодняшнем значении.
  const own = shiftStarts && Object.keys(shiftStarts).length > 0 ? { shiftStarts } : {};
  return { presetId, pattern, anchorDate, startsOn, ...own };
}

/**
 * История графиков в порядке действия.
 *
 * Порядок держится здесь, а не в экране: по нему движок ищет график на дату, и
 * один период, вставленный не туда, испортил бы весь календарь.
 */
function sortedSchedules(periods: SchedulePeriod[]): SchedulePeriod[] {
  return [...periods].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
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
  themes: [],
  tracks: [],
  activeTrackId: null,
  shiftTypes: DEFAULT_SHIFT_TYPES,
  customSchedules: [],
  holidays: { enabled: true },
  support: { adsHidden: false, purchasedAt: null, donationDismissed: false },
  payroll: DEFAULT_PAYROLL,
  sharedDaysOff: { enabled: false },
  sharedGroups: [],
  alarms: [],
  notes: [],
  payments: [],
  // Новая установка «что нового» не видит: рассказывать про изменения тому,
  // кто только поставил приложение, нечего.
  lastSeenReleaseId: LATEST_RELEASE_ID,
  buildCheck: { checkedAt: 0, build: null, dismissedRuntime: null },
};

/** Имя темы: обрезано по длине, пустое заменяется на понятное человеку. */
function themeName(name: string): string {
  const clean = name.trim().slice(0, MAX_THEME_NAME_LENGTH);
  return clean.length > 0 ? clean : 'Своя тема';
}

/**
 * Свои темы из снимка хранилища.
 *
 * До версии 19 цвета лежали поправками к светлой и тёмной палитре и своего
 * имени не имели. Каждый непустой набор становится темой: человек их подбирал
 * руками, и терять их при обновлении нельзя. Выбранной ни одна из них не
 * становится — до этой версии они и так показывались поверх встроенной темы,
 * которая выбрана в настройках.
 */
function migrateThemes(persisted: PersistedSnapshot): CustomTheme[] {
  if (Array.isArray(persisted.themes)) {
    return persisted.themes
      .filter((theme): theme is CustomTheme => typeof theme?.id === 'string')
      .map((theme) => ({
        id: theme.id,
        name: themeName(typeof theme.name === 'string' ? theme.name : ''),
        colors: sanitizePalette(theme.colors),
      }));
  }

  const legacy = persisted.themeColors;
  if (typeof legacy !== 'object' || legacy === null) return [];

  const themes: CustomTheme[] = [];
  for (const base of ['light', 'dark'] as const) {
    const overrides = (legacy as Record<string, unknown>)[base];
    if (typeof overrides !== 'object' || overrides === null) continue;
    const entries = Object.entries(overrides as Record<string, unknown>);
    if (entries.length === 0) continue;

    let colors = paletteOf(base);
    for (const [slotId, hex] of entries) {
      if (typeof hex === 'string') colors = paintSlot(colors, slotId, hex);
    }
    themes.push({
      id: `legacy-${base}`,
      name: base === 'dark' ? 'Своя тёмная' : 'Своя светлая',
      colors,
    });
  }
  return themes;
}

/** Выбранное оформление, если тема, на которую оно ссылается, ещё существует. */
function migrateAppearance(persisted: PersistedSnapshot): ThemePreference {
  const saved = persisted.appearance ?? 'system';
  if (!saved.startsWith('custom:')) return saved;

  const id = saved.slice('custom:'.length);
  return migrateThemes(persisted).some((theme) => theme.id === id) ? saved : 'system';
}

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

      addTheme: (name, colors) => {
        const id = createId();
        // Санитайз, а не сама палитра: сюда приходит объект из темы экрана, и
        // копия должна быть своей — иначе правка темы дотянулась бы до общей.
        const theme: CustomTheme = { id, name: themeName(name), colors: sanitizePalette(colors) };
        set((state) => ({ themes: [...state.themes, theme] }));
        return id;
      },

      renameTheme: (id, name) =>
        set((state) => ({
          themes: state.themes.map((theme) =>
            theme.id === id ? { ...theme, name: themeName(name) } : theme,
          ),
        })),

      setThemeColor: (id, slotId, hex) =>
        set((state) => ({
          themes: state.themes.map((theme) =>
            theme.id === id ? { ...theme, colors: paintSlot(theme.colors, slotId, hex) } : theme,
          ),
        })),

      removeTheme: (id) =>
        set((state) => ({
          themes: state.themes.filter((theme) => theme.id !== id),
          // Показывали именно её — возвращаемся к системной: иначе экран
          // остался бы без палитры.
          appearance: state.appearance === `custom:${id}` ? 'system' : state.appearance,
        })),

      addShiftType: (draft) => {
        const id = createId();
        const type = sanitizeShiftType({ ...draft, id, builtinId: null });
        // Полуготовую смену не заводим: редактор до этого не доводит, а
        // рабочая смена без времени навсегда осталась бы нулём часов.
        if (type) set((state) => ({ shiftTypes: [...state.shiftTypes, type] }));
        return id;
      },

      updateShiftType: (id, draft) =>
        set((state) => ({
          shiftTypes: state.shiftTypes.map((type) => {
            if (type.id !== id) return type;
            const locked =
              type.builtinId === null
                ? draft
                : { ...draft, kind: type.kind, multiDay: type.multiDay };
            return sanitizeShiftType({ ...type, ...locked }) ?? type;
          }),
        })),

      removeShiftType: (id) =>
        set((state) => {
          const type = state.shiftTypes.find((item) => item.id === id);
          if (!type || type.builtinId !== null) return {};
          if (shiftTypeUsage(state.tracks, id).schedules.length > 0) return {};

          return {
            shiftTypes: state.shiftTypes.filter((item) => item.id !== id),
            // Правка остаётся жить без смены, если в ней были часы: день
            // вернётся к графику, а отработанное руками не пропадёт. Заметки
            // дня к смене не привязаны и не страдают вовсе.
            tracks: state.tracks.map((track) => ({
              ...track,
              overrides: Object.fromEntries(
                Object.entries(track.overrides).flatMap(([date, override]) => {
                  if (override.shiftTypeId !== id) return [[date, override]];
                  const { shiftTypeId, ...rest } = override;
                  return rest.workedMinutesOverride === undefined ? [] : [[date, rest]];
                }),
              ),
            })),
          };
        }),

      addCustomSchedule: (name, pattern) => {
        const id = createId();
        set((state) => ({
          customSchedules: [...state.customSchedules, { id, name: name.trim(), pattern }],
        }));
        return id;
      },

      updateCustomSchedule: (id, patch) =>
        set((state) => ({
          customSchedules: state.customSchedules.map((schedule) =>
            schedule.id === id ? { ...schedule, ...patch } : schedule,
          ),
        })),

      removeCustomSchedule: (id) =>
        set((state) => ({
          customSchedules: state.customSchedules.filter((schedule) => schedule.id !== id),
        })),

      addTrack: ({ name, own, presetId, anchorDate, shiftStarts }) => {
        const id = createId();
        const track: ScheduleTrack = {
          id,
          // Первую дорожку заводят, просто выбрав график: имя у неё никто не
          // спрашивал, и подставить его должно приложение.
          name: name.trim() || MAIN_TRACK_NAME,
          own,
          // История начинается с первой смены: раньше неё человек здесь не работал.
          schedules: [
            scheduleFromPreset(
              { presetId, startsOn: anchorDate, anchorDate, shiftStarts },
              get().customSchedules,
            ),
          ],
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

      setTrackSchedule: (id, index, entry) =>
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== id) return track;
            const next = scheduleFromPreset(entry, state.customSchedules);
            const schedules = track.schedules.map((period, at) => (at === index ? next : period));
            // Номера вне списка не создают период молча: правят то, что есть.
            return { ...track, schedules: sortedSchedules(schedules) };
          }),
        })),

      addTrackSchedule: (id, entry) =>
        set((state) => ({
          tracks: state.tracks.map((track) => {
            if (track.id !== id) return track;
            const next = scheduleFromPreset(entry, state.customSchedules);
            const kept = track.schedules.filter((period) => period.startsOn !== next.startsOn);
            return { ...track, schedules: sortedSchedules([...kept, next]) };
          }),
        })),

      removeTrackSchedule: (id, index) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === id
              ? { ...track, schedules: track.schedules.filter((_, at) => at !== index) }
              : track,
          ),
        })),

      clearSchedule: () => set({ tracks: [], activeTrackId: null }),

      restoreState: (next) => set(next),

      addSharedTrack: ({ name, own, shiftTypes, pattern, anchorDate, overrides, payments }) => {
        const id = createId();
        const track: ScheduleTrack = {
          id,
          name: name.trim() || MAIN_TRACK_NAME,
          own,
          // Раскладка копируется как есть: пресета, на который можно было бы
          // сослаться, у пришедшего графика нет. Историей чужой график не
          // делится — приезжает то, по чему человек работает сейчас.
          schedules: [{ presetId: `shared-${id}`, pattern, anchorDate, startsOn: anchorDate }],
          // Заметка приезжает внутри правки — формат обмена старше, чем
          // отдельная заметка. Здесь она разбирается обратно: правка остаётся
          // только там, где есть смена или часы.
          overrides: Object.fromEntries(
            overrides
              .map(({ note, ...rest }) => rest)
              .filter(
                (override) =>
                  override.shiftTypeId !== undefined ||
                  override.workedMinutesOverride !== undefined,
              )
              .map((override) => [override.date, override]),
          ),
          payrollRules: DEFAULT_PAYMENT_RULES,
        };

        const incomingNotes: DayNote[] = overrides.flatMap((override) => {
          const text = normalizeNoteText(override.note ?? '');
          return text.length === 0
            ? []
            : [
                {
                  id: createId(),
                  date: override.date,
                  text,
                  // Напоминания в коде графика нет: время звонка — дело того
                  // телефона, на котором заметку завели.
                  remindAt: null,
                  createdAt: Date.now(),
                },
              ];
        });

        set((state) => ({
          // Смены дописываются, а не заменяют свои: у принимающего свой
          // справочник, и терять его из-за чужого графика нельзя.
          shiftTypes: [...state.shiftTypes, ...shiftTypes],
          tracks: [...state.tracks, track],
          notes: [...state.notes, ...incomingNotes],
          payments: [
            ...state.payments,
            ...payments.map((payment) => ({ ...payment, id: createId(), trackId: id })),
          ],
          activeTrackId: id,
        }));

        return id;
      },

      setHolidays: (patch) => set((state) => ({ holidays: { ...state.holidays, ...patch } })),

      setSupport: (patch) => set((state) => ({ support: { ...state.support, ...patch } })),

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

      addNote: ({ date, text, remindAt }) => {
        const clean = normalizeNoteText(text);
        // Пустую заметку не заводим: список дня наполнился бы записями, у
        // которых нечего показать и незачем открывать.
        if (clean.length === 0) return null;

        const id = createId();
        set((state) => ({
          notes: [...state.notes, { id, date, text: clean, remindAt, createdAt: Date.now() }],
        }));
        return id;
      },

      updateNote: (id, patch) =>
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id
              ? {
                  ...note,
                  ...patch,
                  // Текст чинится в одном месте, как и при заведении: пустой
                  // здесь не отбрасывается — экран не даёт сохранить такой.
                  text: patch.text === undefined ? note.text : normalizeNoteText(patch.text),
                }
              : note,
          ),
        })),

      removeNote: (id) => set((state) => ({ notes: state.notes.filter((note) => note.id !== id) })),

      setOverride: (override) =>
        set((state) =>
          patchActiveTrack(state, (track) => {
            // Правка, в которой не осталось ни смены, ни часов, — это
            // отсутствие правки. Без этой ветки стёртые часы оставляли бы за
            // собой пустую запись, и день до конца жизни числился бы тронутым.
            const empty =
              override.shiftTypeId === undefined && override.workedMinutesOverride === undefined;

            if (empty) {
              const { [override.date]: removed, ...rest } = track.overrides;
              return { ...track, overrides: rest };
            }
            return { ...track, overrides: { ...track.overrides, [override.date]: override } };
          }),
        ),

      setOverrideRange: (startDate, days, shiftTypeId) =>
        set((state) =>
          patchActiveTrack(state, (track) => {
            const overrides = { ...track.overrides };
            for (let offset = 0; offset < days; offset += 1) {
              const date = addDays(startDate, offset);
              overrides[date] = { date, shiftTypeId };
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
      /** В хранилище уходят данные пользователя, включая правленый справочник смен. */
      partialize: (state): PersistedState => ({
        appearance: state.appearance,
        themes: state.themes,
        shiftTypes: state.shiftTypes,
        customSchedules: state.customSchedules,
        holidays: state.holidays,
        support: state.support,
        tracks: state.tracks,
        payroll: state.payroll,
        sharedDaysOff: state.sharedDaysOff,
        sharedGroups: state.sharedGroups,
        alarms: state.alarms,
        notes: state.notes,
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
 *
 * В версии 13 справочник смен стал пользовательским и поехал в хранилище.
 * Снимок любой прошлой версии даёт ровно встроенный набор — править его до сих
 * пор было нечем.
 *
 * В версии 14 появились графики, собранные в конструкторе, и переключатель
 * производственного календаря. В снимке прошлых версий их нет: список графиков
 * пустой, а праздники включены — так же, как у новой установки.
 *
 * В версии 15 добавилось состояние слота поддержки: покупка и скрытая карточка
 * доната. У всех, кто обновляется, ничего не куплено и ничего не скрыто.
 *
 * В версии 16 график дорожки стал историей периодов, а не одним графиком.
 *
 * В версии 19 цвета стали темой: у оформления появилось имя, полная палитра и
 * место в общем списке тем. Поправки версии 18 превращаются в готовые темы —
 * по одной на каждый непустой набор.
 *
 * В версии 18 появились свои цвета оформления. В снимке прошлых версий их
 * нет — палитра остаётся ровно той, что в коде.
 *
 * В версии 17 заметка перестала быть полем правки дня: заметок к одному дню
 * может быть несколько, у каждой своё напоминание, и лежат они общим списком —
 * не внутри дорожки. Заметки всех дорожек переезжают туда, правки без смены и
 * часов при этом исчезают: тронутым день делала не заметка.
 */
export function migrateState(persisted: PersistedSnapshot, _version: number): AppState {
  // Плоские поля прошлых схем разбираются по дорожкам и дальше не едут: без
  // этого они остались бы висеть в состоянии мёртвым грузом.
  const { schedule, overrides, payroll: legacyPayroll, ...rest } = persisted;
  const { rules, ...payroll } = legacyPayroll ?? {};

  // Справочник смен поднимается первым: по нему проверяются сохранённые
  // графики. Со встроенным набором вместо него график на своей смене
  // сбрасывался бы при каждом запуске.
  const shiftTypes = migrateShiftTypes(persisted.shiftTypes);

  // Собранные руками графики проверяются по тому же справочнику: собранный на
  // удалённой смене раскладывать нечем.
  const customSchedules = migrateCustomSchedules(persisted.customSchedules, shiftTypes);

  // График сбрасывается, если смена, на которую он ссылается, исчезла из
  // справочника: разложить такой график нельзя, а падает он на каждой дате.
  // Сама дорожка при этом остаётся — в ней лежат правки дней.
  const tracks = migrateTracks(persisted, shiftTypes);

  // Будильники переносятся после дорожек: старому «по графику» нужно знать, к
  // какой работе его привязать. До версии 4 будильник был не списком, а одним
  // набором настроек по типам смен — переносить оттуда нечего: звонить он не
  // успел ни разу, ни одна сборка с нативной частью не выходила.
  const alarms = Array.isArray(persisted.alarms)
    ? persisted.alarms.map((alarm) => migrateAlarm(alarm, tracks))
    : [];

  // Заметки собираются из того же снимка, что и дорожки: до версии 17 они
  // лежали внутри правок, и прочитать их надо до того, как правки почищены.
  const notes = migrateNotes(persisted);

  return {
    ...INITIAL_STATE,
    ...rest,
    tracks,
    payments: migratePayments(persisted.payments, tracks),
    // Числа выплат уехали в дорожки: в общих настройках денег их больше нет.
    payroll: { ...DEFAULT_PAYROLL, ...payroll },
    alarms,
    notes,
    shiftTypes,
    customSchedules,
    // Обновление со старой схемы — это человек, который только что получил
    // новую версию: ему «что нового» показать надо, поэтому null, а не
    // значение по умолчанию для новой установки.
    lastSeenReleaseId: persisted.lastSeenReleaseId ?? null,
    // Кеш проверки и настройки совпадений достраиваются по частям: в старом
    // снимке их нет вовсе, а в снимке поновее может не быть половины полей.
    buildCheck: { ...INITIAL_STATE.buildCheck, ...persisted.buildCheck },
    sharedDaysOff: { ...INITIAL_STATE.sharedDaysOff, ...persisted.sharedDaysOff },
    holidays: { ...INITIAL_STATE.holidays, ...persisted.holidays },
    support: { ...INITIAL_STATE.support, ...persisted.support },
    // Темы чистятся при чтении, а не при показе: снимок мог прийти из файла
    // копии, сделанного чужой рукой, и оттуда в стиль ушло бы что угодно.
    themes: migrateThemes(persisted),
    // Выбранная тема, которой в списке нет, — это системное оформление:
    // ссылка могла пережить удаление темы в чужом файле копии.
    appearance: migrateAppearance(persisted),
    // Участники, чьи дорожки удалили, из групп выбрасываются: иначе группа
    // навсегда осталась бы без совпадений и объяснить это было бы нечем.
    sharedGroups: (persisted.sharedGroups ?? []).map((group) => ({
      ...group,
      trackIds: group.trackIds.filter((id) => tracks.some((track) => track.id === id)),
    })),
  };
}
