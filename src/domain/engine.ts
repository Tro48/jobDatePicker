import { addDays, daysBetween, floorMod, parseTimeToMinutes, startOfWeek, weekday } from './date.ts';
import type { IsoDate } from './date.ts';
import type {
  ActiveSchedule,
  DayOverride,
  ResolvedDay,
  SchedulePattern,
  SchedulePreset,
  ShiftType,
} from './types.ts';

/** Всё, что нужно движку, чтобы разложить любую дату. */
export interface ScheduleContext {
  schedule: ActiveSchedule;
  shiftTypes: Map<string, ShiftType>;
  /** Ручные правки по датам. */
  overrides: Map<IsoDate, DayOverride>;
}

/**
 * Оплачиваемая длительность смены в минутах.
 * start === end означает ровно сутки; end < start — переход через полночь.
 */
export function shiftDurationMinutes(shiftType: ShiftType): number {
  if (shiftType.kind === 'rest' || !shiftType.time) return 0;
  const start = parseTimeToMinutes(shiftType.time.start);
  const end = parseTimeToMinutes(shiftType.time.end);
  const span = end > start ? end - start : end - start + 24 * 60;
  return Math.max(0, span - shiftType.time.unpaidBreakMinutes);
}

/**
 * Какой тип смены даёт сам график на эту дату, без учёта ручных правок.
 *
 * Новый вид графика добавляется новым вариантом SchedulePattern и одной веткой
 * здесь — остальной код на него не завязан.
 */
export function resolvePlannedShiftId(schedule: ActiveSchedule, date: IsoDate): string {
  const pattern: SchedulePattern = schedule.pattern;

  if (pattern.kind === 'cycle') {
    if (pattern.slots.length === 0) {
      throw new RangeError('Цикл графика не может быть пустым');
    }
    // floorMod, а не %, — иначе даты до первой смены дают отрицательный индекс.
    const offset = daysBetween(schedule.anchorDate, date);
    return pattern.slots[floorMod(offset, pattern.slots.length)];
  }

  if (pattern.weeks.length === 0) {
    throw new RangeError('Недельный график должен содержать хотя бы одну неделю');
  }
  // Недели чередуются от недели, в которую попала дата отсчёта.
  const weeksApart = Math.floor(daysBetween(startOfWeek(schedule.anchorDate), startOfWeek(date)) / 7);
  const week = pattern.weeks[floorMod(weeksApart, pattern.weeks.length)];
  return week[weekday(date)];
}

/** Итоговый день календаря: график плюс ручная правка поверх него. */
export function resolveDay(context: ScheduleContext, date: IsoDate): ResolvedDay {
  const override = context.overrides.get(date);
  const shiftTypeId = override?.shiftTypeId ?? resolvePlannedShiftId(context.schedule, date);
  const shiftType = context.shiftTypes.get(shiftTypeId);

  if (!shiftType) {
    throw new ReferenceError(`Неизвестный тип смены "${shiftTypeId}" на дату ${date}`);
  }

  return {
    date,
    shiftType,
    source: override ? 'override' : 'schedule',
    workedMinutes: override?.workedMinutesOverride ?? shiftDurationMinutes(shiftType),
    note: override?.note,
  };
}

export function resolveRange(context: ScheduleContext, dates: IsoDate[]): ResolvedDay[] {
  return dates.map((date) => resolveDay(context, date));
}

/**
 * Проверяет, что пресет ссылается только на существующие смены и покрывает все
 * семь дней недели. Вызывается на старте приложения и в тестах, чтобы новый
 * график не падал в рантайме на середине месяца.
 */
export function validatePreset(preset: SchedulePreset, shiftTypes: Map<string, ShiftType>): string[] {
  const errors: string[] = [];
  const pattern = preset.pattern;

  if (pattern.kind === 'cycle') {
    if (pattern.slots.length === 0) errors.push(`${preset.id}: пустой цикл`);
    pattern.slots.forEach((id, index) => {
      if (!shiftTypes.has(id)) errors.push(`${preset.id}: слот ${index} ссылается на несуществующую смену "${id}"`);
    });
    return errors;
  }

  if (pattern.weeks.length === 0) errors.push(`${preset.id}: нет ни одной недели`);
  pattern.weeks.forEach((week, weekIndex) => {
    for (let day = 1; day <= 7; day += 1) {
      const id = week[day as 1 | 2 | 3 | 4 | 5 | 6 | 7];
      if (id === undefined) {
        errors.push(`${preset.id}: неделя ${weekIndex}, не задан день недели ${day}`);
      } else if (!shiftTypes.has(id)) {
        errors.push(`${preset.id}: неделя ${weekIndex}, день ${day} ссылается на несуществующую смену "${id}"`);
      }
    }
  });
  return errors;
}

/** Непрерывный отрезок одинаковых ручных правок вокруг даты. */
export interface OverrideRun {
  start: IsoDate;
  end: IsoDate;
  length: number;
  /** Какой это день отрезка по счёту, начиная с 1. */
  position: number;
}

/**
 * Ищет отпуск или больничный целиком по одному дню из него.
 *
 * Нужно, чтобы карточка дня говорила «отпуск, 3-й день из 14», а не просто
 * «отпуск»: без этого непонятно, куда именно ты попал, и легко продлить отпуск
 * второй раз поверх уже проставленного.
 */
export function findOverrideRun(
  overrides: Map<IsoDate, DayOverride>,
  date: IsoDate,
): OverrideRun | null {
  const current = overrides.get(date);
  if (!current) return null;

  const sameType = (candidate: IsoDate): boolean =>
    overrides.get(candidate)?.shiftTypeId === current.shiftTypeId;

  let start = date;
  while (sameType(addDays(start, -1))) start = addDays(start, -1);

  let end = date;
  while (sameType(addDays(end, 1))) end = addDays(end, 1);

  return {
    start,
    end,
    length: daysBetween(start, end) + 1,
    position: daysBetween(start, date) + 1,
  };
}
