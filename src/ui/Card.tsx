import { View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme/ThemeProvider.tsx';

export interface CardProps {
  /** Заголовок секции. Задаёт карточке доступное имя. */
  title?: string;
  children: ReactNode;
}

export function Card({ title, children }: CardProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={title}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}
    >
      {title ? (
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}
