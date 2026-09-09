import { scheduleUsesKnownShifts } from '../domain/engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes, sanitizeShiftType } from '../domain/shifts.ts';
import type { Alarm, AlarmRepeat } from '../domain/alarm.ts';
import { sanitizeCustomSchedule } from '../domain/customSchedules.ts';
import { normalizeNoteText, sanitizeNote } from '../domain/notes.ts';
import type {
  ActiveSchedule,
  CustomSchedule,
  DayNote,
  DayOverride,
  PaymentRecord,
  PaymentRule,
  SchedulePeriod,
  ScheduleTrack,
  ShiftType,
} from '../domain/types.ts';
import { DEFAULT_PAYMENT_RULES } from '../domain/payday.ts';
import type { IsoDate } from '../domain/date.ts';

/**
 * Переносы данных между версиями схемы хранилища.
 *
 * Лежат отдельно от store и не тянут ни react-native, ни zustand: миграцию надо
 * проверять тестами, а не выяснять на телефоне после обновления. По той же
 * причине импорты здесь относительные, а не через `@/`: алиасы в обычном Node
 * не разворачиваются, а тесты бегут именно там.
 */

/** В версии 5 режим «по графику» хранил выбранные пользователем типы смен. */
interface LegacyScheduleRepeat {
  kind: 'schedule';
  shiftTypeIds: string[];
}

/** До версии 11 график был один, и времена подъёма лежали плоско по сменам. */
interface LegacyTimesRepeat {
  kind: 'schedule';
  times: Record<string, string>;
}

/**
 * Будильник со старых версий.
 *
 * В версии 6 смены перестали выбираться руками: будильник звонит в каждый
 * рабочий день графика, а времена берутся из самого графика.
 *
 * В версии 11 «график» стал списком графиков. Время будильника в обоих
 * переносах сохраняется, и звонить он продолжает.
 */
export function migrateAlarm(alarm: Alarm, tracks: ScheduleTrack[]): Alarm {
  const repeat = alarm.repeat as AlarmRepeat | LegacyScheduleRepeat | LegacyTimesRepeat;
  if (repeat.kind !== 'schedule') return alarm;

  // Версия 5: выбранные вручную смены отбрасываются, переносить их некуда.
  if ('shiftTypeIds' in repeat) {
    return { ...alarm, repeat: { kind: 'schedule', tracks: [] } };
  }

  // Версия 11: график стал списком. Времена подъёма достаются той работе, по
  // которой будильник и звонил, — первой своей. Отдать их всем дорожкам
  // нельзя: человек начал бы вставать ещё и по чужому графику.
  if ('times' in repeat) {
    const target = tracks.find((track) => track.own) ?? tracks[0];
    return {
      ...alarm,
      repeat: {
        kind: 'schedule',
        tracks: target ? [{ trackId: target.id, times: repeat.times }] : [],
      },
    };
  }

  return alarm;
}

/**
 * Справочник смен из снимка хранилища.
 *
 * До версии 13 смены задавались кодом и в хранилище не уходили вовсе: снимок
 * из старой сборки перекрывал бы новые поля — так однажды пропал признак
 * многодневности у отпуска. Теперь смены правит пользователь, и хранить их
 * приходится, но исходная опасность никуда не делась. Поэтому встроенная смена
 * не читается из снимка целиком, а собирается заново: код даёт основу и все
 * поля, которых в снимке ещё нет, а снимок — только то, что человек правил
 * руками.
 *
 * Встроенные смены присутствуют всегда, даже если в снимке их нет: на их id
 * ссылаются встроенные графики.
 */
