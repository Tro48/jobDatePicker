import { memo, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { monthGridDates } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { countedDay, resolveDay } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { WEEKDAYS_SHORT, formatMonthTitle } from '@/domain/format.ts';
import { noteLine } from '@/domain/notes.ts';
import type { DayNote } from '@/domain/types.ts';
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
  /**
   * Выделенные дни. undefined — никого не выделяют и сетка обычная; заданный
   * набор гасит всё, что в него не попало.
   */
  highlighted?: Set<IsoDate>;
  /** Чьи совпадения выделены: имя уходит в озвучку каждой выделенной клетки. */
  highlightName?: string;
  /** Заметки по датам: клетка помечается значком, озвучка читает текст. */
  notes?: Map<IsoDate, DayNote[]>;
  /** Дни, в которые записаны выплаты: у них свой значок в клетке. */
  paymentDates?: Set<IsoDate>;
  width: number;
  onSelectDay: (date: IsoDate) => void;
}

function MonthGridView({
  year,
  month,
  context,
  today,
  selectedDate,
  highlighted,
  highlightName,
  notes,
  paymentDates,
  width,
  onSelectDay,
}: MonthGridProps) {
  // Масштаб системного шрифта: от него зависит высота клетки, и меняется он
  // на лету — человек уводит приложение в фон, крутит настройку и возвращается.
  const { fontScale } = useWindowDimensions();
  const { cellSize, cellHeight, gridWidth } = gridMetrics(width, fontScale);

  const days = useMemo(() => {
    // Сетка всегда 42 дня: хвосты соседних месяцев показываются как контекст,
    // чтобы было видно, как смены переходят через границу месяца.
    return monthGridDates(year, month).map((cell) => {
      const resolved = resolveDay(context, cell.date);
      return {
        ...cell,
        resolved,
        counted: countedDay(resolved),
        // Заметки склеиваются здесь, а не в клетке: строка попадает в её
        // мемоизацию, и новый массив на каждый рендер перерисовывал бы сетку.
        note: noteLine(notes?.get(cell.date) ?? []),
      };
    });
  }, [year, month, context, notes]);

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
            height={cellHeight}
            inMonth={cell.inMonth}
            counted={cell.counted}
            isToday={cell.date === today}
            // Сегодняшняя смена уже считается отработанной: приложение не
            // знает, закончилась она или нет, а «через час потускнеет» —
            // поведение, которое ничего не объясняет. Смена до первой
            // отработанной не бывает: её не было.
            isWorked={cell.counted && cell.date <= today && cell.resolved.shiftType.kind === 'work'}
            highlighting={highlighted !== undefined}
            dimmed={highlighted !== undefined && !highlighted.has(cell.date)}
            sharedWith={highlightName}
            note={cell.note}
            hasPayment={paymentDates?.has(cell.date) ?? false}
            isSelected={cell.date === selectedDate}
            onPress={onSelectDay}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Страница пейджера мемоизирована: при листании месяцев меняется только индекс,
 * а сетки соседних месяцев остаются теми же. Без memo каждое движение стрелкой
 * или свайпом перерисовывало все страницы, которые сейчас в памяти.
 */
export const MonthGrid = memo(MonthGridView);

/**
 * Шапка с днями недели. Скрыта от скринридера: каждая клетка и так называет
 * свой день недели, а «пн вт ср чт пт сб вс» перед сеткой только мешает.
 */
export function WeekdayHeader({ width }: { width: number }) {
  const theme = useTheme();
  // Шапке нужна только ширина колонки: высота клетки её не касается.
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
