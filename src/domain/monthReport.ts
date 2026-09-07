import { monthGridDates } from './date.ts';
import { countedDay, overtimeMinutes, resolveDay } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import {
  SHIFT_FORMS,
  WEEKDAYS_SHORT,
  formatMonthTitle,
  formatMoney,
  formatOvertimeTotal,
  formatTotalHours,
  pluralize,
} from './format.ts';
import type { Period } from './payday.ts';
import { PAYMENT_KIND_LABELS } from './payments.ts';
import { escapeHtml, reportPage } from './reportHtml.ts';
import type { MonthSummary } from './summary.ts';

/**
 * Месяц одной страницей: сетка, часы, смены и деньги.
 *
 * Собирается обычной строкой HTML, а не разметкой экрана: печать в PDF идёт
 * через системный движок, и он принимает именно HTML. Заодно это чистая
 * функция — её видно тестами целиком, без телефона.
 *
 * Просят это ради проверки табеля от работодателя, поэтому в отчёте есть
 * прошедшие месяцы, отработанные часы по дням и отклонение от графика: без
 * последнего сверять нечего.
 */
export interface MonthReportInput {
  period: Period;
  context: ScheduleContext;
  summary: MonthSummary;
  /** Имя работы. Пусто — работа одна, и подписывать её незачем. */
  trackName?: string;
  currency: string;
}

export function buildMonthReportHtml(input: MonthReportInput): string {
  const { period, context, summary, trackName, currency } = input;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const title = formatMonthTitle(year, month);

  const cells = monthGridDates(year, month).map((cell) => {
    const day = resolveDay(context, cell.date);
    const deviation = overtimeMinutes(day);
    // День раньше первого графика остаётся пустым: смены в нём не было, и
    // печатать «В» значило бы показать в табеле выходной, которого не брали.
    const badge = countedDay(day) ? day.shiftType.badge : '';

    return `<td class="${cell.inMonth ? 'in' : 'out'}">
      <div class="num">${Number(cell.date.slice(8, 10))}</div>
      <div class="badge">${escapeHtml(badge)}</div>
      <div class="hours">${day.workedMinutes > 0 ? formatTotalHours(day.workedMinutes) : ''}</div>
      <div class="dev">${cell.inMonth && deviation !== 0 ? formatOvertimeTotal(deviation) : ''}</div>
    </td>`;
  });

  const rows: string[] = [];
  for (let start = 0; start < cells.length; start += 7) {
    rows.push(`<tr>${cells.slice(start, start + 7).join('')}</tr>`);
  }

  const byShift = summary.byShiftType
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${pluralize(item.days, ['день', 'дня', 'дней'])}</td><td>${formatTotalHours(item.minutes)}</td></tr>`,
    )
    .join('');

  const money = summary.byPaymentKind
    .map(
      (item) =>
        `<tr><td>${PAYMENT_KIND_LABELS[item.kind]}</td><td></td><td>${formatMoney(item.amount, currency)}</td></tr>`,
    )
    .join('');

  // Месяц закрыт — план и факт совпали, и дробить числа незачем. Незакрытый
  // печатают, чтобы свериться по ходу: там надо видеть и отработанное, и то,
  // что графиком ещё осталось. Ровно как на экране сводки — двум местам,
  // которые печатают одно и то же, расходиться нельзя.
  const monthClosed = summary.elapsedWorkedDays === summary.workedDays;
  const workedHours = monthClosed
    ? formatTotalHours(summary.workedMinutes)
    : `${formatTotalHours(summary.elapsedWorkedMinutes)} из ${formatTotalHours(summary.workedMinutes)}`;
  const workedShifts = monthClosed
    ? pluralize(summary.workedDays, SHIFT_FORMS)
    : `${summary.elapsedWorkedDays} из ${pluralize(summary.workedDays, SHIFT_FORMS)}`;

  const body = `
  <table class="grid">
    <thead><tr>${WEEKDAYS_SHORT.map((name) => `<th>${name}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>

  <h2>Итого за месяц</h2>
  <table class="totals">
    <tbody>
      <tr><td>Отработано</td><td></td><td>${workedHours}</td></tr>
      <tr><td>Смен</td><td></td><td>${workedShifts}</td></tr>
      <tr><td>Выходных</td><td></td><td>${summary.restDays}</td></tr>
      <tr><td>Отклонение от графика</td><td></td><td>${formatOvertimeTotal(summary.overtimeMinutes)}</td></tr>
      ${byShift}
      ${money}
      ${summary.totalPaid > 0 ? `<tr class="sum"><td>Всего получено</td><td></td><td>${formatMoney(summary.totalPaid, currency)}</td></tr>` : ''}
    </tbody>
  </table>`;

  const footer = `Смены · график и часы, посчитанные приложением. Отклонение считается от смены, которую на этот день ставил график.${
    monthClosed
      ? ''
      : ' Месяц ещё идёт: «отработано» — то, что уже позади, второе число — весь месяц по графику. Строки по типам смен — тоже за весь месяц.'
  }`;

  return reportPage({ title, trackName, body, footer, extraStyles: GRID_STYLES });
}

/** Сетка месяца — только в этом отчёте, поэтому и стили её здесь. */
const GRID_STYLES = `
  .grid th { font-size: 9pt; font-weight: 600; padding: 4px 0; border-bottom: 1px solid #000; }
  .grid td { width: 14.28%; height: 62px; border: 1px solid #bbb; vertical-align: top; padding: 3px 4px; }
  .grid td.out { color: #999; border-color: #eee; }
  .num { font-size: 11pt; font-weight: 700; }
  .badge { font-size: 9pt; }
  .hours { font-size: 8pt; color: #333; }
  .dev { font-size: 8pt; font-weight: 700; }
`;
