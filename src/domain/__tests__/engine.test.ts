import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays } from '../date.ts';
import {
  resolveDay,
  resolvePlannedShiftId,
  scheduleUsesKnownShifts,
  shiftDurationMinutes,
  validatePreset,
} from '../engine.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import type { ActiveSchedule } from '../types.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

function contextFor(presetId: string, anchorDate: string): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
  assert.ok(preset, `пресет ${presetId} не найден`);
  const schedule: ActiveSchedule = { presetId, pattern: preset.pattern, anchorDate };
  return { schedule, shiftTypes, overrides: new Map() };
}

function badges(context: ScheduleContext, dates: string[]): string {
  return dates.map((date) => resolveDay(context, date).shiftType.badge).join('');
}

test('все пресеты ссылаются только на существующие смены', () => {
  const errors = SCHEDULE_PRESETS.flatMap((preset) => validatePreset(preset, shiftTypes));
  assert.deepEqual(errors, []);
});

test('validatePreset ловит ссылку на несуществующую смену', () => {
  const errors = validatePreset(
    { id: 'broken', name: '', description: '', pattern: { kind: 'cycle', slots: ['day12', 'ghost'] } },
    shiftTypes,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost/);
});

test('2/2 дневные: две смены, два выходных от даты первой смены', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const first = monthDays(2026, 9).slice(0, 10);
  assert.equal(badges(context, first), 'ДДВВДДВВДД');
});

test('график разворачивается и назад во времени от даты первой смены', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  // Перед первой сменой идёт предыдущий оборот цикла: смены 28-29, выходные 30-31.
  assert.equal(badges(context, ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']), 'ДДВВ');
});

test('день/ночь/отсыпной/выходной — цикл из четырёх дней', () => {
  const context = contextFor('dnso', '2026-09-01');
  assert.equal(badges(context, monthDays(2026, 9).slice(0, 8)), 'ДНОВДНОВ');
});

test('3/3 день-ночь — цикл из двенадцати дней', () => {
  const context = contextFor('3-3-mixed', '2026-09-01');
  assert.equal(badges(context, monthDays(2026, 9).slice(0, 12)), 'ДДДВВВНННВВВ');
  assert.equal(badges(context, monthDays(2026, 9).slice(12, 15)), 'ДДД');
});

test('5/2 привязана к дням недели, а не к дате отсчёта', () => {
  const fromTuesday = contextFor('5-2-short-friday', '2026-09-01');
  const fromSaturday = contextFor('5-2-short-friday', '2026-09-05');
  const week = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
  assert.equal(badges(fromTuesday, week), 'РРРРСВВ');
  assert.equal(badges(fromSaturday, week), 'РРРРСВВ');
});

test('ручная правка перекрывает график и помечается как правка', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-03', {
    date: '2026-09-03',
    shiftTypeId: 'extra',
    workedMinutesOverride: 300,
    note: 'подработка за Сергея',
  });
  const planned = resolveDay(context, '2026-09-04');
  const adjusted = resolveDay(context, '2026-09-03');

  assert.equal(planned.source, 'schedule');
  assert.equal(planned.shiftType.id, 'off');
  assert.equal(adjusted.source, 'override');
  assert.equal(adjusted.shiftType.id, 'extra');
  assert.equal(adjusted.workedMinutes, 300);
  assert.equal(adjusted.note, 'подработка за Сергея');
});

test('длительность смены: обычная, через полночь, суточная, с перерывом', () => {
  const byId = (id: string) => shiftTypes.get(id)!;
  assert.equal(shiftDurationMinutes(byId('day12')), 12 * 60);
  assert.equal(shiftDurationMinutes(byId('night12')), 12 * 60); // 20:00 → 08:00
  assert.equal(shiftDurationMinutes(byId('day24')), 24 * 60); // start === end
  assert.equal(shiftDurationMinutes(byId('work8')), 8 * 60); // 09:00–18:00 минус час обеда
  assert.equal(shiftDurationMinutes(byId('work7')), 7 * 60);
  assert.equal(shiftDurationMinutes(byId('off')), 0);
});

test('неизвестный тип смены падает с внятной ошибкой, а не молча', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-05', { date: '2026-09-05', shiftTypeId: 'ghost' });
  assert.throws(() => resolveDay(context, '2026-09-05'), /ghost/);
});

test('resolvePlannedShiftId игнорирует правки — это план, а не факт', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'off' });
  assert.equal(resolvePlannedShiftId(context.schedule, '2026-09-01'), 'day12');
});

test('заметка к дню не делает его изменённым вручную', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  // Так карточка дня записывает одну заметку: смену не трогает, часы тоже.
  context.overrides.set('2026-09-01', { date: '2026-09-01', note: 'вышел за Сергея' });
  const day = resolveDay(context, '2026-09-01');

  // Точка в клетке, счётчик правок за месяц и кнопка «вернуть по графику»
  // смотрят именно на source. Подпись к дню ничего из этого не заслуживает.
  assert.equal(day.source, 'schedule');
  assert.equal(day.shiftType.id, 'day12');
  assert.equal(day.workedMinutes, 12 * 60);
  assert.equal(day.note, 'вышел за Сергея');
});

test('правка без смены продолжает следовать графику при сдвиге даты отсчёта', () => {
  const withNote = { date: '2026-09-01', note: 'вышел за Сергея' };

  const early = contextFor('2-2-day', '2026-09-01');
  early.overrides.set('2026-09-01', withNote);
  assert.equal(resolveDay(early, '2026-09-01').shiftType.id, 'day12');

  // Тот же день после сдвига первой смены на два дня назад — уже выходной.
  const shifted = contextFor('2-2-day', '2026-08-30');
  shifted.overrides.set('2026-09-01', withNote);
  assert.equal(resolveDay(shifted, '2026-09-01').shiftType.id, 'off');
});

test('одни только часы — это изменение дня, а не заметка', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-01', { date: '2026-09-01', workedMinutesOverride: 420 });
  const day = resolveDay(context, '2026-09-01');

  assert.equal(day.source, 'override');
  assert.equal(day.shiftType.id, 'day12');
  assert.equal(day.workedMinutes, 420);
});

test('scheduleUsesKnownShifts ловит график на исчезнувшую смену', () => {
  const ok = contextFor('2-2-day', '2026-09-01');
  assert.equal(scheduleUsesKnownShifts(ok.schedule, shiftTypes), true);

  const broken: ActiveSchedule = {
    presetId: '2-2-day',
    pattern: { kind: 'cycle', slots: ['day12', 'ghost', 'off', 'off'] },
    anchorDate: '2026-09-01',
  };
  assert.equal(scheduleUsesKnownShifts(broken, shiftTypes), false);
});
