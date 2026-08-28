import { View } from 'react-native';
import { describeDay } from '@/domain/describe.ts';
import { formatDuration, formatTimeRange } from '@/domain/format.ts';
import { shiftDurationMinutes } from '@/domain/engine.ts';
import type { ResolvedDay } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';

/**
 * Строка «что у меня сегодня» над календарём. Главный вопрос к приложению,
 * ответ на который не должен требовать поиска сегодняшнего числа в сетке.
 */
export function TodayCard({ day }: { day: ResolvedDay }) {
  const theme = useTheme();
  const colors = useShiftColors(day.shiftType.colorToken);
  const time = day.shiftType.time;
  const planned = shiftDurationMinutes(day.shiftType);

  const details =
    day.shiftType.kind === 'work'
      ? [
          time && day.workedMinutes === planned ? formatTimeRange(time.start, time.end) : null,
          formatDuration(day.workedMinutes),
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Сегодня: ${describeDay(day)}`}
      style={{
        backgroundColor: colors.surface,
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: 2,
      }}
    >
      <View importantForAccessibility="no-hide-descendants" style={{ gap: 2 }}>
        <AppText variant="caption" color={colors.on}>
          Сегодня
        </AppText>
        <AppText variant="heading" color={colors.on}>
          {day.shiftType.name}
        </AppText>
        {details ? (
          <AppText variant="body" color={colors.on}>
            {details}
          </AppText>
        ) : null}
        {day.note ? (
          <AppText variant="caption" color={colors.on}>
            {day.note}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
