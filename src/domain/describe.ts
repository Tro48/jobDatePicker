import { overtimeMinutes, shiftDurationMinutes } from './engine.ts';
import { weekday } from './date.ts';
import type { IsoDate } from './date.ts';
import {
  formatDayShort,
  formatDurationSpoken,
  formatOvertimeSpoken,
  formatWeekdayName,
} from './format.ts';
import type { Period } from './payday.ts';
import type { ResolvedDay } from './types.ts';

/**
 * Чем подписать месяц, задетый датой первой смены, — или null, если он весь
 * после неё и подписывать нечего.
 *
 * Одна формулировка на календарь и на сводку: оба показывают числа за месяц, и
 * расходиться в объяснении, почему их меньше обычного, им нельзя. Без подписи
 * месяц до первой смены — это полная сетка смен и ноль часов под ней, то есть
 * с виду поломка.
 */
export function describeScheduleStart(period: Period, startsAt: IsoDate): string | null {
  const startPeriod = startsAt.slice(0, 7);

  if (period < startPeriod) {
    return `Работа начинается ${formatDayShort(startsAt)}: в этом месяце смен ещё не было.`;
  }
  if (period === startPeriod && startsAt.slice(8) !== '01') {
    return `Считается с ${formatDayShort(startsAt)} — дня первой смены.`;
  }
  return null;
}

/**
 * День, на который графика ещё нет: базовый календарь.
 *
 * Отдельно от describeDay, потому что смены у такого дня нет — есть только
 * день недели. Заглушка-выходной, которой его заполняет движок, здесь не
 * озвучивается: сказать про вторник «выходной» значило бы соврать.
 */
export function describeBaseDay(
  date: IsoDate,
  options: { isToday?: boolean; holiday?: string } = {},
): string {
  const parts: string[] = [formatDayShort(date), formatWeekdayName(date)];

  if (options.isToday) parts.push('сегодня');

  // Праздник говорит о дне больше, чем «будний» или «выходной»: 1 января —
  // четверг, но называть его будним днём значит спорить с календарём. Заодно
  // это снимает вопрос про рабочие субботы по переносу: у них своё название.
  if (options.holiday) parts.push(options.holiday.toLowerCase());
  else parts.push(isWeekend(date) ? 'выходной' : 'будний день');

  parts.push('графика ещё нет');

  return parts.join(', ');
}

/** Суббота или воскресенье: базовый календарь красит их как выходные. */
export function isWeekend(date: IsoDate): boolean {
  return weekday(date) >= 6;
}

/**
 * Полное описание дня одной строкой для скринридера.
 *
 * Собирается целиком, а не по кускам: TalkBack читает клетку календаря как один
 * элемент, и разрозненные «17», «П» превращаются в бессмыслицу. Заливка и
 * буква-маркер при этом скрываются от озвучки.
 */
export function describeDay(
  day: ResolvedDay,
  options: {
    isToday?: boolean;
    isWorked?: boolean;
    isShared?: boolean;
    /** С кем совпал выходной: «Аня», «друзья». */
    sharedWith?: string;
    /** Заметки этого дня одной строкой. Живут отдельно от графика. */
    note?: string;
    /** В этот день записана выплата. В клетке она помечена значком. */
    hasPayment?: boolean;
  } = {},
): string {
  const parts: string[] = [formatDayShort(day.date), formatWeekdayName(day.date)];

  if (options.isToday) parts.push('сегодня');

  // Праздник называется сразу после даты: в клетке он отмечен значком, а
  // значок скринридеру не виден.
  if (day.holiday) parts.push(day.holiday.toLowerCase());

  parts.push(day.shiftType.name.toLowerCase());

  if (day.shiftType.kind === 'work') {
    const planned = shiftDurationMinutes(day.shiftType);
    const time = day.shiftType.time;
    // Время смены озвучивается только если часы не переопределены вручную:
    // иначе получится «с 08:00 до 20:00, 4 часа» — противоречие.
    if (time && day.workedMinutes === planned) {
      parts.push(`с ${time.start} до ${time.end}`);
    }
    const spoken = formatDurationSpoken(day.workedMinutes);
    if (spoken) parts.push(spoken);

    // Приглушённая клетка и цифра отклонения в углу — визуальные подсказки;
    // словами их говорит только эта строка. Часы сверх пустого графика второй
    // раз числом не называются: они уже прозвучали как длительность дня.
    if (options.isWorked) parts.push('отработано');
    if (day.plannedMinutes === 0) {
      parts.push('сверх графика');
    } else {
      const deviation = formatOvertimeSpoken(overtimeMinutes(day));
      if (deviation) parts.push(deviation);
    }
  } else {
    // Выходной вместо смены из графика — та же недоработка, что и укороченная
    // смена, и в клетке он получает такую же точку. Молчать про неё нельзя:
    // цвет точки скринридеру недоступен.
    const deviation = formatOvertimeSpoken(overtimeMinutes(day));
    if (deviation) parts.push(deviation);
  }

  // Отметка общего выходного в клетке — полоска, то есть чистая форма. Словами
  // её говорит только эта строка, и с именем: при двух чужих графиках «общий
  // выходной» без имени не отвечает на вопрос, чей это день.
  if (options.isShared) {
    parts.push(options.sharedWith ? `общий выходной с: ${options.sharedWith}` : 'общий выходной');
  }

  if (day.source === 'override') parts.push('изменено вручную');
  // Значки заметки и выплаты в углах клетки скринридеру не видны, поэтому обе
  // вещи называются словами. Заметка — своим текстом: пересказывать её
  // «есть заметка» значит заставить открыть день, чтобы узнать, о чём она.
  if (options.hasPayment) parts.push('есть выплата');
  if (options.note) parts.push(options.note);

  return parts.join(', ');
}
