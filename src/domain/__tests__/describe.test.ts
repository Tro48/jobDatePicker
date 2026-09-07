import test from 'node:test';
import assert from 'node:assert/strict';
import { describeBaseDay, describeDay, describeScheduleStart } from '../describe.ts';
import { resolveDay } from '../engine.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

function contextFor(presetId: string, anchorDate: string): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return {
    schedules: [{ presetId, pattern: preset.pattern, anchorDate, startsOn: anchorDate }],
    shiftTypes,
    overrides: new Map(),
  };
}

test('рабочий день озвучивается датой, сменой, временем и часами', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const day = resolveDay(context, '2026-09-01');
  assert.equal(describeDay(day), '1 сентября, вторник, дневная смена, с 08:00 до 20:00, 12 часов');
});

test('выходной не получает ни времени, ни часов', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  assert.equal(describeDay(resolveDay(context, '2026-09-03')), '3 сентября, четверг, выходной');
});

test('сегодняшний день помечается словом, а не только рамкой', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const day = resolveDay(context, '2026-09-01');
  assert.match(describeDay(day, { isToday: true }), /^1 сентября, вторник, сегодня, /);
});

test('правка озвучивается, а противоречивое время не читается', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-03', {
    date: '2026-09-03',
    shiftTypeId: 'extra',
    workedMinutesOverride: 240,
    note: 'вышел за Сергея',
  });
  const spoken = describeDay(resolveDay(context, '2026-09-03'));

  assert.equal(
    spoken,
    '3 сентября, четверг, подработка, 4 часа, сверх графика, изменено вручную, вышел за Сергея',
  );
  assert.ok(
    !spoken.includes('до 18:00'),
    'штатное время смены при переопределённых часах читать нельзя',
  );
});

test('ночная смена читается с переходом через полночь', () => {
  const context = contextFor('dnso', '2026-09-01');
  assert.equal(
    describeDay(resolveDay(context, '2026-09-02')),
    '2 сентября, среда, ночная смена, с 20:00 до 08:00, 12 часов',
  );
});

test('месяц до первой смены и месяц с ней подписаны по-разному', () => {
  // Полная сетка смен и ноль часов под ней — с виду поломка, поэтому месяц до
  // первой смены объясняется словами.
  assert.equal(
    describeScheduleStart('2026-08', '2026-09-02'),
    'Работа начинается 2 сентября: в этом месяце смен ещё не было.',
  );
  assert.equal(
    describeScheduleStart('2026-09', '2026-09-02'),
    'Считается с 2 сентября — дня первой смены.',
  );
  // Месяц целиком после первой смены объяснять нечем: числа обычные.
  assert.equal(describeScheduleStart('2026-10', '2026-09-02'), null);
  // Первое число — месяц и так считается целиком.
  assert.equal(describeScheduleStart('2026-09', '2026-09-01'), null);
});

test('день без графика описывается по календарю, а не по заглушке-выходному', () => {
  // 1 сентября 2026 года — вторник, 5 сентября — суббота.
  assert.equal(describeBaseDay('2026-09-01'), '1 сентября, вторник, будний день, графика ещё нет');
  assert.equal(describeBaseDay('2026-09-05'), '5 сентября, суббота, выходной, графика ещё нет');
  assert.match(describeBaseDay('2026-09-01', { isToday: true }), /сегодня/);
  // У праздника своё название, и спорить с ним словом «будний» незачем.
  assert.equal(
    describeBaseDay('2026-01-01', { holiday: 'Новогодние каникулы' }),
    '1 января, четверг, новогодние каникулы, графика ещё нет',
  );
});
