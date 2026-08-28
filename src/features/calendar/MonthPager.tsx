import { useEffect, useRef } from 'react';
import { FlatList } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { IsoDate } from '@/domain/date.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { shiftPeriod } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import { useReduceMotion } from '@/ui';
import { MonthGrid } from './MonthGrid.tsx';
import { gridMetrics } from './gridMetrics.ts';

export interface MonthRef {
  period: Period;
  year: number;
  month: number;
}

/** Сколько месяцев доступно листанием в каждую сторону. */
export const MONTH_RANGE = 18;

export function buildMonthWindow(center: Period, range = MONTH_RANGE): MonthRef[] {
  return Array.from({ length: range * 2 + 1 }, (_, index) => {
    const period = shiftPeriod(center, index - range);
    return { period, year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
  });
}

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
 * Горизонтальное листание месяцев.
 *
 * Индексом владеет родитель: то же значение двигают и свайп, и стрелки в шапке.
 * Стрелки обязательны — свайп недоступен ни с клавиатуры, ни через TalkBack.
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
  const listRef = useRef<FlatList<MonthRef>>(null);
  const currentIndex = useRef(index);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (currentIndex.current === index) return;
    currentIndex.current = index;
    listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
  }, [index, reduceMotion]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next === currentIndex.current) return;
    currentIndex.current = next;
    onIndexChange(next);
  };

  return (
    <FlatList
      ref={listRef}
      data={months}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.period}
      initialScrollIndex={index}
      style={{ width, height: gridMetrics(width).height }}
      // Без getItemLayout initialScrollIndex промахивается: FlatList не знает
      // ширину ещё не отрисованных страниц.
      getItemLayout={(_, itemIndex) => ({
        length: width,
        offset: width * itemIndex,
        index: itemIndex,
      })}
      onMomentumScrollEnd={handleMomentumEnd}
      // Окно рендера узкое намеренно: каждая страница это 42 клетки, и держать
      // в памяти десятки месяцев незачем.
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      removeClippedSubviews
      renderItem={({ item }) => (
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
