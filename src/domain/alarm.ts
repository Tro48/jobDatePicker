import { addDays, localDateTimeToMillis, toIsoDateLocal, weekday } from './date.ts';
import type { IsoDate, Weekday } from './date.ts';
import { resolveDay } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import { WEEKDAYS_SHORT, formatDayLong, formatDayShort } from './format.ts';
import type { ShiftType } from './types.ts';

/**
 * Как повторяется будильник.
 *
 * «Каждый день» отдельным вариантом не заведено намеренно: это те же дни
 * недели, только все семь. Иначе один и тот же смысл пришлось бы поддерживать
 * в двух ветках планирования.
 */
export type AlarmRepeat =
  /** Один раз в конкретную дату. Дата хранится явно, чтобы было видно, что он уже отзвонил. */
  | { kind: 'once'; date: IsoDate }
  /** По дням недели. Пустой список — не звонит никогда, экран об этом предупреждает. */
  | { kind: 'weekly'; days: Weekday[] }
  /**
   * По сменам: звонит в дни выбранных типов смен и только в них. Время у
   * будильника одно, как и в остальных режимах: «дневная в 06:30, ночная в
   * 18:30» — это два будильника, каждый со своими сменами.
   */
  | { kind: 'schedule'; shiftTypeIds: string[] };

export interface Alarm {
  id: string;
  /** Название вроде «На смену». Пустое допустимо — тогда в списке просто время. */
  label: string;
  /** «ЧЧ:ММ». Одно на будильник во всех режимах повтора. */
  time: string;
  /** Выключенный будильник остаётся в списке со всеми настройками — это пауза. */
  enabled: boolean;
  repeat: AlarmRepeat;
  /** URI системной мелодии. null — сигнал будильника по умолчанию. */
  soundUri: string | null;
  vibrate: boolean;
  snoozeMinutes: number;
}

export const DEFAULT_SNOOZE_MINUTES = 10;
export const MIN_SNOOZE_MINUTES = 1;
export const MAX_SNOOZE_MINUTES = 60;

/**
 * Сколько срабатываний вперёд ставится для одного будильника.
 *
 * Больше одного потому, что перепланировать умеет только JS: пока приложение
 * не открыли, повторяющийся будильник живёт на этом запасе. Семь штук — это
 * неделя для ежедневного и две недели для графика 2/2.
 */
const OCCURRENCES_PER_ALARM = 7;

/** Общий потолок на все будильники разом: AlarmManager не резиновый. */
const MAX_SCHEDULED_ALARMS = 50;

/** Насколько далеко заглядывать вперёд в поисках подходящего дня. */
const PLANNING_HORIZON_DAYS = 120;

/** Один звонок будильника в конкретный день — то, что уходит в AlarmManager. */
export interface AlarmOccurrence {
  /** Стабильный ключ: id будильника плюс дата. Повторный расчёт даёт тот же. */
  id: string;
  alarmId: string;
  date: IsoDate;
  time: string;
  /** Момент срабатывания в миллисекундах эпохи. */
  triggerAtMillis: number;
  /** Заголовок на экране будильника. */
  title: string;
  /** Подпись под заголовком: день недели или смена, ради которой встаём. */
  subtitle: string;
  soundUri: string | null;
  vibrate: boolean;
  snoozeMinutes: number;
}

/** Заготовка нового будильника: разовый, на ближайшие семь утра. */
export function newAlarmDraft(now: Date): Omit<Alarm, 'id'> {
  const time = '07:00';
  return {
    label: '',
    time,
    enabled: true,
    repeat: { kind: 'once', date: nextDateForTime(time, now) },
    soundUri: null,
    vibrate: true,
    snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
  };
}

/** Ближайший день, когда это время ещё впереди: сегодня или завтра. */
export function nextDateForTime(time: string, now: Date): IsoDate {
  const today = toIsoDateLocal(now);
  return localDateTimeToMillis(today, time) > now.getTime() ? today : addDays(today, 1);
}

/**
 * Ближайшие срабатывания одного будильника.
 *
 * Чистая функция: получает график и текущий момент, отдаёт готовые метки
 * времени. Нативный модуль про смены и повторы не знает ничего.
 */
