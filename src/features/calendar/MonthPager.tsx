import type { IsoDate } from '@/domain/date.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import type { MonthRef } from '@/domain/months.ts';
import { HorizontalPager } from '@/ui';
import { MonthGrid } from './MonthGrid.tsx';
import { gridMetrics } from './gridMetrics.ts';

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

/** Листание месяцев календаря: сетка на странице, высота фиксирована. */
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
  return (
    <HorizontalPager
      items={months}
      keyOf={(item) => item.period}
      index={index}
      onIndexChange={onIndexChange}
      width={width}
      height={gridMetrics(width).height}
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
