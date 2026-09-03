import { startTransition, useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
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
  /** Выделенные дни. undefined — сетка обычная. */
  highlighted?: Set<IsoDate>;
  onSelectDay: (date: IsoDate) => void;
  width: number;
}

/** Ключ страницы. Вне компонента — чтобы пейджер получал одну и ту же функцию. */
const keyOfMonth = (item: MonthRef): string => item.period;

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
  highlighted,
  onSelectDay,
  width,
}: MonthPagerProps) {
  // Индекс двигают и свайп, и стрелки в шапке — за границы он не уходит,
  // но высота страницы не то место, где стоит падать.
  const visible = months[index] ?? months[0];

  /**
   * График, по которому нарисованы месяцы, которых сейчас не видно.
   *
   * Пейджер держит в памяти четыре сетки: открытый месяц и три соседних,
   * готовых к свайпу. Рисовать их все разом незачем — на экране один месяц, а
   * платит человек за четыре. Открытый месяц берёт график сразу, соседние
   * догоняют следующим кадром и уже переходом: React рисует их в фоне и
   * уступает поток, пока рисует.
   *
   * null — соседей ещё не рисовали ни разу: так открывается экран, и вместо
   * сеток там стоят пустые страницы нужного размера. Дальше значение уже не
   * пустует, и при смене графика соседи показывают прежний график, пока не
   * догонят, — это лучше пустоты под пальцем на свайпе.
   *
   * В покое оно совпадает с открытым месяцем, поэтому листание ничего не
   * пересчитывает: сетки отсекаются мемоизацией по одинаковым пропсам.
   */
  const [background, setBackground] = useState<ScheduleContext | null>(null);

  useEffect(() => {
    if (background === context) return;
    // Кадр отдаётся открытому месяцу: без него фоновая отрисовка успевает
    // влезть в тот же кадр и съедает весь выигрыш.
    const frame = requestAnimationFrame(() => {
      startTransition(() => setBackground(context));
    });
    return () => cancelAnimationFrame(frame);
  }, [context, background]);

  /**
   * Намеренно не зависит от индекса как от числа: страница считает свой месяц
   * по item. Открытый месяц узнаётся по периоду — только чтобы отличить его от
   * фоновых, которые ждут перехода.
   */
  const renderPage = useCallback(
    (item: MonthRef) => {
      const shown = item.period === visible.period ? context : background;

      // Соседний месяц до своей очереди — пустая страница ровно своей высоты:
      // иначе пейджер съедет, а высота считается по числу недель в месяце.
      if (!shown) {
        return (
          <View
            importantForAccessibility="no-hide-descendants"
            style={{ width, height: gridHeight(width, monthGridRows(item.year, item.month)) }}
          />
        );
      }

      return (
        <MonthGrid
          year={item.year}
          month={item.month}
          context={shown}
          today={today}
          selectedDate={selectedDate}
          highlighted={highlighted}
          width={width}
          onSelectDay={onSelectDay}
        />
      );
    },
    [context, background, visible.period, today, selectedDate, highlighted, width, onSelectDay],
  );

  return (
    <HorizontalPager
      items={months}
      keyOf={keyOfMonth}
      index={index}
      onIndexChange={onIndexChange}
      width={width}
      height={gridHeight(width, monthGridRows(visible.year, visible.month))}
      renderPage={renderPage}
    />
  );
}
