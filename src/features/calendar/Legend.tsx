import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ShiftTypeTotals } from '@/domain/summary.ts';
import { AppText } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';
import { HOLIDAY_ICON, HOLIDAY_ICON_SIZE } from './DayCell.tsx';

/**
 * Легенда показывает только те смены, которые в этом месяце реально есть, —
 * иначе она разрастается справочником на девять строк.
 */
export function Legend({
  totals,
  colorTokens,
  hasHolidays = false,
}: {
  totals: ShiftTypeTotals[];
  colorTokens: Record<string, string>;
  /** В месяце есть праздники: объяснить значок в углу клетки больше негде. */
  hasHolidays?: boolean;
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
      {hasHolidays ? <HolidayLegendItem /> : null}
    </View>
  );
}

/** Значок праздника: ровно тот же, что в углу клетки, и подпись к нему. */
function HolidayLegendItem() {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="Значок в углу клетки — праздник"
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      <Ionicons
        name={HOLIDAY_ICON}
        size={HOLIDAY_ICON_SIZE}
        color={theme.colors.text}
        importantForAccessibility="no"
        style={{ marginHorizontal: 4 }}
      />
      <AppText variant="caption" tone="muted" importantForAccessibility="no">
        праздник
      </AppText>
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
