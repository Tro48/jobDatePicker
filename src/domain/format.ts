import { weekday } from './date.ts';
import type { IsoDate } from './date.ts';

/**
 * Форматирование на русском.
 *
 * Названия месяцев и дней недели заданы списками, а не берутся из Intl:
 * приложение одноязычное, а поведение Intl в Hermes зависит от версии Android
 * и его ICU. Списки из двенадцати строк надёжнее и проверяются тестами.
 */
const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

/** Родительный падеж — для дат вида «17 сентября». */
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const WEEKDAYS_FULL = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
];

export const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

/** «Сентябрь 2026» — заголовок месяца. */
export function formatMonthTitle(year: number, month: number): string {
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

/** «17 сентября» */
export function formatDayShort(date: IsoDate): string {
  const day = Number(date.slice(8, 10));
  const month = Number(date.slice(5, 7));
  return `${day} ${MONTHS_GENITIVE[month - 1]}`;
}

/** «Четверг, 17 сентября» — заголовок карточки дня. */
export function formatDayLong(date: IsoDate): string {
  const name = WEEKDAYS_FULL[weekday(date) - 1];
  return `${name[0].toUpperCase()}${name.slice(1)}, ${formatDayShort(date)}`;
}

/** «четверг» — для озвучки клетки календаря. */
export function formatWeekdayName(date: IsoDate): string {
  return WEEKDAYS_FULL[weekday(date) - 1];
}

/**
 * Склонение существительного при числительном.
 * forms: [1 смена, 2 смены, 5 смен]
 */
export function plural(count: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export function pluralize(count: number, forms: readonly [string, string, string]): string {
  return `${count} ${plural(count, forms)}`;
}

export const SHIFT_FORMS = ['смена', 'смены', 'смен'] as const;
export const DAY_FORMS = ['день', 'дня', 'дней'] as const;
export const HOUR_FORMS = ['час', 'часа', 'часов'] as const;

/** Длительность одной смены: «12 ч», «7 ч 30 мин», «45 мин». */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}\u00A0мин`;
  return rest === 0 ? `${hours}\u00A0ч` : `${hours}\u00A0ч ${rest}\u00A0мин`;
}

/** Итог за месяц: «172 ч», «172,5 ч». */
export function formatTotalHours(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded}\u00A0ч`
    : `${rounded.toFixed(1).replace('.', ',')}\u00A0ч`;
}

/** Длительность для скринридера: «12 часов», «7 часов 30 минут». */
export function formatDurationSpoken(minutes: number): string {
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(pluralize(hours, HOUR_FORMS));
  if (rest > 0) parts.push(pluralize(rest, ['минута', 'минуты', 'минут']));
  return parts.join(' ');
}

/**
 * Денежная сумма с неразрывными пробелами между разрядами: «75 000 ₽».
 * Дроби отбрасываются: суммы вносятся руками и в копейках не нужны.
 */
export function formatMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '−' : '';
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${sign}${grouped}\u00A0${currency}`;
}

/** Диапазон времени смены: «08:00 – 20:00». */
export function formatTimeRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

/**
 * Часы, введённые руками, в минуты. Принимает и запятую, и точку — на русской
 * раскладке цифровой клавиатуры Android разделитель запятая.
 *
 * Возвращает null для пустой строки и мусора: вызывающий сам решает, оставить
 * прежнее значение или показать ошибку.
 */
export function parseHoursToMinutes(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(normalized)) return null;
  const hours = Number(normalized);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) return null;
  return Math.round(hours * 60);
}

/** Минуты в строку для поля ввода: 450 → «7,5», 720 → «12». */
export function formatMinutesAsHoursInput(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return Number.isInteger(hours) ? String(hours) : String(hours).replace('.', ',');
}

/**
 * Знаковая разница часов для сравнения с прошлым месяцем: «+9 ч», «−3,5 ч».
 * Минус — типографский U+2212, а не дефис: в дефисе цифра и знак сливаются.
 */
export function formatSignedTotalHours(minutes: number): string {
  if (minutes === 0) return `0\u00A0ч`;
  const sign = minutes > 0 ? '+' : '\u2212';
  return `${sign}${formatTotalHours(Math.abs(minutes))}`;
}

/** Знаковая разница сумм: «+4 000 ₽», «−1 200 ₽». */
export function formatSignedMoney(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return formatMoney(0, currency);
  const sign = rounded > 0 ? '+' : '\u2212';
  return `${sign}${formatMoney(Math.abs(rounded), currency)}`;
}

/** Знаковая разница смен: «+2 смены», «−1 смена». */
export function formatSignedShifts(count: number): string {
  if (count === 0) return pluralize(0, SHIFT_FORMS);
  const sign = count > 0 ? '+' : '\u2212';
  return `${sign}${pluralize(Math.abs(count), SHIFT_FORMS)}`;
}

/** Дата в привычном виде для поля ввода: 2026-08-27 → «27.08.2026». */
export function formatRussianDate(date: IsoDate): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}

/**
 * Разбор даты из поля ввода. Возвращает null на мусоре и на несуществующих
 * датах вроде 31.02 — проверка идёт обратной сборкой, а не регуляркой:
 * Date сам нормализует 31 февраля в 3 марта, и это надо поймать.
 */
export function parseRussianDate(text: string): IsoDate | null {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso: IsoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCDate() === day && check.getUTCMonth() === month - 1 ? iso : null;
}

/**
 * Разбор денежной суммы. Принимает пробелы и неразрывные пробелы между
 * разрядами — пользователь может вставить сумму из банковского приложения
 * прямо в поле. Копейки отбрасываются: приложение считает в рублях.
 */
export function parseAmount(text: string): number | null {
  const normalized = text.replace(/[\s\u00A0]/g, '').replace(',', '.');
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value) : null;
}
