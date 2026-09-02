import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthSummary, forecastMonth, yearlyPaymentTotals } from '../summary.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import type { PaymentRecord } from '../types.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

/** Дата позже всех проверяемых месяцев: отработанное совпадает с планом. */
const AFTER_ALL = '2026-12-31';

function contextFor(presetId: string, anchorDate: string): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return {
    schedule: { presetId, pattern: preset.pattern, anchorDate },
    shiftTypes,
    overrides: new Map(),
  };
}

const septemberPayments: PaymentRecord[] = [
  { id: 'a', kind: 'advance', period: '2026-09', receivedOn: '2026-08-27', amount: 30_000 },
  { id: 's', kind: 'salary', period: '2026-09', receivedOn: '2026-10-09', amount: 45_000 },
  // Выплата за август не должна попасть в сентябрьскую сводку.
  { id: 'x', kind: 'salary', period: '2026-08', receivedOn: '2026-09-10', amount: 41_000 },
];

test('5/2 с короткой пятницей: 22 рабочих дня и 172 часа в сентябре 2026', () => {
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', [], AFTER_ALL);
  assert.equal(summary.workedDays, 22);
  assert.equal(summary.restDays, 8);
  assert.equal(summary.workedMinutes, 172 * 60);

  const regular = summary.byShiftType.find((item) => item.shiftTypeId === 'work8')!;
  const short = summary.byShiftType.find((item) => item.shiftTypeId === 'work7')!;
  assert.equal(regular.days, 18);
  assert.equal(short.days, 4);
  assert.equal(short.minutes, 28 * 60);
});

test('2/2 дневные: 16 смен и 192 часа в сентябре 2026', () => {
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', [], AFTER_ALL);
  assert.equal(summary.workedDays, 16);
  assert.equal(summary.workedMinutes, 192 * 60);
});

test('деньги берутся по месяцу, ЗА который выплата, а не по дате поступления', () => {
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', septemberPayments, AFTER_ALL);
  assert.equal(summary.payments.length, 2);
  assert.equal(summary.totalPaid, 75_000);
});

test('ставка за час выводится делением суммы месяца на отработанные часы', () => {
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', septemberPayments, AFTER_ALL);
  assert.ok(summary.effectiveHourlyRate !== null);
  assert.equal(Math.round(summary.effectiveHourlyRate * 100) / 100, 436.05); // 75000 / 172
  assert.equal(Math.round(summary.effectiveShiftRate! * 100) / 100, 3409.09); // 75000 / 22
});

test('без внесённых выплат ставка не выдумывается', () => {
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', [], AFTER_ALL);
  assert.equal(summary.effectiveHourlyRate, null);
  assert.equal(summary.effectiveShiftRate, null);
});

test('ручные правки считаются отдельно и меняют часы', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-03', { date: '2026-09-03', shiftTypeId: 'extra', workedMinutesOverride: 240 });
  context.overrides.set('2026-09-05', { date: '2026-09-05', shiftTypeId: 'off' });

  const summary = buildMonthSummary(context, '2026-09', [], AFTER_ALL);
  assert.equal(summary.adjustedDays, 2);
  // Было 192 часа: минус смена 5 сентября (12 ч), плюс подработка 4 часа.
  assert.equal(summary.workedMinutes, (192 - 12) * 60 + 240);
  assert.equal(summary.workedDays, 16);
});

test('прогноз незакрытого месяца берёт ставку из последнего закрытого', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const august = buildMonthSummary(
    context,
    '2026-08',
    [{ id: 'a8', kind: 'salary', period: '2026-08', receivedOn: '2026-09-10', amount: 96_000 }],
    AFTER_ALL,
  );
  const september = buildMonthSummary(context, '2026-09', [], '2026-09-15');
  const forecast = forecastMonth(september, [august]);

  assert.ok(forecast);
  assert.equal(forecast.basedOnPeriod, '2026-08');
  assert.equal(forecast.hourlyRate, august.effectiveHourlyRate);
  assert.ok(forecast.earnedSoFar > 0);
  assert.ok(forecast.earnedSoFar < forecast.projectedTotal);
});

test('прогноза нет, если нет ни одного закрытого месяца с выплатами', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const september = buildMonthSummary(context, '2026-09', [], '2026-09-15');
  assert.equal(forecastMonth(september, []), null);
});

test('отпускные входят в сумму месяца, но не в ставку за час и за смену', () => {
  const payments: PaymentRecord[] = [
    ...septemberPayments,
    { id: 'v', kind: 'vacationPay', period: '2026-09', receivedOn: '2026-09-05', amount: 20_000 },
    { id: 'b', kind: 'sickPay', period: '2026-09', receivedOn: '2026-09-20', amount: 5_000 },
  ];
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', payments, AFTER_ALL);

  assert.equal(summary.totalPaid, 100_000);
  assert.equal(summary.compensationPaid, 25_000);
  assert.equal(summary.workPaid, 75_000);
  // Ставки остались теми же, что и без отпускных: 75000 / 172 и 75000 / 22.
  assert.equal(Math.round(summary.effectiveHourlyRate! * 100) / 100, 436.05);
  assert.equal(Math.round(summary.effectiveShiftRate! * 100) / 100, 3409.09);
});

