import { Text } from 'react-native';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider.tsx';
import type { TypographyVariant } from '@/theme/typography.ts';

type Tone = 'default' | 'muted' | 'accent' | 'danger';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: Tone;
  /** Свой цвет — для подписи поверх заливки смены. */
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Единственный способ вывести текст в приложении. Цвета берутся из темы, а не
 * задаются в компонентах; allowFontScaling не отключается нигде.
 */
export function AppText({
  variant = 'body',
  tone = 'default',
  color,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();

  const toneColor = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
  }[tone];

  return (
    <Text
      {...rest}
      style={[theme.typography[variant] as TextStyle, { color: color ?? toneColor }, style]}
    />
  );
}
