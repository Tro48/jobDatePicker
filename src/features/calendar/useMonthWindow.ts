import { useCallback, useMemo, useState } from 'react';
import type { IsoDate } from '@/domain/date.ts';
import { MONTH_RANGE, buildMonthWindow } from '@/domain/months.ts';
import type { MonthRef } from '@/domain/months.ts';
import { periodOf } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';

export interface MonthWindow {
  /** Месяцы, доступные свайпом прямо сейчас, по возрастанию. */
  months: MonthRef[];
  /** Открытый месяц: его индекс в окне. */
  index: number;
  visible: MonthRef;
  /** Листание свайпом и стрелками — внутри окна. */
  setIndex: (index: number) => void;
  /** Переезд на любой месяц: за краем окна оно пересобирается вокруг него. */
  goTo: (period: Period) => void;
  /**
   * Чем помечать пейджер, чтобы он пересоздался вместе с окном.
   *
   * Пересборка окна меняет все страницы разом, и доводить список до нужной
   * страницы прокруткой нельзя: FlatList поедет через десяток чужих месяцев.
   */
  key: Period;
}

/**
 * Окно месяцев под пейджером: что листается свайпом и как уехать за его край.
 *
 * Свайпом ходят по готовому окну в 37 месяцев — держать в памяти всё
 * приложение незачем. Выбор месяца и года окном не ограничен: указали август
 * 2031-го — окно пересобирается вокруг него, и дальше от него же и листается.
 *
 * Общий на календарь и сводку: расходиться в том, какие месяцы им доступны и
 * как по ним ходят, этим двум экранам нельзя.
 */
export function useMonthWindow(today: IsoDate): MonthWindow {
  const [center, setCenter] = useState<Period>(() => periodOf(today));
  const [index, setIndex] = useState(MONTH_RANGE);

  const months = useMemo(() => buildMonthWindow(center), [center]);

  const goTo = useCallback(
    (period: Period) => {
      const inWindow = months.findIndex((item) => item.period === period);
      if (inWindow >= 0) {
        setIndex(inWindow);
        return;
      }
      // Окно строится вокруг выбранного месяца: соседи справа и слева нужны
      // ему ровно так же, как сегодняшнему.
      setCenter(period);
      setIndex(MONTH_RANGE);
    },
    [months],
  );

  // Индекс за границами окна не живёт: пересборка ставит его в середину, а
  // свайп и стрелки дальше краёв не ходят.
  return { months, index, visible: months[index], setIndex, goTo, key: center };
}
