import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHIFT_TYPES,
  isBuiltinShiftType,
  sanitizeShiftType,
  shiftStartGroups,
  shiftTypeUsage,
  withShiftStart,
} from '../shifts.ts';
import { shiftDurationMinutes } from '../engine.ts';
import { DEFAULT_PAYMENT_RULES } from '../payday.ts';
import type { ScheduleTrack, ShiftType } from '../types.ts';

const evening: ShiftType = {
  id: 'evening',
  builtinId: null,
  name: 'Вечерняя смена',
  badge: 'Веч',
  kind: 'work',
  colorToken: 'shift.extra',
  time: { start: '16:00', end: '00:00', unpaidBreakMinutes: 30 },
  rateMultiplier: 1.2,
};

test('все встроенные смены помечены как встроенные и не удаляются', () => {
  assert.ok(DEFAULT_SHIFT_TYPES.every(isBuiltinShiftType));
  assert.ok(DEFAULT_SHIFT_TYPES.every((type) => type.builtinId === type.id));
});

test('перерыв вычитается из смены, в том числе перешедшей через полночь', () => {
  // 16:00 → 00:00 это восемь часов, минус полчаса перерыва.
  assert.equal(shiftDurationMinutes(evening), 7 * 60 + 30);
});

test('надбавка на длительность смены не влияет: она про деньги, а не про часы', () => {
  const plain = shiftDurationMinutes({ ...evening, rateMultiplier: 1 });
  assert.equal(shiftDurationMinutes(evening), plain);
});

test('смена из хранилища проходит как есть', () => {
  assert.deepEqual(sanitizeShiftType(evening), evening);
});

test('рабочая смена с негодным временем отбрасывается целиком', () => {
  // Ноль часов навсегда хуже, чем отсутствие смены: месяц молча обнулился бы.
  assert.equal(sanitizeShiftType({ ...evening, time: { start: '25:00', end: '02:00' } }), null);
  assert.equal(sanitizeShiftType({ ...evening, time: undefined }), null);
});

test('мусор вместо смены не роняет справочник', () => {
  assert.equal(sanitizeShiftType(null), null);
  assert.equal(sanitizeShiftType({ id: 'x' }), null);
  assert.equal(sanitizeShiftType({ ...evening, name: '   ' }), null);
});

test('пустая буква-маркер берётся из названия: смысл дня не остаётся на одном цвете', () => {
  const fixed = sanitizeShiftType({ ...evening, badge: '' });
  assert.equal(fixed?.badge, 'В');
});

test('перерыв и надбавка вне разумных границ чинятся, а не отбрасываются', () => {
  const fixed = sanitizeShiftType({
    ...evening,
    rateMultiplier: 120,
    time: { ...evening.time!, unpaidBreakMinutes: -5 },
  });

  assert.equal(fixed?.rateMultiplier, 1);
  assert.equal(fixed?.time?.unpaidBreakMinutes, 0);
});

test('нерабочая смена времени не получает', () => {
  const off = sanitizeShiftType({ ...evening, kind: 'rest' });
  assert.equal(off?.time, undefined);
});

const track = (id: string, name: string, extra: Partial<ScheduleTrack> = {}): ScheduleTrack => ({
  id,
  name,
  own: true,
  schedules: [
    {
      presetId: 'custom',
      pattern: { kind: 'cycle', slots: ['day12', 'off'] },
      anchorDate: '2026-09-01',
      startsOn: '2026-09-01',
    },
  ],
  overrides: {},
  payrollRules: DEFAULT_PAYMENT_RULES,
  ...extra,
});

test('смену, на которой стоит чей-то график, видно по имени дорожки', () => {
  const tracks = [
    track('main', 'Основная'),
    track('anya', 'Аня', {
      schedules: [
        {
          presetId: 'custom',
          pattern: {
            kind: 'weekly',
            weeks: [{ 1: 'evening', 2: 'off', 3: 'off', 4: 'off', 5: 'off', 6: 'off', 7: 'off' }],
          },
          anchorDate: '2026-09-01',
          startsOn: '2026-09-01',
        },
      ],
    }),
  ];

  assert.deepEqual(shiftTypeUsage(tracks, 'evening'), { schedules: ['Аня'], overrides: 0 });
  assert.deepEqual(shiftTypeUsage(tracks, 'day12'), { schedules: ['Основная'], overrides: 0 });
});