export function migrateShiftTypes(persisted: unknown): ShiftType[] {
  const saved = Array.isArray(persisted) ? persisted : [];
  const byBuiltin = new Map<string, ShiftType>();
  const custom: ShiftType[] = [];
  // Порядок списка — пользовательский: смены показываются в нём и в календаре,
  // и в выборе смены на день, и переставлять их за человека незачем.
  const order: string[] = [];

  for (const raw of saved) {
    const type = sanitizeShiftType(raw);
    if (!type) continue;
    if (type.builtinId !== null) {
      if (byBuiltin.has(type.builtinId)) continue;
      byBuiltin.set(type.builtinId, type);
      order.push(type.builtinId);
    } else {
      custom.push(type);
      order.push(type.id);
    }
  }

  const result: ShiftType[] = [];
  const takenIds = new Set<string>();

  for (const id of order) {
    const builtin = DEFAULT_SHIFT_TYPES.find((type) => type.builtinId === id);
    const type = builtin
      ? mergeBuiltinShiftType(builtin, byBuiltin.get(id))
      : custom.find((item) => item.id === id);
    // Встроенная смена, которой в коде больше нет, дальше не едет: ссылаться
    // на неё некому — сохранённые графики чинит migrateSchedule.
    if (!type || takenIds.has(type.id)) continue;
    takenIds.add(type.id);
    result.push(type);
  }

  // Смены, добавленные новой версией приложения, дописываются в конец: в
  // снимке их нет, а без них сломаются встроенные графики.
  for (const builtin of DEFAULT_SHIFT_TYPES) {
    if (!takenIds.has(builtin.id)) result.push(builtin);
  }

  return result;
}

/**
 * Встроенная смена: основа из кода, правки — из хранилища.
 *
 * Вид смены и многодневность из снимка не берутся намеренно. Отпуск, ставший
 * рабочим днём, ломает сводку часов, а «Выходной», превратившийся в смену,
 * ломает все встроенные графики разом — при том, что ни того, ни другого
 * редактор сделать не даёт.
 */
function mergeBuiltinShiftType(builtin: ShiftType, saved: ShiftType | undefined): ShiftType {
  if (!saved) return builtin;
  return {
    ...builtin,
    name: saved.name,
    badge: saved.badge,
    colorToken: saved.colorToken,
    rateMultiplier: saved.rateMultiplier,
    // Времени нет у нерабочих смен — ни в коде, ни в правке.
    ...(builtin.time && saved.time ? { time: saved.time } : {}),
  };
}

/**
 * Собранные руками графики из снимка хранилища.
 *
 * Проверяются по справочнику смен: график, собранный на смене, которой больше
 * нет, разложить нечем. Такой выбрасывается из списка выбора целиком, а
 * дорожки, на которых он уже стоит, не страдают — они держат свою копию
 * раскладки, и её отдельно чинит migrateSchedule.
 */
export function migrateCustomSchedules(
  persisted: unknown,
  shiftTypes: ShiftType[],
): CustomSchedule[] {
  if (!Array.isArray(persisted)) return [];
  return persisted
    .map((raw) => sanitizeCustomSchedule(raw, shiftTypes))
    .filter((schedule): schedule is CustomSchedule => schedule !== null);
}

/**
 * График, который ещё можно разложить, или ничего.
 *
 * При выборе графика его паттерн копируется в хранилище, а справочник смен
 * всегда берётся из кода. Значит, выпуск, убравший или переименовавший id
 * смены, приезжает по воздуху и делает сохранённый график неразрешимым:
 * resolveDay начинает падать на каждой дате и уносит с собой календарь, сводку
 * и планировщик будильников — а починить это с телефона нечем.
 *
 * Поэтому такой график сбрасывается при подъёме состояния. Человек увидит
 * знакомый экран «График не выбран», а не белое поле; правки дней, выплаты и
 * будильники при этом остаются на месте.
 */
export function migrateSchedule(
  schedule: ActiveSchedule | null | undefined,
  shiftTypes: ShiftType[],
): ActiveSchedule | null {
  if (!schedule) return null;
  return scheduleUsesKnownShifts(schedule, indexShiftTypes(shiftTypes)) ? schedule : null;
}

