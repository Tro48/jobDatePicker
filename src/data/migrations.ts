import { scheduleUsesKnownShifts } from '../domain/engine.ts';
import { indexShiftTypes } from '../domain/shifts.ts';
import type { Alarm, AlarmRepeat } from '../domain/alarm.ts';
import type { ActiveSchedule, ShiftType } from '../domain/types.ts';

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
