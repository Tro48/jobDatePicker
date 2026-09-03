import { scheduleUsesKnownShifts } from '../domain/engine.ts';
import { indexShiftTypes } from '../domain/shifts.ts';
import type { Alarm, AlarmRepeat } from '../domain/alarm.ts';
import type {
  ActiveSchedule,
  DayOverride,
  PaymentRecord,
  PaymentRule,
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

/** Состояние до версии 9: график и правки лежали в корне, поодиночке. */
export interface LegacyFlatState {
  schedule?: ActiveSchedule | null;
  overrides?: Record<IsoDate, DayOverride>;
  tracks?: ScheduleTrack[];
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

  const clean = (track: ScheduleTrack): ScheduleTrack => ({
    ...track,
    schedule: migrateSchedule(track.schedule, shiftTypes),
    overrides: track.overrides ?? {},
    payrollRules: track.payrollRules ?? rules,
  });

  if (Array.isArray(persisted.tracks)) return persisted.tracks.map(clean);

  const schedule = migrateSchedule(persisted.schedule, shiftTypes);
  const overrides = persisted.overrides ?? {};
  if (!schedule && Object.keys(overrides).length === 0) return [];

  return [
    { id: 'main', name: MAIN_TRACK_NAME, own: true, schedule, overrides, payrollRules: rules },
  ];
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
