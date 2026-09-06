import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CYCLE_LENGTH,
  blankCycle,
  blankWeek,
  describePattern,
  resizeCycle,
  sanitizeCustomSchedule,
} from '../customSchedules.ts';
import { resolvePlannedShiftId } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES } from '../shifts.ts';
import { addDays } from '../date.ts';
import type { ActiveSchedule, CustomSchedule } from '../types.ts';

const five: CustomSchedule = {
  id: 'c1',
  name: 'Пять через два',
  pattern: {
    kind: 'cycle',
    slots: ['day12', 'day12', 'day12', 'day12', 'day12', 'off', 'off'],
  },
};

function scheduleOf(pattern: CustomSchedule['pattern'], anchorDate = '2026-09-01'): ActiveSchedule {
  return { presetId: 'c1', pattern, anchorDate };
}

test('цикл произвольной длины разворачивается и вперёд, и назад от первой смены', () => {
  // Одиннадцать дней — длина, которой нет ни в одном пресете.
  const slots = Array.from({ length: 11 }, (_, index) => (index < 7 ? 'day12' : 'off'));
  const schedule = scheduleOf({ kind: 'cycle', slots });

  assert.equal(resolvePlannedShiftId(schedule, '2026-09-01'), 'day12');
  assert.equal(resolvePlannedShiftId(schedule, '2026-09-08'), 'off');
  // Тот же день цикла ровно через одиннадцать дней и ровно за одиннадцать до.
  assert.equal(resolvePlannedShiftId(schedule, '2026-09-12'), 'day12');
  assert.equal(resolvePlannedShiftId(schedule, '2026-08-21'), 'day12');
});

test('цикл переживает границу года', () => {
  const schedule = scheduleOf({ kind: 'cycle', slots: ['day12', 'day12', 'off'] }, '2026-12-30');

  assert.equal(resolvePlannedShiftId(schedule, '2026-12-31'), 'day12');
  assert.equal(resolvePlannedShiftId(schedule, '2027-01-01'), 'off');
  assert.equal(resolvePlannedShiftId(schedule, '2027-01-02'), 'day12');
});

test('цикл не сбивается в ночь перевода часов', () => {
  // Даты в домене — гражданские сутки, а не миллисекунды: 2/2 обязан остаться
  // 2/2 в ночь, когда суток не двадцать четыре часа. В Европе часы переводят
  // 28 марта 2027 года.
  const schedule = scheduleOf({ kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] });
  const dst = '2027-03-28';

  // Четыре дня подряд поперёк перевода дают все четыре слота ровно по разу.
  const window = [-1, 0, 1, 2].map((offset) =>
    resolvePlannedShiftId(schedule, addDays(dst, offset)),
  );
  assert.equal(window.filter((id) => id === 'day12').length, 2);
  assert.equal(window.filter((id) => id === 'off').length, 2);

  // И через полный оборот цикла день возвращается к тому же слоту.
  for (let offset = -2; offset <= 2; offset += 1) {
    assert.equal(
      resolvePlannedShiftId(schedule, addDays(dst, offset)),
      resolvePlannedShiftId(schedule, addDays(dst, offset + 4)),
    );
  }
});

test('пустой цикл до движка не доезжает: он падал бы на каждой дате', () => {
  assert.equal(
    sanitizeCustomSchedule({ ...five, pattern: { kind: 'cycle', slots: [] } }, DEFAULT_SHIFT_TYPES),
    null,
  );
});

test('цикл длиннее месяца не сохраняется', () => {
  const tooLong = blankCycle(MAX_CYCLE_LENGTH + 1, 'off');
  assert.equal(sanitizeCustomSchedule({ ...five, pattern: tooLong }, DEFAULT_SHIFT_TYPES), null);
});

test('график на исчезнувшей смене выбрасывается целиком', () => {
  const broken = { ...five, pattern: { kind: 'cycle', slots: ['day12', 'ghost'] } };
  assert.equal(sanitizeCustomSchedule(broken, DEFAULT_SHIFT_TYPES), null);
});

test('неполная неделя не сохраняется: дырка в ней роняет календарь', () => {
  const holes = {
    ...five,
    pattern: { kind: 'weekly', weeks: [{ 1: 'work8', 2: 'work8' }] },
  };
  assert.equal(sanitizeCustomSchedule(holes, DEFAULT_SHIFT_TYPES), null);
});

test('целый недельный шаблон проходит', () => {
  const weekly = { ...five, pattern: { kind: 'weekly', weeks: [blankWeek('work8')] } };
  const clean = sanitizeCustomSchedule(weekly, DEFAULT_SHIFT_TYPES);

  assert.equal(clean?.pattern.kind, 'weekly');
});

test('график без названия не сохраняется: в списке выбора его не отличить', () => {
  assert.equal(sanitizeCustomSchedule({ ...five, name: '  ' }, DEFAULT_SHIFT_TYPES), null);
});

test('смена длины цикла сохраняет нарисованное', () => {
  assert.deepEqual(resizeCycle(['day12', 'day12', 'off'], 5, 'off'), [
    'day12',
    'day12',
    'off',
    'off',
    'off',
  ]);
  assert.deepEqual(resizeCycle(['day12', 'day12', 'off'], 2, 'off'), ['day12', 'day12']);
});

test('описание собирается из букв-маркеров: у своего графика другого нет', () => {
  assert.equal(
    describePattern(
      { kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] },
      DEFAULT_SHIFT_TYPES,
    ),
    'Цикл 4 дня — Д, Д, В, В',
  );
});
