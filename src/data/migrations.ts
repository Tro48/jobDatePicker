import type { Alarm, AlarmRepeat } from '@/domain/alarm.ts';

/**
 * Переносы данных между версиями схемы хранилища.
 *
 * Лежат отдельно от store и не тянут ни react-native, ни zustand: миграцию
 * надо проверять тестами, а не выяснять на телефоне после обновления.
 */

/** Как режим «по сменам» выглядел в версии 4: своё время у каждого типа смены. */
interface LegacyScheduleRepeat {
  kind: 'schedule';
  times: Record<string, string>;
}

/**
 * Будильник с версии 4 на 5.
 *
 * Время стало одним на будильник, поэтому из набора времён берётся самое
 * раннее, а типы смен превращаются в список дней. Разделить такой будильник на
 * два миграция не пытается: угадывать за пользователя хуже, чем оставить одно
 * время и дать поправить руками.
 */
export function migrateAlarm(alarm: Alarm): Alarm {
  const repeat = alarm.repeat as AlarmRepeat | LegacyScheduleRepeat;
  if (repeat.kind !== 'schedule' || !('times' in repeat)) return alarm;

  const entries = Object.entries(repeat.times ?? {});
  const earliest = entries.map(([, time]) => time).sort()[0];

  return {
    ...alarm,
    time: earliest ?? alarm.time,
    repeat: { kind: 'schedule', shiftTypeIds: entries.map(([shiftTypeId]) => shiftTypeId) },
  };
}
