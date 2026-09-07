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
 * Границы, в которых приложение вообще берётся показывать месяцы.
 *
 * Выбор месяца и года окном листания не ограничен — уехать можно куда угодно,
 * и без края это «куда угодно» упирается в арифметику: год хранится четырьмя
 * цифрами, а производственный календарь начинается сильно позже 1970-го.
 * Границы взяты по целым годам, чтобы в разрешённом году были доступны все
 * двенадцать месяцев.
 */
export const FIRST_PERIOD: Period = '1970-01';
export const LAST_PERIOD: Period = '2099-12';

/** Месяц по периоду: «2026-09» → год 2026, месяц 9. */
export function monthRefOf(period: Period): MonthRef {
  return { period, year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
}

/** Период по году и месяцу: 2026 и 9 → «2026-09». */
export function periodFrom(year: number, month: number): Period {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Окно месяцев вокруг заданного — данные для горизонтального листания.
 *
 * Живёт в домене, а не в компоненте: одно и то же окно листают и календарь, и
 * сводка, а арифметику периодов можно прогнать тестами в обычном Node.
 */
export function buildMonthWindow(center: Period, range = MONTH_RANGE): MonthRef[] {
  return Array.from({ length: range * 2 + 1 }, (_, index) =>
    monthRefOf(shiftPeriod(center, index - range)),
  );
}

/** Сколько лет доступно листанием в каждую сторону. */
export const YEAR_RANGE = 10;

/** Окно годов вокруг заданного — данные для листания годового экрана. */
export function buildYearWindow(center: number, range = YEAR_RANGE): number[] {
  return Array.from({ length: range * 2 + 1 }, (_, index) => center - range + index);
}
