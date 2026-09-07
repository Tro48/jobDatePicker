/**
 * Общее для печатных отчётов: обёртка страницы, стили и экранирование.
 *
 * Отчётов два — месяц и год, — и расходиться в оформлении им нельзя: их
 * распечатывают и кладут рядом. Поэтому шапка, таблица итогов и подпись внизу
 * описаны здесь один раз, а каждый отчёт добавляет только своё.
 */

export interface ReportPageInput {
  /** Заголовок страницы и документа: «Сентябрь 2026», «2026 год». */
  title: string;
  /** Имя работы. Пусто — работа одна, и подписывать её незачем. */
  trackName?: string;
  /** Тело отчёта: уже собранная разметка. */
  body: string;
  /** Подпись внизу страницы — чем это посчитано. */
  footer: string;
  /** Стили сверх общих: сетка месяца нужна только месячному отчёту. */
  extraStyles?: string;
}

/** Готовая HTML-страница отчёта — то, что принимает системный движок печати. */
export function reportPage({
  title,
  trackName,
  body,
  footer,
  extraStyles = '',
}: ReportPageInput): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${BASE_STYLES}${extraStyles}</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${trackName ? `<p class="track">${escapeHtml(trackName)}</p>` : ''}
  ${body}
  <p class="foot">${footer}</p>
</body>
</html>`;
}

/**
 * Стили печати. Чёрным по белому и без единого цвета смены: печатают такое
 * на обычном принтере, а цветная заливка на нём превращается в серую кашу,
 * поверх которой не видно ни числа, ни буквы.
 */
const BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, sans-serif; color: #000; margin: 24px; }
  h1 { font-size: 20pt; margin: 0 0 2px; }
  h2 { font-size: 13pt; margin: 20px 0 6px; }
  .track { margin: 0 0 12px; font-size: 11pt; color: #444; }
  table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 4px 0; border-bottom: 1px solid #eee; font-size: 11pt; }
  .totals td:last-child { text-align: right; font-weight: 600; }
  .totals tr.sum td { border-top: 2px solid #000; border-bottom: none; font-size: 12pt; }
  .totals tr.now td { font-weight: 700; }
  .foot { margin-top: 18px; font-size: 8pt; color: #666; }
`;

/**
 * Экранирование: название смены человек пишет сам, и «<Ночь>» не должно
 * превращаться в сломанную разметку.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
