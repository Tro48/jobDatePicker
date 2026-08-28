import type { ShiftType } from './types.ts';

/**
 * Базовый справочник смен. Пользователь может править время, перерыв и
 * надбавку, но набор id стабилен — на них ссылаются пресеты графиков.
 */
export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  {
    id: 'day12',
    name: 'Дневная смена',
    badge: 'Д',
    kind: 'work',
    colorToken: 'shift.day',
    time: { start: '08:00', end: '20:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'night12',
    name: 'Ночная смена',
    badge: 'Н',
    kind: 'work',
    colorToken: 'shift.night',
    time: { start: '20:00', end: '08:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'work8',
    name: 'Рабочий день',
    badge: 'Р',
    kind: 'work',
    colorToken: 'shift.regular',
    time: { start: '09:00', end: '18:00', unpaidBreakMinutes: 60 },
    rateMultiplier: 1,
  },
  {
    id: 'work7',
    name: 'Сокращённый день',
    badge: 'С',
    kind: 'work',
    colorToken: 'shift.short',
    time: { start: '09:00', end: '17:00', unpaidBreakMinutes: 60 },
    rateMultiplier: 1,
  },
  {
    id: 'day24',
    name: 'Суточная смена',
    badge: 'С24',
    kind: 'work',
    colorToken: 'shift.day24',
    // start === end трактуется движком как ровно 24 часа, а не как нулевая смена.
    time: { start: '08:00', end: '08:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'extra',
    name: 'Подработка',
    badge: 'П',
    kind: 'work',
    colorToken: 'shift.extra',
    time: { start: '09:00', end: '18:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  { id: 'off', name: 'Выходной', badge: 'В', kind: 'rest', colorToken: 'shift.off', rateMultiplier: 0 },
  { id: 'sleep', name: 'Отсыпной', badge: 'О', kind: 'rest', colorToken: 'shift.sleep', rateMultiplier: 0 },
  { id: 'vacation', name: 'Отпуск', badge: 'От', kind: 'rest', colorToken: 'shift.vacation', rateMultiplier: 0 },
  { id: 'sick', name: 'Больничный', badge: 'Б', kind: 'rest', colorToken: 'shift.sick', rateMultiplier: 0 },
];

export function indexShiftTypes(types: ShiftType[]): Map<string, ShiftType> {
  return new Map(types.map((type) => [type.id, type]));
}
