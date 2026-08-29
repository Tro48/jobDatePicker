import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { WEEKDAYS_SHORT } from '@/domain/format.ts';
import { sortWeekdays } from '@/domain/alarm.ts';
import type { Weekday } from '@/domain/date.ts';
import { AppText, Button } from '@/ui';
import { useTheme } from '@/theme';

const ALL: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const WORKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const WEEKEND: Weekday[] = [6, 7];

const FULL_NAMES = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
];

/**
 * Выбор дней недели. Отмеченный день помечен не только заливкой: под подписью
 * стоит закрашенный кружок против пустого — цвет не единственный признак.
 */
export function WeekdayPicker({
  days,
  onChange,
}: {
  days: Weekday[];
  onChange: (days: Weekday[]) => void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState<Weekday | null>(null);

  const toggle = (day: Weekday): void => {
    onChange(sortWeekdays(days.includes(day) ? days.filter((item) => item !== day) : [...days, day]));
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        accessibilityRole="list"
        accessibilityLabel="Дни недели"
        style={{ flexDirection: 'row', gap: theme.spacing.xs }}
      >
        {ALL.map((day) => {
          const checked = days.includes(day);
          const hasFocus = focused === day;

          return (
            <Pressable
              key={day}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={FULL_NAMES[day - 1]}
              onPress={() => toggle(day)}
              onFocus={() => setFocused(day)}
              onBlur={() => setFocused(null)}
              style={{
                flex: 1,
                minHeight: theme.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.md,
                borderWidth: hasFocus ? theme.focusRingWidth : 1,
                borderColor: hasFocus
                  ? theme.colors.focus
                  : checked
                    ? theme.colors.accent
                    : theme.colors.border,
                backgroundColor: theme.colors.surfaceElevated,
              }}
            >
              <AppText
                variant="label"
                importantForAccessibility="no"
                style={{ fontWeight: checked ? '700' : '400' }}
              >
                {WEEKDAYS_SHORT[day - 1]}
              </AppText>
              <Ionicons
                name={checked ? 'ellipse' : 'ellipse-outline'}
                size={10}
                color={checked ? theme.colors.accent : theme.colors.textMuted}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button title="Каждый день" onPress={() => onChange(ALL)} style={{ flex: 1 }} />
        <Button title="Будни" onPress={() => onChange(WORKDAYS)} style={{ flex: 1 }} />
        <Button title="Выходные" onPress={() => onChange(WEEKEND)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
