import test from 'node:test';
import assert from 'node:assert/strict';
import { MONTH_RANGE, buildMonthWindow } from '../months.ts';

test('окно месяцев центрируется на заданном периоде', () => {
  const months = buildMonthWindow('2026-09');

  assert.equal(months.length, MONTH_RANGE * 2 + 1);
  assert.equal(months[MONTH_RANGE].period, '2026-09');
  assert.deepEqual(months[MONTH_RANGE], { period: '2026-09', year: 2026, month: 9 });
});

test('окно переходит через границу года в обе стороны', () => {
  const months = buildMonthWindow('2026-01', 2);

  assert.deepEqual(
    months.map((item) => item.period),
    ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03'],
  );
});