export function nextOccurrences(
  alarm: Alarm,
  context: ScheduleContext | null,
  now: Date,
  count = OCCURRENCES_PER_ALARM,
): AlarmOccurrence[] {
  if (!alarm.enabled || count <= 0) return [];

  const nowMillis = now.getTime();
  const today = toIsoDateLocal(now);
  const found: AlarmOccurrence[] = [];

  const push = (date: IsoDate, time: string, subtitle: string): void => {
    const triggerAtMillis = localDateTimeToMillis(date, time);
    // Прошедшее время не ставим никогда: AlarmManager отработал бы его
    // мгновенно и разбудил посреди дня.
    if (triggerAtMillis <= nowMillis) return;
    found.push({
      id: `${alarm.id}:${date}`,
      alarmId: alarm.id,
      date,
      time,
      triggerAtMillis,
      title: alarm.label.trim() || 'Будильник',
      subtitle,
      soundUri: alarm.soundUri,
      vibrate: alarm.vibrate,
      snoozeMinutes: alarm.snoozeMinutes,
    });
  };

  if (alarm.repeat.kind === 'once') {
    push(alarm.repeat.date, alarm.time, formatDayLong(alarm.repeat.date));
    return found;
  }

  if (alarm.repeat.kind === 'weekly') {
    const days = alarm.repeat.days;
    if (days.length === 0) return [];
    for (let offset = 0; offset < PLANNING_HORIZON_DAYS && found.length < count; offset += 1) {
      const date = addDays(today, offset);
      if (days.includes(weekday(date))) push(date, alarm.time, formatDayLong(date));
    }
    return found;
  }

  // По сменам: без выбранного графика будить не по чему.
  if (!context) return [];
  const { shiftTypeIds } = alarm.repeat;
  for (let offset = 0; offset < PLANNING_HORIZON_DAYS && found.length < count; offset += 1) {
    const date = addDays(today, offset);
    const { shiftType } = resolveDay(context, date);
    if (!shiftTypeIds.includes(shiftType.id)) continue;
    const start = shiftType.time ? `, начало в ${shiftType.time.start}` : '';
    push(date, alarm.time, `${shiftType.name}${start}`);
  }
  return found;
}

/**
 * Всё, что должно зазвонить, в порядке времени.
 *
 * Набор всегда считается целиком и целиком же заменяет предыдущий: расписание
 * — производная от будильников и графика, и пересчитать его дешевле, чем
 * поддерживать в согласованном состоянии.
 */
export function planAlarms(
  alarms: Alarm[],
  context: ScheduleContext | null,
  now: Date,
  limit = MAX_SCHEDULED_ALARMS,
): AlarmOccurrence[] {
  return alarms
    .flatMap((alarm) => nextOccurrences(alarm, context, now))
    .sort((a, b) => a.triggerAtMillis - b.triggerAtMillis)
    .slice(0, limit);
}

/**
 * Момент разового будильника уже прошёл.
 *
 * Нужно в двух местах: форма правки предупреждает об этом сразу, а список
 * будильников гасит такие записи при ближайшем пересчёте.
 */
export function isPastOnce(alarm: Pick<Alarm, 'time' | 'repeat'>, now: Date): boolean {
  if (alarm.repeat.kind !== 'once') return false;
  return localDateTimeToMillis(alarm.repeat.date, alarm.time) <= now.getTime();
}

/**
 * Разовые будильники, чей момент уже прошёл.
 *
 * Такой будильник отзвонил и должен погаснуть сам, как в системных часах.
 * Отследить это может только JS, поэтому проверка идёт при каждом открытии.
 */
export function expiredOnceAlarmIds(alarms: Alarm[], now: Date): string[] {
  return alarms.filter((alarm) => alarm.enabled && isPastOnce(alarm, now)).map((alarm) => alarm.id);
}

/** Может ли будильник вообще зазвонить: без дней и без смен — не может. */
export function hasAnyTrigger(alarm: Alarm): boolean {
  if (alarm.repeat.kind === 'weekly') return alarm.repeat.days.length > 0;
  if (alarm.repeat.kind === 'schedule') return alarm.repeat.shiftTypeIds.length > 0;
  return true;
}

const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

/** Дни недели по порядку, без повторов: [3, 1, 1] → [1, 3]. */
export function sortWeekdays(days: Weekday[]): Weekday[] {
  return WEEKDAY_ORDER.filter((day) => days.includes(day));
}

/** Повтор человеческим текстом: «Каждый день», «Пн, Ср, Пт», «По сменам: ночная». */
export function describeRepeat(alarm: Alarm, shiftTypes: Map<string, ShiftType>): string {
  if (alarm.repeat.kind === 'once') {
    return `Один раз, ${formatDayShort(alarm.repeat.date)}`;
  }

  if (alarm.repeat.kind === 'weekly') {
    const days = sortWeekdays(alarm.repeat.days);
    if (days.length === 0) return 'Ни один день не выбран';
    if (days.length === 7) return 'Каждый день';
    if (days.length === 5 && days.every((day) => day <= 5)) return 'По будням';
    if (days.length === 2 && days.every((day) => day >= 6)) return 'По выходным';
    return days.map((day) => capitalize(WEEKDAYS_SHORT[day - 1])).join(', ');
  }

  const names = alarm.repeat.shiftTypeIds
    .map((id) => shiftTypes.get(id)?.name.toLowerCase())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? `По сменам: ${names.join(', ')}` : 'По сменам: смены не выбраны';
}

/** Отсрочка в разумных пределах: меньше минуты бессмысленно, больше часа — не отсрочка. */
export function clampSnoozeMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_SNOOZE_MINUTES;
  return Math.max(MIN_SNOOZE_MINUTES, Math.min(Math.round(minutes), MAX_SNOOZE_MINUTES));
}