/**
 * История графиков дорожки из снимка любой версии.
 *
 * До версии 16 график был один: он и становится единственным периодом, а
 * начинается с даты первой смены — единственной даты, которая тогда была. Для
 * прожитых месяцев это ничего не меняет: раскладка та же, просто теперь у неё
 * есть начало.
 *
 * Неразрешимые периоды выбрасываются поштучно: если исчезнувшая смена была
 * только в прошлогодней пятидневке, терять из-за неё текущий график незачем.
 * Порядок восстанавливается здесь же — на него опирается поиск графика по дате.
 */
export function migrateSchedules(
  raw: unknown,
  legacy: ActiveSchedule | null | undefined,
  shiftTypes: ShiftType[],
): SchedulePeriod[] {
  const index = indexShiftTypes(shiftTypes);

  const periods: SchedulePeriod[] = Array.isArray(raw)
    ? (raw as SchedulePeriod[]).filter(
        (period) =>
          period !== null &&
          typeof period === 'object' &&
          typeof period.startsOn === 'string' &&
          typeof period.anchorDate === 'string' &&
          period.pattern !== undefined,
      )
    : legacy
      ? [{ ...legacy, startsOn: legacy.anchorDate }]
      : [];

  return periods
    .filter((period) => scheduleUsesKnownShifts(period, index))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/**
 * Дорожка из снимка: до версии 16 график был один и лежал в поле schedule, а до
 * версии 17 заметка дня лежала внутри правки.
 */
type LegacyTrack = ScheduleTrack & {
  schedule?: ActiveSchedule | null;
  overrides?: Record<IsoDate, LegacyOverride>;
};

/** Правка из снимка: до версии 17 она держала ещё и заметку дня. */
type LegacyOverride = DayOverride & { note?: string };

/** Состояние до версии 9: график и правки лежали в корне, поодиночке. */
export interface LegacyFlatState {
  /**
   * Свои цвета версии 18: поправки к светлой и тёмной палитре без имени.
   * В версии 19 из каждого непустого набора получается тема.
   */
  themeColors?: unknown;
  schedule?: ActiveSchedule | null;
  overrides?: Record<IsoDate, LegacyOverride>;
  tracks?: LegacyTrack[];
  /** До версии 10 числа выплат были общими и лежали в настройках денег. */
  payroll?: { rules?: PaymentRule[] };
  payments?: PaymentRecord[];
}

/** Имя первой дорожки. Человек его не выбирал — до версии 9 график был один. */
export const MAIN_TRACK_NAME = 'Основная';

/**
 * Дорожки из снимка любой версии.
 *
 * До версии 9 график был один и лежал в корне вместе с правками. Такой снимок
 * сворачивается в единственную дорожку — но только если в нём было что
 * сохранять: у того, кто график так и не выбрал, дорожек не появляется, и он
 * видит привычное «График не выбран», а не пустую дорожку с именем.
 *
 * Неразрешимый график (его смена исчезла из справочника) обнуляется, а сама
 * дорожка остаётся: в ней лежат правки дней, и терять отпуск из-за
 * переименованной смены нельзя.
 */
export function migrateTracks(
  persisted: LegacyFlatState,
  shiftTypes: ShiftType[],
): ScheduleTrack[] {
  // До версии 10 числа аванса и зарплаты были общими: они и достаются каждой
  // дорожке. Разойтись по работам они смогут дальше, руками.
  const rules = persisted.payroll?.rules ?? DEFAULT_PAYMENT_RULES;

  const clean = (track: LegacyTrack): ScheduleTrack => ({
    ...track,
    schedules: migrateSchedules(track.schedules, track.schedule, shiftTypes),
    overrides: stripNotes(track.overrides),
    payrollRules: track.payrollRules ?? rules,
  });

  if (Array.isArray(persisted.tracks)) return persisted.tracks.map(clean);

  const schedules = migrateSchedules(undefined, persisted.schedule, shiftTypes);
  const overrides = persisted.overrides ?? {};
  if (schedules.length === 0 && Object.keys(overrides).length === 0) return [];

  return [
    {
      id: LEGACY_TRACK_ID,
      name: MAIN_TRACK_NAME,
      own: true,
      schedules,
      overrides: stripNotes(overrides),
      payrollRules: rules,
    },
  ];
}

/** Имя единственной дорожки из плоского снимка. */
const LEGACY_TRACK_ID = 'main';

/**
 * Правки без заметок: с версии 17 заметка — своя сущность.
 *
 * Правка, в которой кроме заметки ничего не было, исчезает целиком: без неё
 * день перестаёт числиться тронутым, а сама заметка уже переехала в общий
 * список.
 */
function stripNotes(
  overrides: Record<IsoDate, LegacyOverride> | undefined,
): Record<IsoDate, DayOverride> {
  const result: Record<IsoDate, DayOverride> = {};
  for (const [date, { note, ...rest }] of Object.entries(overrides ?? {})) {
    if (rest.shiftTypeId === undefined && rest.workedMinutesOverride === undefined) continue;
    result[date as IsoDate] = rest;
  }
  return result;
}

/**
 * Заметки из снимка любой версии.
 *
 * До версии 17 заметка была полем правки дня и жила внутри дорожки: у одного
 * дня она была одна, а у двух работ — по своей. Теперь заметки общие для дня и
 * лежат отдельным списком, поэтому переезжают заметки всех дорожек разом; id
 * собирается из дорожки и даты, чтобы две заметки на одно число не слиплись.
 *
 * Время создания у переехавших нулевое: когда их написали, снимок не хранил. В
 * списке дня они от этого встают первыми, в порядке дорожек — ровно так же,
 * как их видели до обновления.
 */
export function migrateNotes(persisted: LegacyFlatState & { notes?: unknown }): DayNote[] {
  const saved = Array.isArray(persisted.notes)
    ? persisted.notes.map(sanitizeNote).filter((note): note is DayNote => note !== null)
    : [];

  const legacy: DayNote[] = [];
  const fromOverrides = (
    trackId: string,
    overrides: Record<IsoDate, LegacyOverride> = {},
  ): void => {
    for (const [date, override] of Object.entries(overrides)) {
      const text = normalizeNoteText(override.note ?? '');
      if (text.length === 0) continue;
      legacy.push({
        id: `note-${trackId}-${date}`,
        date: date as IsoDate,
        text,
        remindAt: null,
        createdAt: 0,
      });
    }
  };

  if (Array.isArray(persisted.tracks)) {
    for (const track of persisted.tracks) fromOverrides(track.id, track.overrides);
  } else {
    fromOverrides(LEGACY_TRACK_ID, persisted.overrides);
  }

  // Уже переехавшие заметки идут первыми: на следующем запуске в правках
  // заметок не останется вовсе, и список перестанет расти.
  return [...saved, ...legacy.filter((note) => !saved.some((item) => item.id === note.id))];
}

/**
 * Выплаты с привязкой к работе.
 *
 * До версии 10 работа была одна, и вопроса «чьи это деньги» не стояло. Всё
 * внесённое достаётся первой дорожке: она и есть та самая единственная работа,
 * из которой выросли остальные. Выплаты дорожек, которых больше нет, тоже
 * переезжают туда — иначе внесённые руками суммы просто исчезли бы из сводки.
 */
export function migratePayments(
  payments: PaymentRecord[] | undefined,
  tracks: ScheduleTrack[],
): PaymentRecord[] {
  if (!Array.isArray(payments)) return [];
  const fallback = tracks[0]?.id;
  if (fallback === undefined) return [];

  const known = new Set(tracks.map((track) => track.id));
  return payments.map((payment) =>
    known.has(payment.trackId) ? payment : { ...payment, trackId: fallback },
  );
}
