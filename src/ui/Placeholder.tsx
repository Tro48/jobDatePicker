import { View } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme/ThemeProvider.tsx';

export interface PlaceholderProps {
  /** Что здесь будет и на каком этапе плана появится. */
  children: string;
  stage: string;
}

/**
 * Заглушка ещё не сделанного экрана. Существует, чтобы каркас было видно на
 * телефоне целиком; удаляется вместе с последним использованием.
 */
export function Placeholder({ children, stage }: PlaceholderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderStyle: 'dashed',
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
      }}
    >
      <AppText variant="body">{children}</AppText>
      <AppText variant="caption" tone="muted">
        {stage}
      </AppText>
    </View>
  );
}
