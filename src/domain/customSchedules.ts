import type { Weekday } from './date.ts';
import { DAY_FORMS, plural } from './format.ts';
import type { CustomSchedule, SchedulePattern, ShiftType } from './types.ts';

/**
 * Графики, собранные пользователем.
 *
 * Отдельный модуль, а не часть presets.ts: там справочник из кода, который
 * проверяется на выпуске, а здесь — данные из хранилища, которые проверять
 * приходится при каждом подъёме состояния. Ошибка в собранном руками графике
 * стоит дороже: пустой цикл роняет resolveDay на каждой дате, а с ним
 * календарь, сводку и планировщик будильников.
 */

/** Короче двух дней цикл не имеет смысла: это просто одна смена каждый день. */
export const MIN_CYCLE_LENGTH = 2;

/**
 * Длиннее месяца циклов не бывает: даже «сутки через трое» укладывается в
 * четыре дня, а рисовать тридцать две клетки уже нечем.
 */
export const MAX_CYCLE_LENGTH = 31;

/** Больше четырёх чередующихся недель не встречается даже у вахты. */
export const MAX_WEEKS = 4;

export const MAX_SCHEDULE_NAME_LENGTH = 40;

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Цикл заданной длины, целиком заполненный одной сменой. */
export function blankCycle(length: number, shiftTypeId: string): SchedulePattern {
  return { kind: 'cycle', slots: Array.from({ length }, () => shiftTypeId) };
}

/** Недельный шаблон: все семь дней заполнены одной сменой. */
export function blankWeek(shiftTypeId: string): Record<Weekday, string> {
  return Object.fromEntries(WEEKDAYS.map((day) => [day, shiftTypeId])) as Record<Weekday, string>;
}

/**
 * Меняет длину цикла, сохраняя нарисованное.
 *
 * Удлинение дописывает выходные, укорочение отрезает хвост: перерисовывать
 * заново то, что человек уже разложил, из-за одного лишнего дня незачем.
 */
export function resizeCycle(slots: string[], length: number, fillId: string): string[] {
  if (length <= slots.length) return slots.slice(0, length);
  return [...slots, ...Array.from({ length: length - slots.length }, () => fillId)];
}

/**
 * График из хранилища, приведённый к рабочему виду, или null.
 *
 * Смены проверяются по справочнику: собранный на своей смене график переживает
 * её удаление только до перезапуска, а дальше раскладывать его нечем. Такой
 * график выбрасывается целиком — сохранённые дорожки при этом не страдают,
 * они держат собственную копию раскладки.
 */
export function sanitizeCustomSchedule(
  raw: unknown,
  shiftTypes: ShiftType[],
): CustomSchedule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<CustomSchedule>;

  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.name !== 'string' || value.name.trim().length === 0) return null;

  const known = new Set(shiftTypes.map((type) => type.id));
  const pattern = sanitizePattern(value.pattern, known);
  if (!pattern) return null;

  return { id: value.id, name: value.name.trim().slice(0, MAX_SCHEDULE_NAME_LENGTH), pattern };
}

function sanitizePattern(
  pattern: SchedulePattern | undefined,
  known: Set<string>,
): SchedulePattern | null {
  if (!pattern) return null;

  if (pattern.kind === 'cycle') {
    const slots = Array.isArray(pattern.slots) ? pattern.slots : [];
    if (slots.length < MIN_CYCLE_LENGTH || slots.length > MAX_CYCLE_LENGTH) return null;
    if (!slots.every((id) => known.has(id))) return null;
    return { kind: 'cycle', slots: [...slots] };
  }

  if (pattern.kind === 'weekly') {
    const weeks = Array.isArray(pattern.weeks) ? pattern.weeks : [];
    if (weeks.length === 0 || weeks.length > MAX_WEEKS) return null;
    // Неполная неделя — это дырка в календаре: resolveDay вернёт undefined и
    // упадёт на первом же дне, который в неё попал.
    const complete = weeks.every((week) => WEEKDAYS.every((day) => known.has(week[day])));
    if (!complete) return null;
    return { kind: 'weekly', weeks: weeks.map((week) => ({ ...week })) };
  }

  return null;
}

/**
 * Как график выглядит одной строкой: «Цикл 4 дня — Д, Д, В, В».
 *
 * Нужно списку выбора: у встроенных графиков есть написанное человеком
 * пояснение, а у собранного руками единственное описание — то, что в нём
 * нарисовано.
 */
export function describePattern(pattern: SchedulePattern, shiftTypes: ShiftType[]): string {
  const badge = (id: string): string => shiftTypes.find((type) => type.id === id)?.badge ?? '?';

  if (pattern.kind === 'cycle') {
    const length = pattern.slots.length;
    return `Цикл ${length} ${plural(length, DAY_FORMS)} — ${pattern.slots.map(badge).join(', ')}`;
  }

  const weeks = pattern.weeks.length;
  const first = WEEKDAYS.map((day) => badge(pattern.weeks[0][day])).join(', ');
  return weeks === 1
    ? `По дням недели — ${first}`
    : `${weeks} чередующиеся недели — ${first} и далее`;
}
