import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ShiftType } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useShiftColors, useTheme } from '@/theme';

export interface ShiftBrushProps {
  shiftTypes: ShiftType[];
  value: string;
  onChange: (shiftTypeId: string) => void;
}

/**
 * Кисть конструктора: какой сменой сейчас рисуют по дням.
 *
 * Именно кисть, а не выпадающий список у каждого дня: разложить цикл из
 * восьми дней списками — это восемь открытий и восемь выборов, а кистью — один
 * выбор и восемь касаний.
 */
export function ShiftBrush({ shiftTypes, value, onChange }: ShiftBrushProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Смена для раскладки"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
    >
      {shiftTypes.map((type) => (
        <BrushChip
          key={type.id}
          shiftType={type}
          selected={type.id === value}
          onPress={() => onChange(type.id)}
        />
      ))}
    </View>
  );
}

interface BrushChipProps {
  shiftType: ShiftType;
  selected: boolean;
  onPress: () => void;
}

/**
 * Выбранная кисть помечена галочкой и рамкой, а не одной заливкой: заливка у
 * чипа и так своя у каждой смены, и «выбрано» по ней не прочитать.
 */
function BrushChip({ shiftType, selected, onPress }: BrushChipProps) {
  const theme = useTheme();
  const colors = useShiftColors(shiftType.colorToken);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={shiftType.name}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        minHeight: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: colors.surface,
        borderWidth: selected || focused ? theme.focusRingWidth : 1,
        borderColor: focused ? theme.colors.focus : selected ? colors.on : theme.colors.border,
      }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
      >
        {selected ? <Ionicons name="checkmark" size={16} color={colors.on} /> : null}
        <AppText variant="label" color={colors.on}>
          {shiftType.name}
        </AppText>
      </View>
    </Pressable>
  );
}
