import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { describeRepeat, describeTime } from '@/domain/alarm.ts';
import type { Alarm, AlarmOccurrence } from '@/domain/alarm.ts';
import { formatDayShort, formatDuration } from '@/domain/format.ts';
import type { ShiftType } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useTheme } from '@/theme';

/** «Через 8 ч 20 мин» для ближайших суток, дальше — просто день и время. */
function describeNext(occurrence: AlarmOccurrence, now: number): string {
  const minutes = Math.round((occurrence.triggerAtMillis - now) / 60_000);
  if (minutes < 1) return 'Меньше чем через минуту';
  if (minutes < 24 * 60) return `Через ${formatDuration(minutes)}`;
  return `${formatDayShort(occurrence.date)}, ${occurrence.time}`;
}

/**
 * Строка списка будильников.
 *
 * Переключатель вынесен из нажимаемой области намеренно: вложенный в неё, он
 * давал бы два элемента с одной зоной нажатия — скринридер читает такое как
 * одну кнопку с непонятным действием.
 */
export function AlarmRow({
  alarm,
  next,
  shiftTypes,
  now,
  onEdit,
  onToggle,
}: {
  alarm: Alarm;
  next: AlarmOccurrence | null;
  shiftTypes: Map<string, ShiftType>;
  now: number;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const time = describeTime(alarm);
  const repeat = describeRepeat(alarm, shiftTypes);
  const name = alarm.label.trim();
  const status = alarm.enabled
    ? next
      ? describeNext(next, now)
      : 'Ближайшего срабатывания нет'
    : 'Выключен';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[time, name, repeat, status].filter(Boolean).join(', ')}
        accessibilityHint="Открывает настройки будильника"
        onPress={onEdit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minHeight: theme.minTouchTarget,
          justifyContent: 'center',
          gap: 2,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: focused ? theme.focusRingWidth : 0,
          borderColor: theme.colors.focus,
        }}
      >
        <View importantForAccessibility="no-hide-descendants">
          <AppText variant="display" tone={alarm.enabled ? 'default' : 'muted'}>
            {time}
          </AppText>
          {name ? <AppText variant="body">{name}</AppText> : null}
          <AppText variant="caption" tone="muted">
            {repeat}
          </AppText>
          <AppText variant="caption" tone="muted">
            {status}
          </AppText>
        </View>
      </Pressable>
      <Switch
        accessibilityLabel={`${time}${name ? `, ${name}` : ''}`}
        accessibilityHint="Включает и выключает будильник"
        value={alarm.enabled}
        onValueChange={onToggle}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
      />
    </View>
  );
}
