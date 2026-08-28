import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { describeDay } from '@/domain/describe.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { ResolvedDay } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';

export interface DayCellProps {
  day: ResolvedDay;
  size: number;
  isToday: boolean;
  isSelected: boolean;
  onPress: (date: IsoDate) => void;
}

/**
 * Клетка календаря.
 *
 * Смысл дня передаётся тремя способами сразу: заливкой, буквой-маркером и
 * полной озвучкой. Одной заливки недостаточно — она не читается ни при
 * дальтонизме, ни скринридером.
 */
export function DayCell({ day, size, isToday, isSelected, onPress }: DayCellProps) {
  const theme = useTheme();
  const colors = useShiftColors(day.shiftType.colorToken);
  const [focused, setFocused] = useState(false);

  const dayNumber = Number(day.date.slice(8, 10));
  const outlined = focused || isSelected || isToday;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={describeDay(day, { isToday })}
      accessibilityState={{ selected: isSelected }}
      onPress={() => onPress(day.date)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.sm,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: outlined ? theme.focusRingWidth : 1,
        borderColor: focused
          ? theme.colors.focus
          : isSelected
            ? theme.colors.accent
            : isToday
              ? colors.on
              : 'transparent',
      }}
    >
      {/* Содержимое скрыто от озвучки: клетка уже прочитана целиком по accessibilityLabel. */}
      <View importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
        <AppText
          variant="label"
          color={colors.on}
          numberOfLines={1}
          // Единственное место с ограничением масштаба шрифта: клетка сетки не
          // может расти, иначе месяц не поместится на экран. Полные данные дня
          // доступны в карточке дня и через скринридер.
          maxFontSizeMultiplier={1.3}
          style={{ fontWeight: isToday ? '800' : '600' }}
        >
          {dayNumber}
        </AppText>
        <AppText
          variant="badge"
          color={colors.on}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {day.shiftType.badge}
        </AppText>
      </View>

      {day.source === 'override' ? (
        <View
          importantForAccessibility="no"
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.on,
          }}
        />
      ) : null}
    </Pressable>
  );
}
