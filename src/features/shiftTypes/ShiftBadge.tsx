import { View } from 'react-native';
import type { ShiftType } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useShiftColors, useTheme } from '@/theme';

export interface ShiftBadgeProps {
  shiftType: ShiftType;
}

/**
 * Буква-маркер смены в её собственных цветах — тот же значок, что стоит в
 * клетке календаря.
 *
 * От озвучки скрыт: рядом всегда есть название смены, и без этого скринридер
 * читал бы «Веч, Вечерняя смена». Масштаб шрифта не ограничен — в отличие от
 * клетки, здесь значку есть куда расти.
 */
export function ShiftBadge({ shiftType }: ShiftBadgeProps) {
  const theme = useTheme();
  const colors = useShiftColors(shiftType);

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={{
        minWidth: theme.minTouchTarget,
        minHeight: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText variant="label" color={colors.on} numberOfLines={1}>
        {shiftType.badge}
      </AppText>
    </View>
  );
}
