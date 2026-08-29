import { shiftPeriod } from './payday.ts';
import type { Period } from './payday.ts';

/** Месяц, разложенный на части: для заголовков и сеток. */
export interface MonthRef {
  period: Period;
  year: number;
  month: number;
}

/** Сколько месяцев доступно листанием в каждую сторону. */
export const MONTH_RANGE = 18;

/**
 * Окно месяцев вокруг заданного — данные для горизонтального листания.
 *
 * Живёт в домене, а не в компоненте: одно и то же окно листают и календарь, и
 * сводка, а арифметику периодов можно прогнать тестами в обычном Node.
 */
export function buildMonthWindow(center: Period, range = MONTH_RANGE): MonthRef[] {
  return Array.from({ length: range * 2 + 1 }, (_, index) => {
    const period = shiftPeriod(center, index - range);
    return { period, year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
  });
}