test('ручные правки на смену считаются, но удалять её не мешают', () => {
  const tracks = [
    track('main', 'Основная', {
      overrides: {
        '2026-09-10': { date: '2026-09-10', shiftTypeId: 'evening' },
        '2026-09-11': { date: '2026-09-11', shiftTypeId: 'evening' },
        '2026-09-12': { date: '2026-09-12', note: 'за Сергея' },
      },
    }),
  ];

  assert.deepEqual(shiftTypeUsage(tracks, 'evening'), { schedules: [], overrides: 2 });
});

test('дорожка без графика ничем не держит смену', () => {
  assert.deepEqual(shiftTypeUsage([track('main', 'Основная', { schedules: [] })], 'day12'), {
    schedules: [],
    overrides: 0,
  });
});

test('смену держит и прошлый график из истории, а не только текущий', () => {
  const tracks = [
    track('main', 'Основная', {
      schedules: [
        {
          presetId: 'custom',
          pattern: {
            kind: 'weekly',
            weeks: [{ 1: 'evening', 2: 'off', 3: 'off', 4: 'off', 5: 'off', 6: 'off', 7: 'off' }],
          },
          anchorDate: '2026-01-05',
          startsOn: '2026-01-05',
        },
        {
          presetId: 'custom',
          pattern: { kind: 'cycle', slots: ['day12', 'off'] },
          anchorDate: '2026-10-01',
          startsOn: '2026-10-01',
        },
      ],
    }),
  ];

  // Удалить «вечернюю» нельзя: на ней стоят уже прожитые месяцы.
  assert.deepEqual(shiftTypeUsage(tracks, 'evening'), { schedules: ['Основная'], overrides: 0 });
});

/**
 * Своё начало смены на этой работе.
 *
 * Поле показательное, и проверяется ровно это: во что превращается окно смены
 * и что при этом не меняется — длительность, а вместе с ней часы и деньги.
 */
test('сдвиг начала двигает и конец: длительность смены та же', () => {
  const later = withShiftStart(evening, '17:00');

  assert.deepEqual(later.time, { start: '17:00', end: '01:00', unpaidBreakMinutes: 30 });
  assert.equal(shiftDurationMinutes(later), shiftDurationMinutes(evening));
});

test('сдвинутая смена уезжает через полночь, а не обрезается', () => {
  const day = DEFAULT_SHIFT_TYPES.find((type) => type.builtinId === 'day12');
  assert.ok(day);

  // 08:00 → 20:00, сдвинутая на 20:00, кончается в восемь утра следующего дня.
  const night = withShiftStart(day, '20:00');
  assert.equal(night.time?.end, '08:00');
  assert.equal(shiftDurationMinutes(night), shiftDurationMinutes(day));
});

test('выходному и смене без своего времени двигать нечего', () => {
  const off = DEFAULT_SHIFT_TYPES.find((type) => type.builtinId === 'off');
  assert.ok(off);

  assert.equal(withShiftStart(off, '09:00'), off);
  assert.equal(withShiftStart(evening, undefined), evening);
  assert.equal(withShiftStart(evening, evening.time!.start), evening);
});

test('смены с одинаковым началом идут одной группой, а группы — по времени суток', () => {
  const groups = shiftStartGroups(DEFAULT_SHIFT_TYPES);
  const starts = groups.map((group) => group.start);

  assert.deepEqual([...starts].sort(), starts);
  // Рабочий день и сокращённый начинаются в одно время — время у них общее.
  const morning = groups.find((group) => group.shiftTypeIds.includes('work8'));
  assert.ok(morning);
  assert.ok(morning.shiftTypeIds.includes('work7'));
  // Выходных в списке нет вовсе: у них нет начала.
  assert.ok(!groups.some((group) => group.shiftTypeIds.includes('off')));
});
