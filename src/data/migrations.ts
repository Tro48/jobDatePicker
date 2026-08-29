import type { Alarm, AlarmRepeat } from '@/domain/alarm.ts';

/**
 * Переносы данных между версиями схемы хранилища.
 *
 * Лежат отдельно от store и не тянут ни react-native, ни zustand: миграцию
 * надо проверять тестами, а не выяснять на телефоне после обновления.
 */

/** В версии 5 режим «по графику» хранил выбранные пользователем типы смен. */
interface LegacyScheduleRepeat {
  kind: 'schedule';
  shiftTypeIds: string[];
}

/**
 * Будильник с версии 5 на 6.
 *
 * Смены больше не выбираются руками — будильник звонит в каждый рабочий день
 * графика, а времена берутся из самого графика. Выбранный когда-то список смен
 * переносить некуда, поэтому он просто отбрасывается: время будильника при
 * этом сохраняется, и звонить он продолжит.
 */
export function migrateAlarm(alarm: Alarm): Alarm {
  const repeat = alarm.repeat as AlarmRepeat | LegacyScheduleRepeat;
  if (repeat.kind !== 'schedule' || !('shiftTypeIds' in repeat)) return alarm;

  return { ...alarm, repeat: { kind: 'schedule', times: {} } };
}
