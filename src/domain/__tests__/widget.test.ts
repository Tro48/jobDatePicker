import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WIDGET_MONTHS,
  WIDGET_SNAPSHOT_VERSION,
  buildWidgetSnapshot,
  sameWidgetSnapshot,
} from '../widget.ts';
import type { WidgetColorLookup } from '../widget.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import { RU_HOLIDAYS } from '../holidays.ts';

const colorsOf: WidgetColorLookup = () => ({
  light: { surface: '#DBEAFE', on: '#1E3A8A', faded: '#EAEDF1' },
  dark: { surface: '#1E3A5F', on: '#BFDBFE', faded: '#1A2029' },
});

function contextFor(presetId: string, anchorDate = '2026-09-01'): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return {
    schedules: [{ presetId, pattern: preset.pattern, anchorDate, startsOn: anchorDate }],
    shiftTypes: indexShiftTypes(DEFAULT_SHIFT_TYPES),
    overrides: new Map(),
  };
}

test('снимок покрывает три месяца целыми неделями', () => {
  const snapshot = buildWidgetSnapshot(contextFor('2-2-day'), { today: '2026-09-17', colorsOf });

  assert.equal(snapshot.version, WIDGET_SNAPSHOT_VERSION);
  assert.equal(snapshot.months.length, WIDGET_MONTHS);
  assert.deepEqual(
    snapshot.months.map((month) => month.period),
    ['2026-09', '2026-10', '2026-11'],
  );
  // Сетка всегда состоит из целых недель — иначе колонки разъедутся.
  assert.ok(snapshot.months.every((month) => month.days.length % 7 === 0));
});

test('снимок переваливает через границу года', () => {
  const snapshot = buildWidgetSnapshot(contextFor('2-2-day'), { today: '2026-12-31', colorsOf });

  assert.deepEqual(
    snapshot.months.map((month) => month.period),
    ['2026-12', '2027-01', '2027-02'],
  );
});

test('смены не повторяются: дни ссылаются на них индексом', () => {
  const snapshot = buildWidgetSnapshot(contextFor('2-2-day'), { today: '2026-09-17', colorsOf });

  // В графике 2/2 всего две смены — дневная и выходной.
  assert.equal(snapshot.shifts.length, 2);
  assert.ok(snapshot.months[0].days.every((day) => day.shift >= 0 && day.shift < 2));
  assert.ok(snapshot.shifts.some((shift) => shift.work && shift.time === '08:00 – 20:00'));
});

test('цвета обеих тем лежат прямо в снимке: палитру на Kotlin не повторяем', () => {
  const snapshot = buildWidgetSnapshot(contextFor('2-2-day'), { today: '2026-09-17', colorsOf });

  assert.equal(snapshot.shifts[0].light.surface, '#DBEAFE');
  assert.equal(snapshot.shifts[0].dark.on, '#BFDBFE');
  // Приглушённая заливка отработанной смены едет вместе с обычной: считать её
  // на Kotlin значило бы повторить там смешивание цветов.
  assert.equal(snapshot.shifts[0].light.faded, '#EAEDF1');
});

test('тема берётся из настроек приложения, а не из системы', () => {
  const dark = buildWidgetSnapshot(contextFor('2-2-day'), {
    today: '2026-09-17',
    appearance: 'dark',
    colorsOf,
  });
  const byDefault = buildWidgetSnapshot(contextFor('2-2-day'), { today: '2026-09-17', colorsOf });

  assert.equal(dark.appearance, 'dark');
  assert.equal(byDefault.appearance, 'system');
  // Смена темы обязана переписать снимок: иначе виджет останется в прежней.
  assert.equal(sameWidgetSnapshot(dark, byDefault), false);
});

test('праздники попадают в снимок так же, как в календарь приложения', () => {
  const withHolidays = { ...contextFor('5-2', '2026-06-01'), holidays: RU_HOLIDAYS };
  const snapshot = buildWidgetSnapshot(withHolidays, { today: '2026-06-01', colorsOf });

  const june = snapshot.months.find((month) => month.period === '2026-06')!;
  const day = june.days.find((item) => item.date === '2026-06-12')!;

  // 12 июня 2026 — пятница, но для пятидневки это нерабочий день.
  assert.equal(snapshot.shifts[day.shift].work, false);
});

test('без графика снимок пустой, а не сломанный', () => {
  const snapshot = buildWidgetSnapshot(null, { today: '2026-09-17', colorsOf });

  assert.equal(snapshot.months.length, 0);
  assert.equal(snapshot.builtOn, '2026-09-17');
});

test('снимок с тем же содержимым не переписывается ради новой даты сборки', () => {
  const first = buildWidgetSnapshot(contextFor('2-2-day'), { today: '2026-09-17', colorsOf });
  const second = { ...first, builtOn: '2026-09-18' };
  const other = buildWidgetSnapshot(contextFor('3-3-day'), { today: '2026-09-17', colorsOf });

  assert.equal(sameWidgetSnapshot(first, second), true);
  assert.equal(sameWidgetSnapshot(first, other), false);
});
