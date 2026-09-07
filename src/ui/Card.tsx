import { View } from 'react-native';
import type { ReactNode } from 'react';
import { AppText } from './AppText.tsx';
import { HelpButton } from './HelpButton.tsx';
import { useTheme } from '@/theme/ThemeProvider.tsx';

export interface CardProps {
  /** Заголовок секции. Задаёт карточке доступное имя. */
  title?: string;
  /**
   * Пояснение ко всей секции под знаком вопроса в заголовке. Для того, что
   * иначе пришлось бы объяснять абзацем поверх содержимого.
   */
  help?: string;
  children: ReactNode;
}

export function Card({ title, help, children }: CardProps) {
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </AppText>
          {help ? <HelpButton title={title} text={help} /> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
