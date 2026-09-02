import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDay } from '../describe.ts';
import { resolveDay } from '../engine.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

function contextFor(presetId: string, anchorDate: string): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return { schedule: { presetId, pattern: preset.pattern, anchorDate }, shiftTypes, overrides: new Map() };
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

  assert.equal(spoken, '3 сентября, четверг, подработка, 4 часа, сверх графика, изменено вручную, вышел за Сергея');
  assert.ok(!spoken.includes('до 18:00'), 'штатное время смены при переопределённых часах читать нельзя');
});

test('ночная смена читается с переходом через полночь', () => {
  const context = contextFor('dnso', '2026-09-01');
  assert.equal(
    describeDay(resolveDay(context, '2026-09-02')),
    '2 сентября, среда, ночная смена, с 20:00 до 08:00, 12 часов',
  );
});
