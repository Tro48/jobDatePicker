import { useState } from 'react';
import { Pressable } from 'react-native';
import type { ShiftType } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useShiftColors, useTheme } from '@/theme';

export interface PatternCellProps {
  /** Что стоит в этой клетке сейчас. */
  shiftType: ShiftType;
  /** Как клетка называется: «День 3» или «понедельник». */
  label: string;
  /** Чем закрасит нажатие — озвучивается подсказкой, иначе касание вслепую. */
  brushName: string;
  size: number;
  onPress: () => void;
}

/**
 * Одна клетка раскладки. Нажатие красит её текущей кистью.
 *
 * Смысл клетки держится на букве-маркере, а не на заливке: раскладку надо
 * читать и в чёрно-белом, и скринридером — он получает полную подпись «День 3,
 * дневная смена».
 */
export function PatternCell({ shiftType, label, brushName, size, onPress }: PatternCellProps) {
  const theme = useTheme();
  const colors = useShiftColors(shiftType.colorToken);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${shiftType.name.toLowerCase()}`}
      accessibilityHint={`Поставить: ${brushName.toLowerCase()}`}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: size,
        minHeight: size,
        borderRadius: theme.radius.sm,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: focused ? theme.focusRingWidth : 1,
        borderColor: focused ? theme.colors.focus : theme.colors.border,
      }}
    >
      <AppText
        variant="badge"
        color={colors.on}
        numberOfLines={1}
        // Клетка не может расти вслед за системным шрифтом: раскладка из
        // тридцати одного дня иначе не поместится в ширину экрана. Полное
        // содержимое доступно скринридеру и в строке описания под сеткой.
        maxFontSizeMultiplier={1.3}
        importantForAccessibility="no-hide-descendants"
      >
        {shiftType.badge}
      </AppText>
    </Pressable>
  );
}
