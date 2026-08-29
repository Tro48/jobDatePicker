import { View } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

export interface StatProps {
  value: string;
  label: string;
  /** Полная фраза для скринридера: «192 часа отработано». */
  spoken: string;
}

/** Плитка с числом и подписью. Число крупное, подпись мелкая. */
export function Stat({ value, label, spoken }: StatProps) {
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
        <AppText variant="title">{value}</AppText>
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
      </View>
    </View>
  );
}
