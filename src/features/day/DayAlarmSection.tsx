import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { useAlarmSyncState } from '@/features/alarm/AlarmSyncProvider.tsx';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Будильники этого дня прямо в карточке дня.
 *
 * Показывает не сами будильники, а их срабатывания на эту дату: повторяющийся
 * будильник «по будням» звонит и здесь, и это надо видеть до того, как заводить
 * второй такой же.
 */
export function DayAlarmSection({ date }: { date: IsoDate }) {
  const theme = useTheme();
  const push = useGuardedPush();
  const { occurrences } = useAlarmSyncState();
  const [focused, setFocused] = useState<string | null>(null);

  const forDay = occurrences.filter((occurrence) => occurrence.date === date);
  const past = date < todayIso();

  return (
    <Card title="Будильник">
      {forDay.length === 0 ? (
        <AppText variant="body" tone="muted">
          В этот день ничего не звонит.
        </AppText>
      ) : (
        <View accessibilityRole="list" style={{ gap: theme.spacing.xs }}>
          {forDay.map((occurrence) => (
            <Pressable
              key={occurrence.id}
              accessibilityRole="button"
              accessibilityLabel={`${occurrence.time}, ${occurrence.title}`}
              accessibilityHint="Открывает настройки будильника"
              onPress={() => push({ pathname: '/alarm/[id]', params: { id: occurrence.alarmId } })}
              onFocus={() => setFocused(occurrence.id)}
              onBlur={() => setFocused(null)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                minHeight: theme.minTouchTarget,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.md,
                borderWidth: focused === occurrence.id ? theme.focusRingWidth : 0,
                borderColor: theme.colors.focus,
              }}
            >
              <AppText variant="heading" importantForAccessibility="no">
                {occurrence.time}
              </AppText>
              <AppText variant="body" tone="muted" importantForAccessibility="no" style={{ flex: 1 }}>
                {occurrence.title}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}

      {past ? (
        <AppText variant="caption" tone="muted">
          День прошёл — будильник на него уже не поставить.
        </AppText>
      ) : (
        <Button
          title="Добавить будильник на этот день"
          onPress={() => push({ pathname: '/alarm/[id]', params: { id: 'new', date } })}
        />
      )}
    </Card>
  );
}
