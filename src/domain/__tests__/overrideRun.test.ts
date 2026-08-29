import test from 'node:test';
import assert from 'node:assert/strict';
import { findOverrideRun } from '../engine.ts';
import { inferPaymentPeriod, DEFAULT_PAYMENT_RULES, expectedPaymentDate } from '../payday.ts';
import type { IsoDate } from '../date.ts';
import type { DayOverride, PaymentRule } from '../types.ts';

function runOf(dates: Array<[IsoDate, string]>): Map<IsoDate, DayOverride> {
  return new Map(dates.map(([date, shiftTypeId]) => [date, { date, shiftTypeId }]));
}

test('отпуск находится целиком по любому дню из него', () => {
  const overrides = runOf([
    ['2026-09-07', 'vacation'],
    ['2026-09-08', 'vacation'],
    ['2026-09-09', 'vacation'],
    ['2026-09-10', 'vacation'],
  ]);

  const middle = findOverrideRun(overrides, '2026-09-09');
  assert.ok(middle);
  assert.equal(middle.start, '2026-09-07');
  assert.equal(middle.end, '2026-09-10');
  assert.equal(middle.length, 4);
  assert.equal(middle.position, 3);

  assert.equal(findOverrideRun(overrides, '2026-09-07')!.position, 1);
  assert.equal(findOverrideRun(overrides, '2026-09-10')!.position, 4);
});

test('отрезок обрывается на другом типе правки, а не склеивается', () => {
  const overrides = runOf([
    ['2026-09-07', 'vacation'],
    ['2026-09-08', 'vacation'],
    ['2026-09-09', 'sick'],
    ['2026-09-10', 'vacation'],
  ]);

  const vacation = findOverrideRun(overrides, '2026-09-08');
  assert.equal(vacation!.length, 2);
  assert.equal(vacation!.end, '2026-09-08');
  assert.equal(findOverrideRun(overrides, '2026-09-09')!.length, 1);
});

test('отрезок обрывается на разрыве в датах', () => {
  const overrides = runOf([
    ['2026-09-07', 'vacation'],
    ['2026-09-08', 'vacation'],
    ['2026-09-10', 'vacation'],
  ]);
  assert.equal(findOverrideRun(overrides, '2026-09-07')!.length, 2);
  assert.equal(findOverrideRun(overrides, '2026-09-10')!.length, 1);
});

test('отрезок переходит через границу месяца и года', () => {
  const overrides = runOf([
    ['2026-12-30', 'vacation'],
    ['2026-12-31', 'vacation'],
    ['2027-01-01', 'vacation'],
    ['2027-01-02', 'vacation'],
  ]);
  const run = findOverrideRun(overrides, '2027-01-01');
  assert.equal(run!.start, '2026-12-30');
  assert.equal(run!.length, 4);
  assert.equal(run!.position, 3);
});

test('без правки на дате отрезка нет', () => {
  assert.equal(findOverrideRun(new Map(), '2026-09-09'), null);
});

test('месяц выплаты восстанавливается по дате поступления', () => {
  const [advance, salary] = DEFAULT_PAYMENT_RULES;
  // Аванс приходит в конце предыдущего месяца — значит, он за следующий.
  assert.equal(inferPaymentPeriod(advance, '2026-08-27'), '2026-09');
  // Зарплата приходит в следующем месяце — значит, за предыдущий.
  assert.equal(inferPaymentPeriod(salary, '2026-10-09'), '2026-09');
  assert.equal(inferPaymentPeriod(salary, '2027-01-10'), '2026-12');
});

test('вывод месяца обратен расчёту даты выплаты', () => {
  for (const rule of DEFAULT_PAYMENT_RULES) {
    for (const period of ['2026-01', '2026-09', '2026-12', '2027-02']) {
      const date = expectedPaymentDate(rule, period);
      assert.equal(inferPaymentPeriod(rule, date), period, `${rule.kind} за ${period}`);
    }
  }
});

test('перенос с выходного через границу месяца не сбивает вывод периода', () => {
  // Зарплата 1-го числа со сдвигом назад: 1 ноября 2026 — воскресенье, выплата
  // уезжает в октябрь, и наивный сдвиг ошибся бы на целый месяц.
  const rules: PaymentRule[] = [
    { kind: 'salary', dayOfMonth: 1, paidInMonthOffset: 1, weekendShift: 'before' },
    { kind: 'advance', dayOfMonth: 31, paidInMonthOffset: -1, weekendShift: 'after' },
    { kind: 'salary', dayOfMonth: 1, paidInMonthOffset: 0, weekendShift: 'before' },
  ];

  for (const rule of rules) {
    for (let month = 1; month <= 12; month += 1) {
      const period = `2026-${String(month).padStart(2, '0')}`;
      const date = expectedPaymentDate(rule, period);
      assert.equal(
        inferPaymentPeriod(rule, date),
        period,
        `${rule.kind} ${rule.dayOfMonth}-го за ${period}: дата ${date}`,
      );
    }
  }
});
