import { Switch, View } from 'react-native';
import { AppText } from './AppText.tsx';
import { HelpButton } from './HelpButton.tsx';
import { useTheme } from '@/theme';

export interface ToggleProps {
  label: string;
  /**
   * Короткое уточнение строкой под меткой. Только там, где оно зависит от
   * данных: «свободны и ты, и Аня». Объяснение, как что работает, — это help.
   */
  hint?: string;
  /**
   * Пояснение под знаком вопроса рядом с меткой: что переключатель меняет и
   * чем это обернётся. На экране его не видно, пока не спросят.
   */
  help?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function Toggle({ label, hint, help, value, onValueChange }: ToggleProps) {
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
      {help ? <HelpButton title={label} text={help} /> : null}
      <Switch
        accessibilityLabel={label}
        // Скринридеру пояснение достаётся вместе с переключателем: искать
        // отдельную кнопку с вопросом, чтобы понять, что он делает, — работа,
        // которой у зрячего нет.
        accessibilityHint={[hint, help].filter(Boolean).join('. ') || undefined}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
      />
    </View>
  );
}
