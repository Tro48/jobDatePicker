import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthReportHtml } from '../monthReport.ts';
import { buildMonthSummary } from '../summary.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import type { PaymentRecord } from '../types.ts';

const context: ScheduleContext = {
  schedules: [
    {
      presetId: '2-2-day',
      pattern: SCHEDULE_PRESETS.find((preset) => preset.id === '2-2-day')!.pattern,
      anchorDate: '2026-09-01',
      startsOn: '2026-09-01',
    },
  ],
  shiftTypes: indexShiftTypes(DEFAULT_SHIFT_TYPES),
  overrides: new Map([['2026-09-05', { date: '2026-09-05', workedMinutesOverride: 14 * 60 }]]),
};

const payments: PaymentRecord[] = [
  {
    id: 'p1',
    trackId: 'main',
    kind: 'salary',
    period: '2026-09',
    receivedOn: '2026-10-10',
    amount: 75_000,
  },
];

function reportOf(trackName?: string): string {
  const summary = buildMonthSummary(context, '2026-09', payments, '2026-12-31');
  return buildMonthReportHtml({
    period: '2026-09',
    context,
    summary,
    trackName,
    currency: '₽',
  });
}

test('в отчёте есть месяц, все дни сетки и итоги', () => {
  const html = reportOf();

  assert.match(html, /Сентябрь 2026/);
  // Сетка сентября 2026 года — пять недель, то есть тридцать пять клеток.
  assert.equal((html.match(/<td class="(in|out)"/g) ?? []).length, 35);
  assert.match(html, /Отработано/);
  // Неразрывные пробелы в сумме — часть формата, поэтому в шаблоне они явные.
  assert.match(html, /75\u00A0000\u00A0₽/);
});

test('отклонение от графика в отчёте есть: ради него табель и сверяют', () => {
  const html = reportOf();
  // Пятого сентября вместо двенадцати часов отработано четырнадцать.
  assert.match(html, /\+2\u00A0ч/);
});

test('имя работы попадает в отчёт, только когда его передали', () => {
  assert.match(reportOf('Склад'), /Склад/);
  assert.doesNotMatch(reportOf(), /class="track"/);
});

test('название смены не ломает разметку', () => {
  const evil = new Map(context.shiftTypes);
  evil.set('day12', { ...evil.get('day12')!, name: '<b>Ночь</b>', badge: '<Д>' });

  const summary = buildMonthSummary({ ...context, shiftTypes: evil }, '2026-09', [], '2026-12-31');
  const html = buildMonthReportHtml({
    period: '2026-09',
    context: { ...context, shiftTypes: evil },
    summary,
    currency: '₽',
  });

  assert.match(html, /&lt;b&gt;Ночь&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Ночь<\/b>/);
});

test('в незакрытом месяце отработано — это факт, а не весь график', () => {
  // Седьмое сентября: позади четыре смены из шестнадцати за месяц.
  const summary = buildMonthSummary(context, '2026-09', [], '2026-09-07');
  const html = buildMonthReportHtml({ period: '2026-09', context, summary, currency: '\u20BD' });

  assert.match(html, /<td>Отработано<\/td><td><\/td><td>50\u00A0ч из 194\u00A0ч<\/td>/);
  assert.match(html, /<td>Смен<\/td><td><\/td><td>4 из 16 смен<\/td>/);
  // И сказано, почему числа идут парой: иначе «50 ч из 194 ч» читается как ошибка.
  assert.match(html, /Месяц ещё идёт/);
});

test('в закрытом месяце числа не дробятся', () => {
  const summary = buildMonthSummary(context, '2026-09', [], '2026-12-31');
  const html = buildMonthReportHtml({ period: '2026-09', context, summary, currency: '\u20BD' });

  assert.match(html, /<td>Отработано<\/td><td><\/td><td>194\u00A0ч<\/td>/);
  assert.match(html, /<td>Смен<\/td><td><\/td><td>16 смен<\/td>/);
  assert.doesNotMatch(html, /Месяц ещё идёт/);
});
