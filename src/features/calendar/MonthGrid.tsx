import { useMemo } from 'react';
import { View } from 'react-native';
import { monthGridDates } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveDay } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { WEEKDAYS_SHORT, formatMonthTitle } from '@/domain/format.ts';
import { AppText } from '@/ui';
import { useTheme } from '@/theme';
import { DayCell } from './DayCell.tsx';
import { GRID_GAP, gridMetrics } from './gridMetrics.ts';

export interface MonthGridProps {
  year: number;
  month: number;
  context: ScheduleContext;
  today: IsoDate;
  selectedDate?: IsoDate;
  width: number;
  onSelectDay: (date: IsoDate) => void;
}

export function MonthGrid({
  year,
  month,
  context,
  today,
  selectedDate,
  width,
  onSelectDay,
}: MonthGridProps) {
  const { cellSize, gridWidth } = gridMetrics(width);

  const days = useMemo(() => {
    // Сетка всегда 42 дня: хвосты соседних месяцев показываются как контекст,
    // чтобы было видно, как смены переходят через границу месяца.
    return monthGridDates(year, month).map((cell) => ({
      ...cell,
      resolved: resolveDay(context, cell.date),
    }));
  }, [year, month, context]);

  return (
    <View style={{ width, alignItems: 'center' }}>
      <View
        accessibilityRole="list"
        accessibilityLabel={formatMonthTitle(year, month)}
        style={{ width: gridWidth, flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}
      >
        {days.map((cell) => (
          <DayCell
            key={cell.date}
            day={cell.resolved}
            size={cellSize}
            inMonth={cell.inMonth}
            isToday={cell.date === today}
            isSelected={cell.date === selectedDate}
            onPress={onSelectDay}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Шапка с днями недели. Скрыта от скринридера: каждая клетка и так называет
 * свой день недели, а «пн вт ср чт пт сб вс» перед сеткой только мешает.
 */
export function WeekdayHeader({ width }: { width: number }) {
  const theme = useTheme();
  const { cellSize, gridWidth } = gridMetrics(width);

  return (
    <View style={{ width, alignItems: 'center' }}>
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          width: gridWidth,
          flexDirection: 'row',
          gap: GRID_GAP,
          marginBottom: theme.spacing.xs,
        }}
      >
        {WEEKDAYS_SHORT.map((name, index) => (
          <AppText
            key={name}
            variant="caption"
            tone={index >= 5 ? 'muted' : 'default'}
            maxFontSizeMultiplier={1.3}
            style={{ width: cellSize, textAlign: 'center' }}
          >
            {name}
          </AppText>
        ))}
      </View>
    </View>
  );
}