test('разбивка по видам выплат идёт в порядке справочника и без пустых строк', () => {
  const payments: PaymentRecord[] = [
    { id: 'v', kind: 'vacationPay', period: '2026-09', receivedOn: '2026-09-05', amount: 20_000 },
    { id: 'a1', kind: 'advance', period: '2026-09', receivedOn: '2026-08-27', amount: 30_000 },
    { id: 'a2', kind: 'advance', period: '2026-09', receivedOn: '2026-08-28', amount: 1_000 },
  ];
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', payments, AFTER_ALL);

  assert.deepEqual(
    summary.byPaymentKind.map((entry) => [entry.kind, entry.amount, entry.count]),
    [
      ['advance', 31_000, 2],
      ['vacationPay', 20_000, 1],
    ],
  );
});

test('месяц без аванса и зарплаты, но с больничным: ставка не считается', () => {
  const payments: PaymentRecord[] = [
    { id: 'b', kind: 'sickPay', period: '2026-09', receivedOn: '2026-09-20', amount: 5_000 },
  ];
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', payments, AFTER_ALL);

  assert.equal(summary.totalPaid, 5_000);
  assert.equal(summary.workPaid, 0);
  assert.equal(summary.effectiveHourlyRate, null);
  assert.equal(summary.effectiveShiftRate, null);
});

test('годовые итоги: месяц выплаты — тот, ЗА который платят', () => {
  const payments: PaymentRecord[] = [
    ...septemberPayments,
    { id: 'v', kind: 'vacationPay', period: '2026-07', receivedOn: '2026-06-25', amount: 52_000 },
    // Декабрь прошлого года в 2026-й не попадает.
    { id: 'old', kind: 'salary', period: '2025-12', receivedOn: '2026-01-09', amount: 44_000 },
  ];

  const months = yearlyPaymentTotals(payments, 2026);

  assert.equal(months.length, 12);
  assert.equal(months[6].period, '2026-07');
  assert.equal(months[6].total, 52_000);
  // Отпускные видны отдельно: в сумму месяца входят, в ставки — нет.
  assert.equal(months[6].compensation, 52_000);
  assert.equal(months[7].total, 41_000);
  assert.equal(months[8].total, 75_000);
  assert.equal(months[8].compensation, 0);
  assert.equal(months.reduce((sum, item) => sum + item.total, 0), 168_000);
});

test('отработанное считается по дату включительно, план — на весь месяц', () => {
  // 2/2 от 1 сентября: смены 1, 2, 5, 6, 9, 10, 13, 14 — к 14-му отработано восемь.
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', [], '2026-09-14');

  assert.equal(summary.workedDays, 16);
  assert.equal(summary.elapsedWorkedDays, 8);
  assert.equal(summary.workedMinutes, 192 * 60);
  assert.equal(summary.elapsedWorkedMinutes, 96 * 60);
});

test('будущий месяц ещё не отработан, закрытый — отработан целиком', () => {
  const context = contextFor('2-2-day', '2026-09-01');

  const future = buildMonthSummary(context, '2026-10', [], '2026-09-14');
  assert.equal(future.elapsedWorkedDays, 0);
  assert.equal(future.elapsedWorkedMinutes, 0);

  const closed = buildMonthSummary(context, '2026-08', [], '2026-09-14');
  assert.equal(closed.elapsedWorkedDays, closed.workedDays);
  assert.equal(closed.elapsedWorkedMinutes, closed.workedMinutes);
});

test('переработка и недоработка за месяц складываются со знаком', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  // Штатная дневная смена — 12 часов: 14 часов это +2, 10 часов это −2.
  context.overrides.set('2026-09-01', { date: '2026-09-01', workedMinutesOverride: 14 * 60 });
  context.overrides.set('2026-09-02', { date: '2026-09-02', workedMinutesOverride: 10 * 60 });
  context.overrides.set('2026-09-05', { date: '2026-09-05', workedMinutesOverride: 15 * 60 });

  const summary = buildMonthSummary(context, '2026-09', [], AFTER_ALL);

  assert.equal(summary.overtimeDays, 3);
  assert.equal(summary.overtimeMinutes, 3 * 60);
  assert.equal(summary.workedMinutes, (192 + 3) * 60);
});

test('день по графику отклонения не даёт', () => {
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', [], AFTER_ALL);
  assert.equal(summary.overtimeDays, 0);
  assert.equal(summary.overtimeMinutes, 0);
});

test('отпуск не считается недоработкой: у выходного дня своя норма — ноль', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  for (let day = 1; day <= 14; day += 1) {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
    context.overrides.set(date, { date, shiftTypeId: 'vacation' });
  }

  const summary = buildMonthSummary(context, '2026-09', [], AFTER_ALL);
  assert.equal(summary.overtimeDays, 0);
  assert.equal(summary.overtimeMinutes, 0);
});

test('подработка в выходной — плюс все её часы, внеплановый выходной отклонения не даёт', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  // 3 сентября по графику выходной, 1 сентября — дневная смена.
  context.overrides.set('2026-09-03', {
    date: '2026-09-03',
    shiftTypeId: 'extra',
    workedMinutesOverride: 4 * 60,
  });
  context.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'off' });

  const summary = buildMonthSummary(context, '2026-09', [], AFTER_ALL);

  assert.equal(summary.overtimeDays, 1);
  assert.equal(summary.overtimeMinutes, 4 * 60);
});
