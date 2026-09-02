import {
  addDays,
  daysBetween,
  floorMod,
  parseTimeToMinutes,
  startOfWeek,
  weekday,
} from './date.ts';
import type { IsoDate, Weekday } from './date.ts';
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
  const weeksApart = Math.floor(
    daysBetween(startOfWeek(schedule.anchorDate), startOfWeek(date)) / 7,
  );
  const week = pattern.weeks[floorMod(weeksApart, pattern.weeks.length)];
  return week[weekday(date)];
}

/**
 * Какие типы смен вообще встречаются в графике, по порядку появления.
 *
 * Нужно будильнику: когда в графике чередуются дневные и ночные, время
 * подъёма у них разное, и экран правки показывает столько полей времени,
 * сколько смен в графике, — спрашивать это у пользователя незачем.
 */
export function patternShiftTypeIds(pattern: SchedulePattern): string[] {
  const ids =
    pattern.kind === 'cycle'
      ? pattern.slots
      : pattern.weeks.flatMap((week) => [1, 2, 3, 4, 5, 6, 7].map((day) => week[day as Weekday]));

  return [...new Set(ids)];
}

/** Итоговый день календаря: график плюс ручная правка поверх него. */
export function resolveDay(context: ScheduleContext, date: IsoDate): ResolvedDay {
  const override = context.overrides.get(date);
  const plannedId = resolvePlannedShiftId(context.schedule, date);
  const shiftTypeId = override?.shiftTypeId ?? plannedId;
  const shiftType = context.shiftTypes.get(shiftTypeId);

  if (!shiftType) {
    throw new ReferenceError(`Неизвестный тип смены "${shiftTypeId}" на дату ${date}`);
  }

  // Правка, которая ничего не меняет по существу, — это заметка, а не
  // изменённый день. Иначе одна подпись «вышел за Сергея» зажигала бы точку в
  // клетке и попадала в счёт правок за месяц.
  const changed =
    override !== undefined &&
    (override.shiftTypeId !== undefined || override.workedMinutesOverride !== undefined);

  // Норма берётся у смены из графика, даже когда день переопределён. Тип
  // смены из графика может отсутствовать в справочнике только у сломанного
  // сохранённого графика — это ловит scheduleUsesKnownShifts при подъёме
  // состояния; ронять из-за этого клетку календаря незачем.
  const plannedType = context.shiftTypes.get(plannedId);

  return {
    date,
    shiftType,
    source: changed ? 'override' : 'schedule',
    workedMinutes: override?.workedMinutesOverride ?? shiftDurationMinutes(shiftType),
    plannedMinutes: plannedType ? shiftDurationMinutes(plannedType) : 0,
    note: override?.note,
  };
}

/**
 * На сколько минут факт разошёлся с графиком: больше нуля — переработка,
 * меньше — недоработка.
 *
 * Сравнивается с тем, что на этот день давал график, а не с нормой смены,
 * которая в дне стоит: подработка в выходной — это плюс все её часы, а не
 * минус до штатной длительности подработки.
 *
 * У выходных отклонения нет вовсе. Отпуск, больничный и внеплановый выходной
 * поверх смены иначе показывали бы «−12» на каждом дне: формально часов
 * действительно меньше, но недоработкой это не является, а календарь на две
 * недели отпуска заливался бы красным.
 */
export function overtimeMinutes(day: ResolvedDay): number {
  if (day.shiftType.kind === 'rest') return 0;
  return day.workedMinutes - day.plannedMinutes;
}

export function resolveRange(context: ScheduleContext, dates: IsoDate[]): ResolvedDay[] {
  return dates.map((date) => resolveDay(context, date));
}

/**
 * Проверяет, что пресет ссылается только на существующие смены и покрывает все
 * семь дней недели.
 *
 * Вызывается тестами: справочник пресетов задан кодом, значит и проверять его
 * надо до выпуска, а не на телефоне. От уже сохранённого у пользователя
 * графика, чья смена исчезла из справочника, защищает scheduleUsesKnownShifts
 * при подъёме состояния.
 */
export function validatePreset(
  preset: SchedulePreset,
  shiftTypes: Map<string, ShiftType>,
): string[] {
  const errors: string[] = [];
  const pattern = preset.pattern;

  if (pattern.kind === 'cycle') {
    if (pattern.slots.length === 0) errors.push(`${preset.id}: пустой цикл`);
    pattern.slots.forEach((id, index) => {
      if (!shiftTypes.has(id))
        errors.push(`${preset.id}: слот ${index} ссылается на несуществующую смену "${id}"`);
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
        errors.push(
          `${preset.id}: неделя ${weekIndex}, день ${day} ссылается на несуществующую смену "${id}"`,
        );
      }
    }
  });
  return errors;
}

/**
 * Все ли смены сохранённого графика есть в справочнике.
 *
 * Паттерн копируется в хранилище при выборе графика, а справочник смен всегда
 * берётся из кода. Значит, выпуск, переименовавший id смены, приезжает по
 * воздуху и делает сохранённый график неразрешимым: resolveDay начинает падать
 * на каждой дате, а вместе с ним календарь, сводка и планировщик будильников.
 * Проверяется при подъёме состояния, до первого рендера.
 */
export function scheduleUsesKnownShifts(
  schedule: ActiveSchedule,
  shiftTypes: Map<string, ShiftType>,
): boolean {
  return patternShiftTypeIds(schedule.pattern).every((id) => shiftTypes.has(id));
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
  // Правка без смены — это заметка или часы, отпуском она не бывает. Без этой
  // проверки два соседних дня с заметками склеились бы в «отрезок» из двух
  // undefined.
  if (!current?.shiftTypeId) return null;

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
