import test from 'node:test';
import assert from 'node:assert/strict';
import { yearlyPaymentTotals } from '../summary.ts';
import { buildYearReportHtml } from '../yearReport.ts';
import type { PaymentRecord } from '../types.ts';

const payments: PaymentRecord[] = [
  {
    id: 'p1',
    trackId: 'main',
    kind: 'salary',
    period: '2026-01',
    receivedOn: '2026-02-10',
    amount: 60_000,
  },
  {
    id: 'p2',
    trackId: 'main',
    kind: 'advance',
    period: '2026-02',
    receivedOn: '2026-02-25',
    amount: 30_000,
  },
  {
    id: 'p3',
    trackId: 'main',
    kind: 'vacationPay',
    period: '2026-02',
    receivedOn: '2026-02-20',
    amount: 10_000,
  },
];

function reportOf(trackName?: string): string {
  return buildYearReportHtml({
    year: 2026,
    months: yearlyPaymentTotals(payments, 2026),
    currency: '₽',
    trackName,
  });
}

test('в годовом отчёте есть все двенадцать месяцев и сумма за год', () => {
  const html = reportOf();

  assert.match(html, /2026 год/);
  assert.match(html, /Январь/);
  assert.match(html, /Декабрь/);
  // Неразрывные пробелы в сумме — часть формата, поэтому в шаблоне они явные.
  assert.match(html, /100\u00A0000\u00A0₽/);
});

test('месяц без выплат печатается прочерком, а не нулём', () => {
  const html = reportOf();
  const march = html.slice(html.indexOf('Март'), html.indexOf('Апрель'));

  assert.match(march, /—/);
  assert.doesNotMatch(march, /0\u00A0₽/);
});

test('отпускные показаны отдельно: в сумму года входят, часами не заработаны', () => {
  const html = reportOf();

  assert.match(html, /Отпускные и больничные/);
  assert.match(html, /10\u00A0000\u00A0₽/);
});

test('имя работы подписывается, когда его передали, и не выдумывается иначе', () => {
  assert.match(reportOf('Склад'), /Склад/);
  assert.doesNotMatch(reportOf(), /class="track"/);
});

test('пустой год не врёт средним значением', () => {
  const html = buildYearReportHtml({
    year: 2025,
    months: yearlyPaymentTotals(payments, 2025),
    currency: '₽',
  });

  assert.match(html, /За год выплат не внесено/);
  assert.doesNotMatch(html, /В среднем/);
});
