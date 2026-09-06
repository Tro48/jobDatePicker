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

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${trackName ? `<p class="track">${escapeHtml(trackName)}</p>` : ''}

  <table class="grid">
    <thead><tr>${WEEKDAYS_SHORT.map((name) => `<th>${name}</th>`).join('')}</tr></thead>
    <tbody>${rows.join('')}</tbody>
  </table>

  <h2>Итого за месяц</h2>
  <table class="totals">
    <tbody>
      <tr><td>Отработано</td><td></td><td>${formatTotalHours(summary.workedMinutes)}</td></tr>
      <tr><td>Смен</td><td></td><td>${pluralize(summary.workedDays, SHIFT_FORMS)}</td></tr>
      <tr><td>Выходных</td><td></td><td>${summary.restDays}</td></tr>
      <tr><td>Отклонение от графика</td><td></td><td>${formatOvertimeTotal(summary.overtimeMinutes)}</td></tr>
      ${byShift}
      ${money}
      ${summary.totalPaid > 0 ? `<tr class="sum"><td>Всего получено</td><td></td><td>${formatMoney(summary.totalPaid, currency)}</td></tr>` : ''}
    </tbody>
  </table>

  <p class="foot">Смены · график и часы, посчитанные приложением. Отклонение считается от смены, которую на этот день ставил график.</p>
</body>
</html>`;
}

/**
 * Стили печати. Чёрным по белому и без единого цвета смены: печатают такое
 * на обычном принтере, а цветная заливка на нём превращается в серую кашу,
 * поверх которой не видно ни числа, ни буквы.
 */
const STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, sans-serif; color: #000; margin: 24px; }
  h1 { font-size: 20pt; margin: 0 0 2px; }
  h2 { font-size: 13pt; margin: 20px 0 6px; }
  .track { margin: 0 0 12px; font-size: 11pt; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  .grid th { font-size: 9pt; font-weight: 600; padding: 4px 0; border-bottom: 1px solid #000; }
  .grid td { width: 14.28%; height: 62px; border: 1px solid #bbb; vertical-align: top; padding: 3px 4px; }
  .grid td.out { color: #999; border-color: #eee; }
  .num { font-size: 11pt; font-weight: 700; }
  .badge { font-size: 9pt; }
  .hours { font-size: 8pt; color: #333; }
  .dev { font-size: 8pt; font-weight: 700; }
  .totals td { padding: 4px 0; border-bottom: 1px solid #eee; font-size: 11pt; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .totals tr.sum td { border-top: 2px solid #000; border-bottom: none; font-size: 12pt; }
  .foot { margin-top: 18px; font-size: 8pt; color: #666; }
`;

/**
 * Экранирование: название смены человек пишет сам, и «<Ночь>» не должно
 * превращаться в сломанную разметку.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
