import { addDays, formatMinutesAsTime, localDateTimeToMillis, toIsoDateLocal } from './date.ts';
import type { IsoDate } from './date.ts';
import { resolveDay } from './engine.ts';
import type { ScheduleContext } from './engine.ts';

/** Настройка будильника для одного типа смены. */
export interface ShiftAlarmSetting {
  enabled: boolean;
  /** За сколько минут до начала смены звонить. */
  leadMinutes: number;
}

export interface AlarmSettings {
  /** Общий выключатель: снять разом удобнее, чем по одной галочке на тип смены. */
  enabled: boolean;
  /** Настройки по id типа смены. Нет записи — будильника нет. */
  byShiftType: Record<string, ShiftAlarmSetting>;
  /** На сколько откладывает кнопка «Отложить». */
  snoozeMinutes: number;
}

/**
 * Больше семи вперёд не ставим: Android ограничивает число точных будильников
 * на приложение, а график всё равно поменяется раньше, чем они кончатся.
 */
export const MAX_SCHEDULED_ALARMS = 7;

/** Насколько далеко заглядывать вперёд в поисках рабочих смен. */
export const PLANNING_HORIZON_DAYS = 90;

export const DEFAULT_LEAD_MINUTES = 60;
export const DEFAULT_SNOOZE_MINUTES = 10;

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  enabled: true,
  byShiftType: {},
  snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
};

/** Будильник, готовый к передаче в нативный модуль. */
export interface PlannedAlarm {
  /** Стабильный ключ: дата плюс тип смены. */
  id: string;
  date: IsoDate;
  shiftTypeId: string;
  /** Момент срабатывания в миллисекундах эпохи. */
  triggerAtMillis: number;
  /** Начало смены, «08:00» — для подписи на экране будильника. */
  shiftStartTime: string;
  /**
   * Когда звонит. Отдельно от даты смены: отступ в несколько часов уводит
   * будильник на предыдущий день, и показывать его надо там.
   */
  wakeDate: IsoDate;
  wakeTime: string;
  title: string;
  subtitle: string;
}

/**
 * Ближайшие будильники по графику.
 *
 * Функция чистая: получает контекст графика и текущий момент, возвращает
 * готовые метки времени. Нативный модуль ничего не знает ни про смены, ни про
 * правки — он только ставит то, что ему дали.
 */
export function planAlarms(
  context: ScheduleContext,
  settings: AlarmSettings,
  now: Date,
  limit = MAX_SCHEDULED_ALARMS,
): PlannedAlarm[] {
  if (!settings.enabled) return [];

  const nowMillis = now.getTime();
  const from = toIsoDateLocal(now);
  const planned: PlannedAlarm[] = [];

  for (let offset = 0; offset < PLANNING_HORIZON_DAYS && planned.length < limit; offset += 1) {
    const date = addDays(from, offset);
    const { shiftType } = resolveDay(context, date);

    // Отпуск, выходной и отсыпной времени начала не имеют — будить нечем и незачем.
    if (shiftType.kind !== 'work' || !shiftType.time) continue;

    const setting = settings.byShiftType[shiftType.id];
    if (!setting?.enabled) continue;

    const triggerAtMillis =
      localDateTimeToMillis(date, shiftType.time.start) - setting.leadMinutes * 60_000;

    // Сегодняшний будильник мог уже отзвонить — ставить его в прошлое нельзя:
    // AlarmManager сработает мгновенно и разбудит посреди смены.
    if (triggerAtMillis <= nowMillis) continue;

    const trigger = new Date(triggerAtMillis);

    planned.push({
      id: `${date}:${shiftType.id}`,
      date,
      shiftTypeId: shiftType.id,
      triggerAtMillis,
      shiftStartTime: shiftType.time.start,
      wakeDate: toIsoDateLocal(trigger),
      wakeTime: formatMinutesAsTime(trigger.getHours() * 60 + trigger.getMinutes()),
      title: shiftType.name,
      subtitle: `Начало смены в ${shiftType.time.start}`,
    });
  }

  return planned;
}

/**
 * Настройка типа смены с подстановкой умолчаний. Нужна экрану: у типа смены
 * записи может ещё не быть, а показать поле отступа надо.
 */
export function settingFor(settings: AlarmSettings, shiftTypeId: string): ShiftAlarmSetting {
  return settings.byShiftType[shiftTypeId] ?? { enabled: false, leadMinutes: DEFAULT_LEAD_MINUTES };
}
