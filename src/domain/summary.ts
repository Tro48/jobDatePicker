import { monthDays } from './date.ts';
import { resolveRange } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import type { Period } from './payday.ts';
import { assertPeriod, periodOf } from './payday.ts';
import type { PaymentRecord, ResolvedDay } from './types.ts';

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
  totalPaid: number;
  payments: PaymentRecord[];
  /**
   * Ставка за час, выведенная из факта: сумма за месяц ÷ отработанные часы.
   * null, если за месяц нет выплат или нет отработанных часов.
   */
  effectiveHourlyRate: number | null;
  /** Средняя оплата за смену: сумма за месяц ÷ число рабочих смен. */
  effectiveShiftRate: number | null;
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
  const hasMoney = payments.length > 0 && totalPaid > 0;

  return {
    period,
    workedDays,
    workedMinutes,
    restDays,
    adjustedDays,
    byShiftType: [...totals.values()].sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name)),
    totalPaid,
    payments,
    effectiveHourlyRate: hasMoney && workedMinutes > 0 ? totalPaid / (workedMinutes / 60) : null,
    effectiveShiftRate: hasMoney && workedDays > 0 ? totalPaid / workedDays : null,
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
