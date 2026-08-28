import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthSummary, forecastMonth } from '../summary.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import type { PaymentRecord } from '../types.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

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
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', []);
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
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', []);
  assert.equal(summary.workedDays, 16);
  assert.equal(summary.workedMinutes, 192 * 60);
});

test('деньги берутся по месяцу, ЗА который выплата, а не по дате поступления', () => {
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', septemberPayments);
  assert.equal(summary.payments.length, 2);
  assert.equal(summary.totalPaid, 75_000);
});

test('ставка за час выводится делением суммы месяца на отработанные часы', () => {
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', septemberPayments);
  assert.ok(summary.effectiveHourlyRate !== null);
  assert.equal(Math.round(summary.effectiveHourlyRate * 100) / 100, 436.05); // 75000 / 172
  assert.equal(Math.round(summary.effectiveShiftRate! * 100) / 100, 3409.09); // 75000 / 22
});

test('без внесённых выплат ставка не выдумывается', () => {
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', []);
  assert.equal(summary.effectiveHourlyRate, null);
  assert.equal(summary.effectiveShiftRate, null);
});

test('ручные правки считаются отдельно и меняют часы', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-03', { date: '2026-09-03', shiftTypeId: 'extra', workedMinutesOverride: 240 });
  context.overrides.set('2026-09-05', { date: '2026-09-05', shiftTypeId: 'off' });

  const summary = buildMonthSummary(context, '2026-09', []);
  assert.equal(summary.adjustedDays, 2);
  // Было 192 часа: минус смена 5 сентября (12 ч), плюс подработка 4 часа.
  assert.equal(summary.workedMinutes, (192 - 12) * 60 + 240);
  assert.equal(summary.workedDays, 16);
});

test('прогноз незакрытого месяца берёт ставку из последнего закрытого', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const august = buildMonthSummary(context, '2026-08', [
    { id: 'a8', kind: 'salary', period: '2026-08', receivedOn: '2026-09-10', amount: 96_000 },
  ]);
  const september = buildMonthSummary(context, '2026-09', []);
  const forecast = forecastMonth(september, [august], '2026-09-15', context);

  assert.ok(forecast);
  assert.equal(forecast.basedOnPeriod, '2026-08');
  assert.equal(forecast.hourlyRate, august.effectiveHourlyRate);
  assert.ok(forecast.earnedSoFar > 0);
  assert.ok(forecast.earnedSoFar < forecast.projectedTotal);
});

test('прогноза нет, если нет ни одного закрытого месяца с выплатами', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const september = buildMonthSummary(context, '2026-09', []);
  assert.equal(forecastMonth(september, [], '2026-09-15', context), null);
});

test('отпускные входят в сумму месяца, но не в ставку за час и за смену', () => {
  const payments: PaymentRecord[] = [
    ...septemberPayments,
    { id: 'v', kind: 'vacationPay', period: '2026-09', receivedOn: '2026-09-05', amount: 20_000 },
    { id: 'b', kind: 'sickPay', period: '2026-09', receivedOn: '2026-09-20', amount: 5_000 },
  ];
  const summary = buildMonthSummary(contextFor('5-2-short-friday', '2026-09-01'), '2026-09', payments);

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
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', payments);

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
  const summary = buildMonthSummary(contextFor('2-2-day', '2026-09-01'), '2026-09', payments);

  assert.equal(summary.totalPaid, 5_000);
  assert.equal(summary.workPaid, 0);
  assert.equal(summary.effectiveHourlyRate, null);
  assert.equal(summary.effectiveShiftRate, null);
});
