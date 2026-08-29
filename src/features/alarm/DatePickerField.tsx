import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { monthGridDates, todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { formatDayLong, formatMonthTitle } from '@/domain/format.ts';
import { periodOf, shiftPeriod } from '@/domain/payday.ts';
import { AppText, Button, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { WeekdayHeader } from '@/features/calendar/MonthGrid.tsx';
import { GRID_GAP, gridMetrics } from '@/features/calendar/gridMetrics.ts';

/**
 * Выбор даты месячной сеткой.
 *
 * Своя сетка, а не `MonthGrid` из календаря: тот раскрашивает клетки по
 * сменам и требует выбранного графика, а здесь выбирается просто дата — в том
 * числе когда график ещё не выбран.
 *
 * Прошедшие дни выключены: разовый будильник на вчера погаснет в тот же миг,
 * когда его сохранят.
 */
export function DatePickerField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: IsoDate;
  onChange: (date: IsoDate) => void;
  hint?: string;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [focused, setFocused] = useState(false);
  const [period, setPeriod] = useState(() => periodOf(value));

  const today = todayIso();
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const { cellSize, gridWidth } = gridMetrics(width);

  const spoken = `${formatDayLong(value)} ${value.slice(0, 4)}`;

  if (!expanded) {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <AppText variant="label" tone="muted">
          {label}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${label}: ${spoken}`}
          accessibilityHint="Открывает календарь"
          onPress={() => {
            setPeriod(periodOf(value));
            setExpanded(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            minHeight: theme.minTouchTarget,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.md,
            borderWidth: focused ? theme.focusRingWidth : 1,
            borderColor: focused ? theme.colors.focus : theme.colors.border,
            backgroundColor: theme.colors.surfaceElevated,
          }}
        >
          <AppText variant="body" importantForAccessibility="no" style={{ flex: 1 }}>
            {spoken}
          </AppText>
          <Ionicons
            name="calendar-outline"
            size={20}
            color={theme.colors.textMuted}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Pressable>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton
          name="chevron-back"
          label="Предыдущий месяц"
          onPress={() => setPeriod((current) => shiftPeriod(current, -1))}
        />
        <AppText variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {formatMonthTitle(year, month)}
        </AppText>
        <IconButton
          name="chevron-forward"
          label="Следующий месяц"
          onPress={() => setPeriod((current) => shiftPeriod(current, 1))}
        />
      </View>

      {/* Сетка во всю ширину экрана: иначе клетка мельче зоны нажатия. */}
      <View style={{ marginHorizontal: -theme.spacing.lg, alignItems: 'center' }}>
        <WeekdayHeader width={width} />
        <View
          accessibilityRole="list"
          accessibilityLabel={formatMonthTitle(year, month)}
          style={{ width: gridWidth, flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}
        >
          {monthGridDates(year, month).map((cell) => {
            const selected = cell.date === value;
            const past = cell.date < today;

            return (
              <Pressable
                key={cell.date}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: past }}
                accessibilityLabel={formatDayLong(cell.date)}
                disabled={past}
                onPress={() => {
                  onChange(cell.date);
                  setExpanded(false);
                }}
                style={{
                  width: cellSize,
                  height: cellSize,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  borderColor: selected ? theme.colors.accent : 'transparent',
                  backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceElevated,
                  opacity: past ? 0.4 : cell.inMonth ? 1 : 0.7,
                }}
              >
                <AppText
                  variant="body"
                  color={selected ? theme.colors.onAccent : undefined}
                  tone={cell.inMonth ? 'default' : 'muted'}
                  maxFontSizeMultiplier={1.4}
                  style={{ fontWeight: selected ? '700' : '400' }}
                >
                  {Number(cell.date.slice(8, 10))}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button title="Готово" onPress={() => setExpanded(false)} />
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
