import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PAYMENT_RULES,
  expectedPaymentDate,
  shiftPeriod,
  upcomingPayments,
} from '../payday.ts';
import type { PaymentRule } from '../types.ts';

const [advance, salary] = DEFAULT_PAYMENT_RULES;

test('аванс за сентябрь приходит в августе, зарплата за сентябрь — в октябре', () => {
  assert.equal(expectedPaymentDate(advance, '2026-09'), '2026-08-27');
  // 10 октября 2026 — суббота, правило сдвигает выплату назад на пятницу.
  assert.equal(expectedPaymentDate(salary, '2026-09'), '2026-10-09');
});

test('сдвиг с выходного назад и вперёд', () => {
  const base: PaymentRule = {
    kind: 'salary',
    dayOfMonth: 10,
    paidInMonthOffset: 0,
    weekendShift: 'before',
  };
  assert.equal(expectedPaymentDate(base, '2026-10'), '2026-10-09'); // суббота → пятница
  assert.equal(expectedPaymentDate({ ...base, weekendShift: 'after' }, '2026-10'), '2026-10-12'); // → понедельник
  assert.equal(expectedPaymentDate({ ...base, weekendShift: 'none' }, '2026-10'), '2026-10-10');
});

test('31-е число в коротком месяце не уезжает в следующий', () => {
  const rule: PaymentRule = {
    kind: 'salary',
    dayOfMonth: 31,
    paidInMonthOffset: 0,
    weekendShift: 'none',
  };
  assert.equal(expectedPaymentDate(rule, '2027-02'), '2027-02-28');
  assert.equal(expectedPaymentDate(rule, '2028-02'), '2028-02-29');
  assert.equal(expectedPaymentDate(rule, '2026-09'), '2026-09-30');
});

test('переход через год', () => {
  assert.equal(shiftPeriod('2026-01', -1), '2025-12');
  assert.equal(shiftPeriod('2026-12', 1), '2027-01');
  assert.equal(shiftPeriod('2026-09', 0), '2026-09');
});

test('ближайшие выплаты отсортированы по дате и не смотрят в прошлое', () => {
  const upcoming = upcomingPayments(DEFAULT_PAYMENT_RULES, '2026-08-28', 3);
  assert.equal(upcoming.length, 3);
  assert.ok(upcoming.every((item) => item.daysAway >= 0));
  // Аванс за сентябрь (27 августа) уже прошёл и в список не попадает.
  assert.deepEqual(
    upcoming.map((item) => [item.rule.kind, item.period, item.date]),
    [
      ['salary', '2026-08', '2026-09-10'],
      ['advance', '2026-10', '2026-09-25'],
      ['salary', '2026-09', '2026-10-09'],
    ],
  );
});
