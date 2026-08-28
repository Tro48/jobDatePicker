import { shiftDurationMinutes } from './engine.ts';
import { formatDayShort, formatDurationSpoken, formatWeekdayName } from './format.ts';
import type { ResolvedDay } from './types.ts';

/**
 * Полное описание дня одной строкой для скринридера.
 *
 * Собирается целиком, а не по кускам: TalkBack читает клетку календаря как один
 * элемент, и разрозненные «17», «П» превращаются в бессмыслицу. Заливка и
 * буква-маркер при этом скрываются от озвучки.
 */
export function describeDay(day: ResolvedDay, options: { isToday?: boolean } = {}): string {
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
  }

  if (day.source === 'override') parts.push('изменено вручную');
  if (day.note) parts.push(day.note);

  return parts.join(', ');
}
