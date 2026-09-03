import { overtimeMinutes, shiftDurationMinutes } from './engine.ts';
import {
  formatDayShort,
  formatDurationSpoken,
  formatOvertimeSpoken,
  formatWeekdayName,
} from './format.ts';
import type { ResolvedDay } from './types.ts';

/**
 * Полное описание дня одной строкой для скринридера.
 *
 * Собирается целиком, а не по кускам: TalkBack читает клетку календаря как один
 * элемент, и разрозненные «17», «П» превращаются в бессмыслицу. Заливка и
 * буква-маркер при этом скрываются от озвучки.
 */
export function describeDay(
  day: ResolvedDay,
  options: { isToday?: boolean; isWorked?: boolean; isShared?: boolean } = {},
): string {
  const parts: string[] = [formatDayShort(day.date), formatWeekdayName(day.date)];

  if (options.isToday) parts.push('сегодня');

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

  // Отметка общего выходного в клетке — кольцо, то есть чистая форма. Словами
  // её говорит только эта строка.
  if (options.isShared) parts.push('общий выходной');

  if (day.source === 'override') parts.push('изменено вручную');
  if (day.note) parts.push(day.note);

  return parts.join(', ');
}
