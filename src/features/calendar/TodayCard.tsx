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
 *
 * Ровно две строки, и вторая только при необходимости: карточка стоит между
 * вкладками и сеткой, и каждая её лишняя строка выталкивает календарь за
 * нижний край экрана. Подробности дня есть в самой карточке дня.
 */
export function TodayCard({ day }: { day: ResolvedDay }) {
  const theme = useTheme();
  const colors = useShiftColors(day.shiftType.colorToken);
  const time = day.shiftType.time;
  const planned = shiftDurationMinutes(day.shiftType);

  // Часы и заметка сведены в одну строку: по отдельности они занимали две.
  const details =
    [
      day.shiftType.kind === 'work' && time && day.workedMinutes === planned
        ? formatTimeRange(time.start, time.end)
        : null,
      day.shiftType.kind === 'work' ? formatDuration(day.workedMinutes) : null,
      day.note,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Сегодня: ${describeDay(day)}`}
      style={{
        backgroundColor: colors.surface,
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View importantForAccessibility="no-hide-descendants">
        <AppText variant="heading" color={colors.on}>
          Сегодня · {day.shiftType.name}
        </AppText>
        {details ? (
          <AppText variant="caption" color={colors.on}>
            {details}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
