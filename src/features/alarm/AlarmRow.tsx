import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { describeRepeat, describeTime } from '@/domain/alarm.ts';
import type { Alarm, AlarmOccurrence } from '@/domain/alarm.ts';
import { formatDayShort, formatTimeUntil } from '@/domain/format.ts';
import type { ShiftType } from '@/domain/types.ts';
import { AppText, IconButton } from '@/ui';
import { useTheme } from '@/theme';

/** «Через 8 ч 20 мин» для ближайших суток, дальше — день и остаток. */
export function describeNext(occurrence: AlarmOccurrence, now: number): string {
  const minutes = Math.round((occurrence.triggerAtMillis - now) / 60_000);
  if (minutes < 24 * 60) return `Через ${formatTimeUntil(minutes)}`;
  return `${formatDayShort(occurrence.date)} — через ${formatTimeUntil(minutes)}`;
}

/**
 * Строка списка будильников.
 *
 * Кнопки вынесены из нажимаемой области намеренно: вложенные в неё, они давали
 * бы несколько элементов с одной зоной нажатия — скринридер читает такое как
 * одну кнопку с непонятным действием.
 */
export function AlarmRow({
  alarm,
  next,
  shiftTypes,
  now,
  onEdit,
  onToggle,
  onDelete,
}: {
  alarm: Alarm;
  next: AlarmOccurrence | null;
  shiftTypes: Map<string, ShiftType>;
  now: number;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
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
    // Каждый будильник — своя карточка: так их проще различать взглядом и
    // нечему слипаться, когда у соседних совпадает время.
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
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
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
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
      <IconButton
        name={alarm.enabled ? 'pause' : 'play'}
        label={
          alarm.enabled ? `Поставить на паузу будильник ${time}` : `Включить будильник ${time}`
        }
        onPress={() => onToggle(!alarm.enabled)}
      />
      <IconButton
        name="trash-outline"
        label={`Удалить будильник ${time}`}
        onPress={() =>
          // Удаление руками не отменить, поэтому спрашиваем. Диалог системный:
          // он читается скринридером и закрывается кнопкой «назад».
          Alert.alert('Удалить будильник?', `${time}${name ? `, ${name}` : ''}`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: onDelete },
          ])
        }
      />
    </View>
  );
}
