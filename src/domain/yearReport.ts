import { formatMoney, formatMonthName, pluralize } from './format.ts';
import { reportPage } from './reportHtml.ts';
import type { MonthMoney } from './summary.ts';

const MONTH_FORMS = ['месяц', 'месяца', 'месяцев'] as const;

/**
 * Год одной страницей: сколько пришло за каждый месяц и сколько вышло всего.
 *
 * Считается по тем же выплатам, что и экран года, и печатает ровно то, что на
 * нём видно, — двум местам с одними и теми же деньгами расходиться нельзя.
 * Просят это для банка и для собственного учёта, поэтому отпускные и
 * больничные показаны отдельной колонкой: в сумму года они входят, а часами
 * не заработаны.
 */
export interface YearReportInput {
  year: number;
  /** Суммы по месяцам — результат yearlyPaymentTotals. */
  months: MonthMoney[];
  currency: string;
  /** Имя работы. Пусто — работа одна, и подписывать её незачем. */
  trackName?: string;
}

export function buildYearReportHtml({
  year,
  months,
  currency,
  trackName,
}: YearReportInput): string {
  const total = months.reduce((sum, item) => sum + item.total, 0);
  const compensation = months.reduce((sum, item) => sum + item.compensation, 0);
  const paidMonths = months.filter((item) => item.total > 0).length;

  const rows = months
    .map((item) => {
      // Прочерк, а не ноль: за месяц просто ещё не внесено ни одной выплаты,
      // и «0 ₽» прочитался бы как «не заплатили».
      const value = item.total > 0 ? formatMoney(item.total, currency) : '—';
      const extra = item.compensation > 0 ? formatMoney(item.compensation, currency) : '';

      return `<tr><td>${formatMonthName(item.month)}</td><td>${extra}</td><td>${value}</td></tr>`;
    })
    .join('');

  const body = `
  <h2>По месяцам</h2>
  <table class="totals">
    <tbody>
      ${rows}
      ${total > 0 ? `<tr class="sum"><td>Всего за год</td><td></td><td>${formatMoney(total, currency)}</td></tr>` : ''}
    </tbody>
  </table>

  ${
    total > 0
      ? `<h2>Итого</h2>
  <table class="totals">
    <tbody>
      <tr><td>Выплаты внесены за</td><td></td><td>${pluralize(paidMonths, MONTH_FORMS)}</td></tr>
      <tr><td>В среднем в месяц</td><td></td><td>${formatMoney(total / paidMonths, currency)}</td></tr>
      ${compensation > 0 ? `<tr><td>Отпускные и больничные</td><td></td><td>${formatMoney(compensation, currency)}</td></tr>` : ''}
    </tbody>
  </table>`
      : '<p>За год выплат не внесено.</p>'
  }`;

  const footer =
    'Смены · суммы, внесённые вручную. Месяц выплаты — тот, ЗА который она пришла, а не дата поступления: аванс за сентябрь остаётся сентябрьским, даже если пришёл 27 августа.' +
    (compensation > 0 ? ' Средняя колонка — отпускные и больничные внутри суммы месяца.' : '');

  return reportPage({ title: `${year} год`, trackName, body, footer });
}
