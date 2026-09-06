import test from 'node:test';
import assert from 'node:assert/strict';
import { RU_HOLIDAYS } from '../holidays.ts';
import type { HolidayCalendar } from '../holidays.ts';
import { plannedShiftId, resolveDay } from '../engine.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import { weekday } from '../date.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

function contextFor(
  presetId: string,
  anchorDate: string,
  holidays: HolidayCalendar | null = RU_HOLIDAYS,
): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return {
    schedules: [{ presetId, pattern: preset.pattern, anchorDate, startsOn: anchorDate }],
    shiftTypes,
    overrides: new Map(),
    holidays,
  };
}

test('постоянные праздники на месте', () => {
  assert.equal(RU_HOLIDAYS.nameOf('2026-06-12'), 'День России');
  assert.equal(RU_HOLIDAYS.nameOf('2026-01-07'), 'Рождество Христово');
  assert.equal(RU_HOLIDAYS.nameOf('2026-11-04'), 'День народного единства');
  assert.equal(RU_HOLIDAYS.nameOf('2026-09-17'), null);
});

test('праздник, попавший на выходной, уезжает на ближайший рабочий день', () => {
  // 8 марта 2026 года — воскресенье; выходной за него достаётся понедельнику.
  assert.equal(weekday('2026-03-08'), 7);
  assert.ok(RU_HOLIDAYS.isNonWorking('2026-03-09'));
  assert.equal(RU_HOLIDAYS.nameOf('2026-03-09'), 'Перенос выходного с 8 марта');
});

test('перенос 2027 года: 9 мая в воскресенье даёт нерабочий понедельник', () => {
  assert.equal(weekday('2027-05-09'), 7);
  assert.ok(RU_HOLIDAYS.isNonWorking('2027-05-10'));

  // А 1 мая 2027-го — суббота, и её выходной уезжает на понедельник 3 мая.
  assert.equal(weekday('2027-05-01'), 6);
  assert.ok(RU_HOLIDAYS.isNonWorking('2027-05-03'));
});

test('два праздника подряд на выходных не кладут два переноса на один день', () => {
  // 2 и 3 мая 2027-го уже заняты переносом с 1 мая и самим 9 мая — перенос с
  // 9 мая обязан найти следующий свободный день, а не переписать чужой.
  const may = ['2027-05-03', '2027-05-10'];
  assert.deepEqual(
    may.map((date) => RU_HOLIDAYS.isNonWorking(date)),
    [true, true],
  );
});

test('январские праздники в переносе не участвуют: их день назначает Правительство', () => {
  // 3 января 2026 года — суббота. Статья 112 выводит январь из общего правила,
  // поэтому автоматического выходного 12 января быть не должно.
  assert.equal(weekday('2026-01-03'), 6);
  assert.equal(RU_HOLIDAYS.isNonWorking('2026-01-12'), false);
});

test('пятидневке праздник делает день нерабочим', () => {
  const context = contextFor('5-2', '2026-06-01');
  // 12 июня 2026 года — пятница, по графику рабочий день.
  assert.equal(weekday('2026-06-12'), 5);

  const day = resolveDay(context, '2026-06-12');
  assert.equal(day.shiftType.kind, 'rest');
  assert.equal(day.workedMinutes, 0);
  assert.equal(day.holiday, 'День России');
  // Недоработкой это не считается: нормы на праздник нет, её сняли вместе со сменой.
  assert.equal(day.plannedMinutes, 0);
});

test('сменному графику праздник только помечает день', () => {
  const context = contextFor('2-2-day', '2026-06-11');

  const day = resolveDay(context, '2026-06-12');
  assert.equal(day.shiftType.id, 'day12');
  assert.equal(day.workedMinutes, 12 * 60);
  assert.equal(day.holiday, 'День России');
});

test('выключенный календарь не трогает ни сменный график, ни пятидневку', () => {
  const day = resolveDay(contextFor('5-2', '2026-06-01', null), '2026-06-12');

  assert.equal(day.shiftType.id, 'work8');
  assert.equal(day.holiday, undefined);
});

test('пятидневка с сокращённой пятницей получает в праздник свой же выходной', () => {
  const context = contextFor('5-2-short-friday', '2026-06-01');
  assert.equal(plannedShiftId(context, '2026-06-12'), 'off');
});
