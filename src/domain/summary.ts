import { monthDays } from './date.ts';
import { resolveRange } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import type { Period } from './payday.ts';
import { assertPeriod, periodOf } from './payday.ts';
import { PAYMENT_KINDS, isCompensationPayment } from './payments.ts';
import type { PaymentKind, PaymentRecord, ResolvedDay } from './types.ts';

export interface ShiftTypeTotals {
  shiftTypeId: string;
  name: string;
  badge: string;
  days: number;
  minutes: number;
}

export interface MonthSummary {
  period: Period;
  workedDays: number;
  workedMinutes: number;
  restDays: number;
  /** Дни, где план был изменён вручную: подработки и незапланированные выходные. */
  adjustedDays: number;
  byShiftType: ShiftTypeTotals[];
  /** Все деньги за месяц, включая отпускные и больничные. */
  totalPaid: number;
  /** Аванс и зарплата: только то, что заработано часами этого месяца. */
  workPaid: number;
  /** Отпускные и больничные — входят в totalPaid, но не в ставки. */
  compensationPaid: number;
  /** Разбивка по видам выплат для отдельных строк сводки. */
  byPaymentKind: PaymentKindTotals[];
  payments: PaymentRecord[];
  /**
   * Ставка за час, выведенная из факта: аванс и зарплата ÷ отработанные часы.
   * null, если за месяц нет таких выплат или нет отработанных часов.
   */
  effectiveHourlyRate: number | null;
  /** Средняя оплата за смену: аванс и зарплата ÷ число рабочих смен. */
  effectiveShiftRate: number | null;
}

export interface PaymentKindTotals {
  kind: PaymentKind;
  amount: number;
  count: number;
}

/**
 * Сводка за месяц. Часы берутся из календаря, деньги — только из внесённых
 * пользователем выплат за этот месяц (period), независимо от даты поступления.
 */
export function buildMonthSummary(
  context: ScheduleContext,
  period: Period,
  allPayments: PaymentRecord[],
): MonthSummary {
  assertPeriod(period);
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const days = resolveRange(context, monthDays(year, month));

  const totals = new Map<string, ShiftTypeTotals>();
  let workedDays = 0;
  let workedMinutes = 0;
  let restDays = 0;
  let adjustedDays = 0;

  for (const day of days) {
    const { shiftType } = day;
    const entry = totals.get(shiftType.id) ?? {
      shiftTypeId: shiftType.id,
      name: shiftType.name,
      badge: shiftType.badge,
      days: 0,
      minutes: 0,
    };
    entry.days += 1;
    entry.minutes += day.workedMinutes;
    totals.set(shiftType.id, entry);

    if (shiftType.kind === 'work') {
      workedDays += 1;
      workedMinutes += day.workedMinutes;
    } else {
      restDays += 1;
    }
    if (day.source === 'override') adjustedDays += 1;
  }

  const payments = allPayments.filter((payment) => payment.period === period);
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const compensationPaid = payments
    .filter((payment) => isCompensationPayment(payment.kind))
    .reduce((sum, payment) => sum + payment.amount, 0);
  // Ставки считаются от заработанного часами, а не от всей суммы: отпускные
  // приходят за месяц, в котором смен почти нет, и задрали бы ставку.
  const workPaid = totalPaid - compensationPaid;
  const hasWorkMoney = workPaid > 0;

  const byPaymentKind: PaymentKindTotals[] = PAYMENT_KINDS.map((kind) => {
    const ofKind = payments.filter((payment) => payment.kind === kind);
    return {
      kind,
      amount: ofKind.reduce((sum, payment) => sum + payment.amount, 0),
      count: ofKind.length,
    };
  }).filter((entry) => entry.count > 0);

  return {
    period,
    workedDays,
    workedMinutes,
    restDays,
    adjustedDays,
    byShiftType: [...totals.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    totalPaid,
    workPaid,
    compensationPaid,
    byPaymentKind,
    payments,
    effectiveHourlyRate: hasWorkMoney && workedMinutes > 0 ? workPaid / (workedMinutes / 60) : null,
    effectiveShiftRate: hasWorkMoney && workedDays > 0 ? workPaid / workedDays : null,
  };
}

export interface MonthForecast {
  /** Ставка, взятая из последнего месяца, где есть и часы, и выплаты. */
  basedOnPeriod: Period;
  hourlyRate: number;
  /** Прогноз на весь месяц по плановому календарю. */
  projectedTotal: number;
  /** Уже отработано на указанную дату, по той же ставке. */
  earnedSoFar: number;
}

/**
 * Прогноз для незакрытого месяца. Приложение не знает ставку — она берётся из
 * последнего закрытого месяца, поэтому результат всегда подписывается как
 * прогноз, а не как заработок.
 */
export function forecastMonth(
  current: MonthSummary,
  history: MonthSummary[],
  today: string,
  context: ScheduleContext,
): MonthForecast | null {
  const reference = history
    .filter((summary) => summary.period < current.period && summary.effectiveHourlyRate !== null)
    .sort((a, b) => b.period.localeCompare(a.period))[0];

  if (!reference || reference.effectiveHourlyRate === null) return null;

  const hourlyRate = reference.effectiveHourlyRate;
  const year = Number(current.period.slice(0, 4));
  const month = Number(current.period.slice(5, 7));
  const elapsed = periodOf(today) === current.period
    ? resolveRange(context, monthDays(year, month).filter((date) => date <= today))
    : [];

  const elapsedMinutes = elapsed.reduce((sum: number, day: ResolvedDay) => sum + day.workedMinutes, 0);

  return {
    basedOnPeriod: reference.period,
    hourlyRate,
    projectedTotal: hourlyRate * (current.workedMinutes / 60),
    earnedSoFar: hourlyRate * (elapsedMinutes / 60),
  };
}

/** Деньги одного месяца для годового графика. */
export interface MonthMoney {
  period: Period;
  /** 1..12 — для подписи месяца. */
  month: number;
  total: number;
  /** Отпускные и больничные внутри total: в графике они помечаются отдельно. */
  compensation: number;
}

/**
 * Суммы по месяцам года.
 *
 * Считается прямо по выплатам, без графика: месяц выплаты — это период, ЗА
 * который она пришла, а не дата поступления. Поэтому годовой график работает
 * и когда график смен ещё не выбран.
 */
export function yearlyPaymentTotals(payments: PaymentRecord[], year: number): MonthMoney[] {
  const prefix = String(year).padStart(4, '0');

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const period = `${prefix}-${String(month).padStart(2, '0')}` as Period;
    const forMonth = payments.filter((payment) => payment.period === period);
    const sum = (items: PaymentRecord[]): number =>
      items.reduce((total, payment) => total + payment.amount, 0);

    return {
      period,
      month,
      total: sum(forMonth),
      compensation: sum(forMonth.filter((payment) => isCompensationPayment(payment.kind))),
    };
  });
}
