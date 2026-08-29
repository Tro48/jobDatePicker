import { monthGridRows } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import type { MonthRef } from '@/domain/months.ts';
import { HorizontalPager } from '@/ui';
import { MonthGrid } from './MonthGrid.tsx';
import { gridHeight } from './gridMetrics.ts';

export interface MonthPagerProps {
  months: MonthRef[];
  index: number;
  onIndexChange: (index: number) => void;
  context: ScheduleContext;
  today: IsoDate;
  selectedDate?: IsoDate;
  onSelectDay: (date: IsoDate) => void;
  width: number;
}

/**
 * Листание месяцев календаря: сетка на странице.
 *
 * Высота — по месяцу, который сейчас открыт: у месяца может быть четыре
 * недели, пять или шесть, и держать под февралём две пустые строки незачем.
 */
export function MonthPager({
  months,
  index,
  onIndexChange,
  context,
  today,
  selectedDate,
  onSelectDay,
  width,
}: MonthPagerProps) {
  // Индекс двигают и свайп, и стрелки в шапке — за границы он не уходит,
  // но высота страницы не то место, где стоит падать.
  const visible = months[index] ?? months[0];

  return (
    <HorizontalPager
      items={months}
      keyOf={(item) => item.period}
      index={index}
      onIndexChange={onIndexChange}
      width={width}
      height={gridHeight(width, monthGridRows(visible.year, visible.month))}
      renderPage={(item) => (
        <MonthGrid
          year={item.year}
          month={item.month}
          context={context}
          today={today}
          selectedDate={selectedDate}
          width={width}
          onSelectDay={onSelectDay}
        />
      )}
    />
  );
}
