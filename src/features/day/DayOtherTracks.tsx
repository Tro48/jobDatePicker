import { Pressable, View } from 'react-native';
import { resolveDay } from '@/domain/engine.ts';
import { formatTimeRange } from '@/domain/format.ts';
import type { IsoDate } from '@/domain/date.ts';
import { useScheduleContexts } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Card } from '@/ui';
import { useTheme } from '@/theme';

export interface DayOtherTracksProps {
  date: IsoDate;
}

/**
 * Что в этот день у остальных графиков.
 *
 * Карточка дня правит активную дорожку, а знать хочется про все: вышел ли
 * второй работой в тот же день, попадает ли выходной на выходной жены. Строка
 * нажимается и переключает активный график — отдельного экрана для чужого дня
 * заводить не нужно, эта же карточка его и покажет.
 *
 * Пока график один — не рисуется вовсе.
 */
export function DayOtherTracks({ date }: DayOtherTracksProps) {
  const theme = useTheme();
  const tracks = useAppStore((state) => state.tracks);
  const activeTrackId = useAppStore((state) => state.activeTrackId);
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);
  const contexts = useScheduleContexts();

  // Дорожка и её разложенный день сразу парой: так ниже не приходится ни
  // доставать контекст второй раз, ни доказывать типу, что он там есть.
  const others = tracks.flatMap((track) => {
    const context = track.id === activeTrackId ? undefined : contexts.get(track.id);
    return context ? [{ track, day: resolveDay(context, date) }] : [];
  });

  if (others.length === 0) return null;

  return (
    <Card title="В этот день у других">
      <View style={{ gap: theme.spacing.sm }}>
        {others.map(({ track, day }) => {
          const { time } = day.shiftType;
          const text = time
            ? `${day.shiftType.name}, ${formatTimeRange(time.start, time.end)}`
            : day.shiftType.name;

          return (
            <Pressable
              key={track.id}
              accessibilityRole="button"
              accessibilityLabel={`${track.name}: ${text.toLowerCase()}`}
              accessibilityHint="Переключить календарь на этот график"
              onPress={() => setActiveTrack(track.id)}
              style={{
                minHeight: theme.minTouchTarget,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              <View importantForAccessibility="no-hide-descendants">
                <AppText variant="label" tone="muted">
                  {track.name}
                </AppText>
                <AppText variant="body">{text}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
