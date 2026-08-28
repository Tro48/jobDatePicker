import { addDays, daysBetween, daysInMonth, weekday } from './date.ts';
import type { IsoDate } from './date.ts';
import type { PaymentRule } from './types.ts';

/** Месяц в формате "YYYY-MM". */
export type Period = string;

const PERIOD_RE = /^\d{4}-\d{2}$/;

export function assertPeriod(value: string): asserts value is Period {
  if (!PERIOD_RE.test(value)) {
    throw new TypeError(`Ожидался месяц в формате YYYY-MM, получено: ${value}`);
  }
}

export function periodOf(date: IsoDate): Period {
  return date.slice(0, 7);
}

export function shiftPeriod(period: Period, months: number): Period {
  assertPeriod(period);
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const total = year * 12 + (month - 1) + months;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Дата, в которую ожидается выплата за указанный месяц.
 *
 * Месяц выплаты и месяц, за который платят, — разные вещи: аванс за сентябрь
 * приходит в конце августа (paidInMonthOffset: -1), а зарплата за сентябрь —
 * в октябре (+1).
 */
export function expectedPaymentDate(rule: PaymentRule, period: Period): IsoDate {
  const payMonth = shiftPeriod(period, rule.paidInMonthOffset);
  const year = Number(payMonth.slice(0, 4));
  const month = Number(payMonth.slice(5, 7));
  // 31-е число в феврале — берём последний день месяца, а не уезжаем в март.
  const day = Math.min(Math.max(rule.dayOfMonth, 1), daysInMonth(year, month));
  const date: IsoDate = `${payMonth}-${String(day).padStart(2, '0')}`;
  return applyWeekendShift(date, rule.weekendShift);
}

/** Сдвиг с выходного дня: 'before' — на пятницу, 'after' — на понедельник. */
export function applyWeekendShift(date: IsoDate, mode: PaymentRule['weekendShift']): IsoDate {
  if (mode === 'none') return date;
  const day = weekday(date);
  if (day < 6) return date;
  return mode === 'before'
    ? addDays(date, day === 6 ? -1 : -2)
    : addDays(date, day === 6 ? 2 : 1);
}

export interface UpcomingPayment {
  rule: PaymentRule;
  /** Месяц, ЗА который эта выплата. */
  period: Period;
  date: IsoDate;
  daysAway: number;
}

/**
 * Ближайшие ожидаемые выплаты начиная с указанной даты.
 * Перебирает окно в несколько месяцев в обе стороны, потому что выплата за
 * будущий месяц может прийти раньше выплаты за текущий.
 */
export function upcomingPayments(
  rules: PaymentRule[],
  today: IsoDate,
  limit = 2,
): UpcomingPayment[] {
  const base = periodOf(today);
  const candidates: UpcomingPayment[] = [];

  for (let offset = -2; offset <= 3; offset += 1) {
    const period = shiftPeriod(base, offset);
    for (const rule of rules) {
      const date = expectedPaymentDate(rule, period);
      const daysAway = daysBetween(today, date);
      if (daysAway >= 0) candidates.push({ rule, period, date, daysAway });
    }
  }

  return candidates.sort((a, b) => a.daysAway - b.daysAway).slice(0, limit);
}

/**
 * Значения по умолчанию: аванс приходит в конце предыдущего месяца, зарплата —
 * в следующем. Пользователь меняет числа в настройках.
 */
export const DEFAULT_PAYMENT_RULES: PaymentRule[] = [
  { kind: 'advance', dayOfMonth: 27, paidInMonthOffset: -1, weekendShift: 'before' },
  { kind: 'salary', dayOfMonth: 10, paidInMonthOffset: 1, weekendShift: 'before' },
];
