import type { SchedulePreset } from './types.ts';

/**
 * Готовые графики.
 *
 * Чтобы добавить новый график, дописывается одна запись в этот массив — код
 * движка, экраны и сводка не меняются. Ограничения: все id в slots и weeks
 * должны существовать в справочнике смен (проверяется validatePreset).
 */
export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: '2-2-day',
    name: '2/2 дневные',
    description: 'Две дневные смены по 12 часов, два выходных',
    pattern: { kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] },
  },
  {
    id: '2-2-night',
    name: '2/2 ночные',
    description: 'Две ночные смены по 12 часов, два выходных',
    pattern: { kind: 'cycle', slots: ['night12', 'night12', 'off', 'off'] },
  },
  {
    id: '2-2-mixed',
    name: '2/2 день-ночь',
    description: 'Две дневные, два выходных, две ночные, два выходных — цикл 8 дней',
    pattern: {
      kind: 'cycle',
      slots: ['day12', 'day12', 'off', 'off', 'night12', 'night12', 'off', 'off'],
    },
  },
  {
    id: '3-3-day',
    name: '3/3 дневные',
    description: 'Три дневные смены по 12 часов, три выходных',
    pattern: { kind: 'cycle', slots: ['day12', 'day12', 'day12', 'off', 'off', 'off'] },
  },
  {
    id: '3-3-mixed',
    name: '3/3 день-ночь',
    description: 'Три дневные, три выходных, три ночные, три выходных — цикл 12 дней',
    pattern: {
      kind: 'cycle',
      slots: [
        'day12', 'day12', 'day12', 'off', 'off', 'off',
        'night12', 'night12', 'night12', 'off', 'off', 'off',
      ],
    },
  },
  {
    id: 'dnso',
    name: 'День / ночь / отсыпной / выходной',
    description: 'Классический четырёхдневный цикл сменного графика',
    pattern: { kind: 'cycle', slots: ['day12', 'night12', 'sleep', 'off'] },
  },
  {
    id: '5-2-short-friday',
    name: '5/2 по 8 часов, пятница короче',
    description: 'Пятидневка: понедельник — четверг по 8 часов, пятница 7, выходные суббота и воскресенье',
    pattern: {
      kind: 'weekly',
      weeks: [{ 1: 'work8', 2: 'work8', 3: 'work8', 4: 'work8', 5: 'work7', 6: 'off', 7: 'off' }],
    },
  },
  {
    id: '5-2',
    name: '5/2 по 8 часов',
    description: 'Пятидневка без сокращённой пятницы',
    pattern: {
      kind: 'weekly',
      weeks: [{ 1: 'work8', 2: 'work8', 3: 'work8', 4: 'work8', 5: 'work8', 6: 'off', 7: 'off' }],
    },
  },
  {
    id: '6-1',
    name: '6/1',
    description: 'Шесть рабочих дней по 8 часов, воскресенье выходной',
    pattern: {
      kind: 'weekly',
      weeks: [{ 1: 'work8', 2: 'work8', 3: 'work8', 4: 'work8', 5: 'work8', 6: 'work8', 7: 'off' }],
    },
  },
  {
    id: '1-3',
    name: 'Сутки через трое',
    description: 'Суточная смена, затем трое суток отдыха',
    pattern: { kind: 'cycle', slots: ['day24', 'sleep', 'off', 'off'] },
  },
];
