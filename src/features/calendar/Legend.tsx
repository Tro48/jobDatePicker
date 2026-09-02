import { View } from 'react-native';
import type { ShiftTypeTotals } from '@/domain/summary.ts';
import { AppText } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';

/**
 * Легенда показывает только те смены, которые в этом месяце реально есть, —
 * иначе она разрастается справочником на девять строк.
 */
export function Legend({
  totals,
  colorTokens,
}: {
  totals: ShiftTypeTotals[];
  colorTokens: Record<string, string>;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="list"
      accessibilityLabel="Обозначения смен в этом месяце"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
    >
      {totals.map((item) => (
        <LegendItem
          key={item.shiftTypeId}
          badge={item.badge}
          name={item.name}
          colorToken={colorTokens[item.shiftTypeId] ?? ''}
        />
      ))}
    </View>
  );
}

function LegendItem({
  badge,
  name,
  colorToken,
}: {
  badge: string;
  name: string;
  colorToken: string;
}) {
  const theme = useTheme();
  const colors = useShiftColors(colorToken);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${badge} — ${name.toLowerCase()}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          minWidth: 20,
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
          backgroundColor: colors.surface,
          alignItems: 'center',
        }}
      >
        <AppText variant="badge" color={colors.on} maxFontSizeMultiplier={1.3}>
          {badge}
        </AppText>
      </View>
      <AppText variant="caption" tone="muted" importantForAccessibility="no">
        {name.toLowerCase()}
      </AppText>
    </View>
  );
}
