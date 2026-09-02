import { View } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

export interface StatProps {
  value: string;
  /**
   * Общее число за месяц, если value — только часть от него: рисуется как
   * «/192 ч» следом за значением. Не задано — плитка показывает одно число.
   */
  total?: string;
  label: string;
  /** Полная фраза для скринридера: «192 часа отработано». */
  spoken: string;
}

/** Плитка с числом и подписью. Число крупное, подпись мелкая. */
export function Stat({ value, total, label, spoken }: StatProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={{
        flex: 1,
        minWidth: 96,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        gap: 2,
      }}
    >
      <View importantForAccessibility="no-hide-descendants" style={{ gap: 2 }}>
        {/* Общее число — мельче и приглушённее: главное здесь то, что уже
            сделано, а не план. По базовой линии, чтобы разные кегли не
            «прыгали»; перенос строки разрешён — при увеличенном шрифте дробь
            в ширину плитки не влезает. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <AppText variant="title">{value}</AppText>
          {total ? (
            <AppText variant="heading" tone="muted">
              /{total}
            </AppText>
          ) : null}
        </View>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
      </View>
    </View>
  );
}
