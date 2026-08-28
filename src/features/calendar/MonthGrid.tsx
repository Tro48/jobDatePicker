import { useMemo } from 'react';
import { View } from 'react-native';
import { monthDays, weekday } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveRange } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { WEEKDAYS_SHORT, formatMonthTitle } from '@/domain/format.ts';
import { AppText } from '@/ui';
import { useTheme } from '@/theme';
import { DayCell } from './DayCell.tsx';

/** Промежуток между клетками. Два пункта — компромисс ради зоны нажатия 48 dp. */
export const GRID_GAP = 2;

/** Строк всегда шесть, чтобы сетка не прыгала по высоте при листании месяцев. */
export const GRID_ROWS = 6;

export function cellSizeFor(width: number): number {
  return (width - GRID_GAP * (7 - 1)) / 7;
}

export function gridHeightFor(width: number): number {
  return GRID_ROWS * (cellSizeFor(width) + GRID_GAP);
}

export interface MonthGridProps {
  year: number;
  month: number;
  context: ScheduleContext;
  today: IsoDate;
  selectedDate?: IsoDate;
  /** Ширина, на которую растягивается сетка: считается по ней, а не по экрану. */
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
  const size = cellSizeFor(width);

  const days = useMemo(() => monthDays(year, month), [year, month]);
  const resolved = useMemo(() => resolveRange(context, days), [context, days]);
  // Неделя начинается с понедельника, поэтому перед первым числом пустые клетки.
  const leading = weekday(days[0]) - 1;

  return (
    <View
      // React Native не знает роли grid — на Android доступен только list.
      // Точность не теряется: каждая клетка озвучивает свою дату и день недели.
      accessibilityRole="list"
      accessibilityLabel={formatMonthTitle(year, month)}
      style={{ width, flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}
    >
      {Array.from({ length: leading }, (_, index) => (
        <View key={`blank-${index}`} style={{ width: size, height: size }} />
      ))}

      {resolved.map((day) => (
        <DayCell
          key={day.date}
          day={day}
          size={size}
          isToday={day.date === today}
          isSelected={day.date === selectedDate}
          onPress={onSelectDay}
        />
      ))}
    </View>
  );
}

/**
 * Шапка с днями недели. Скрыта от скринридера: каждая клетка и так называет
 * свой день недели, а «пн вт ср чт пт сб вс» перед сеткой только мешает.
 */
export function WeekdayHeader({ width }: { width: number }) {
  const theme = useTheme();
  const size = cellSizeFor(width);

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
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
          style={{ width: size, textAlign: 'center' }}
        >
          {name}
        </AppText>
      ))}
    </View>
  );
}
