import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatDurationSpoken,
  formatMoney,
  formatMonthTitle,
  formatMinutesAsHoursInput,
  formatSignedMoney,
  formatSignedShifts,
  formatRussianDate,
  formatSignedTotalHours,
  formatTotalHours,
  parseAmount,
  parseHoursToMinutes,
  parseRussianDate,
  plural,
} from '../format.ts';

test('заголовок месяца в именительном падеже', () => {
  assert.equal(formatMonthTitle(2026, 9), 'Сентябрь 2026');
  assert.equal(formatMonthTitle(2027, 1), 'Январь 2027');
});

test('дата в родительном падеже', () => {
  assert.equal(formatDayShort('2026-09-17'), '17 сентября');
  assert.equal(formatDayShort('2026-05-01'), '1 мая');
  assert.equal(formatDayShort('2026-12-31'), '31 декабря');
});

test('заголовок дня с днём недели', () => {
  assert.equal(formatDayLong('2026-09-17'), 'Четверг, 17 сентября');
  assert.equal(formatDayLong('2026-08-30'), 'Воскресенье, 30 августа');
});

test('склонение числительных', () => {
  const forms = ['смена', 'смены', 'смен'] as const;
  assert.equal(plural(1, forms), 'смена');
  assert.equal(plural(2, forms), 'смены');
  assert.equal(plural(5, forms), 'смен');
  // Одиннадцать — исключение, не «одиннадцать смена».
  assert.equal(plural(11, forms), 'смен');
  assert.equal(plural(12, forms), 'смен');
  assert.equal(plural(21, forms), 'смена');
  assert.equal(plural(22, forms), 'смены');
  assert.equal(plural(25, forms), 'смен');
  assert.equal(plural(101, forms), 'смена');
  assert.equal(plural(111, forms), 'смен');
  assert.equal(plural(0, forms), 'смен');
});

test('длительность смены: число и единица не разрываются переносом', () => {
  assert.equal(formatDuration(12 * 60), '12\u00A0ч');
  assert.equal(formatDuration(7 * 60 + 30), '7\u00A0ч 30\u00A0мин');
  assert.equal(formatDuration(45), '45\u00A0мин');
  assert.equal(formatDuration(0), '—');
});

test('длительность для скринридера произносится словами', () => {
  assert.equal(formatDurationSpoken(12 * 60), '12 часов');
  assert.equal(formatDurationSpoken(60), '1 час');
  assert.equal(formatDurationSpoken(2 * 60), '2 часа');
  assert.equal(formatDurationSpoken(7 * 60 + 30), '7 часов 30 минут');
});

test('итог часов за месяц округляется до десятых', () => {
  assert.equal(formatTotalHours(172 * 60), '172\u00A0ч');
  assert.equal(formatTotalHours(172 * 60 + 30), '172,5\u00A0ч');
  assert.equal(formatTotalHours(0), '0\u00A0ч');
});

test('деньги с неразрывными пробелами между разрядами', () => {
  assert.equal(formatMoney(75000, '₽'), '75\u00A0000\u00A0₽');
  assert.equal(formatMoney(1234567, '₽'), '1\u00A0234\u00A0567\u00A0₽');
  assert.equal(formatMoney(999, '₽'), '999\u00A0₽');
  assert.equal(formatMoney(0, '₽'), '0\u00A0₽');
  // Обычный пробел здесь недопустим: сумма разорвалась бы по разрядам на узком экране.
  assert.ok(!formatMoney(75000, '₽').includes(' '));
});

test('ввод часов принимает и запятую, и точку', () => {
  assert.equal(parseHoursToMinutes('4'), 240);
  assert.equal(parseHoursToMinutes('4,5'), 270);
  assert.equal(parseHoursToMinutes('4.5'), 270);
  assert.equal(parseHoursToMinutes(' 12 '), 720);
  assert.equal(parseHoursToMinutes('24'), 1440);
});

test('мусор и выход за сутки во ввод часов не проходят', () => {
  assert.equal(parseHoursToMinutes(''), null);
  assert.equal(parseHoursToMinutes('-3'), null);
  assert.equal(parseHoursToMinutes('25'), null);
  assert.equal(parseHoursToMinutes('восемь'), null);
  assert.equal(parseHoursToMinutes('4:30'), null);
});

test('минуты разворачиваются обратно в строку поля ввода', () => {
  assert.equal(formatMinutesAsHoursInput(720), '12');
  assert.equal(formatMinutesAsHoursInput(450), '7,5');
  assert.equal(formatMinutesAsHoursInput(0), '0');
});

test('знаковые разницы используют типографский минус, а не дефис', () => {
  assert.equal(formatSignedTotalHours(9 * 60), '+9\u00A0ч');
  assert.equal(formatSignedTotalHours(-3 * 60 - 30), '\u22123,5\u00A0ч');
  assert.equal(formatSignedTotalHours(0), '0\u00A0ч');

  assert.equal(formatSignedMoney(4000, '₽'), '+4\u00A0000\u00A0₽');
  assert.equal(formatSignedMoney(-1200, '₽'), '\u22121\u00A0200\u00A0₽');
  assert.equal(formatSignedMoney(0, '₽'), '0\u00A0₽');

  assert.equal(formatSignedShifts(2), '+2 смены');
  assert.equal(formatSignedShifts(-1), '\u22121 смена');
  assert.equal(formatSignedShifts(0), '0 смен');

  // Дефис-минус в выводе недопустим.
  assert.ok(!formatSignedTotalHours(-5 * 60).includes('-'));
  assert.ok(!formatSignedMoney(-500, '₽').includes('-'));
});

test('дата в поле ввода в привычном порядке', () => {
  assert.equal(formatRussianDate('2026-08-27'), '27.08.2026');
  assert.equal(formatRussianDate('2026-01-05'), '05.01.2026');
});

test('разбор даты принимает и однозначный день', () => {
  assert.equal(parseRussianDate('27.08.2026'), '2026-08-27');
  assert.equal(parseRussianDate('5.1.2026'), '2026-01-05');
  assert.equal(parseRussianDate(' 29.02.2028 '), '2028-02-29');
});

test('несуществующие даты не проходят, а не превращаются в соседние', () => {
  assert.equal(parseRussianDate('31.02.2026'), null); // Date сам сделал бы из этого 3 марта
  assert.equal(parseRussianDate('29.02.2027'), null); // 2027 не високосный
  assert.equal(parseRussianDate('00.01.2026'), null);
  assert.equal(parseRussianDate('01.13.2026'), null);
  assert.equal(parseRussianDate('2026-08-27'), null);
  assert.equal(parseRussianDate(''), null);
});

test('сумма принимается в том виде, в каком её копируют из банка', () => {
  assert.equal(parseAmount('30000'), 30000);
  assert.equal(parseAmount('30 000'), 30000);
  assert.equal(parseAmount('30\u00A0000'), 30000);
  assert.equal(parseAmount('30000,50'), 30001); // копейки округляются
  assert.equal(parseAmount('0'), 0);
});

test('мусор вместо суммы не проходит', () => {
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('-500'), null);
  assert.equal(parseAmount('тридцать тысяч'), null);
  assert.equal(parseAmount('30 000 ₽'), null);
});
