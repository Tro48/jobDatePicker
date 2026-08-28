import { Switch, View } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

export interface ToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function Toggle({ label, hint, value, onValueChange }: ToggleProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.minTouchTarget,
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="body">{label}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
      />
    </View>
  );
}
