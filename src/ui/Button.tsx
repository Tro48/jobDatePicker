import { useState } from 'react';
import { Pressable } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'secondary',
  disabled = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const background = {
    primary: theme.colors.accent,
    secondary: theme.colors.surfaceElevated,
    danger: theme.colors.surfaceElevated,
  }[variant];

  const textColor = {
    primary: theme.colors.onAccent,
    secondary: theme.colors.text,
    danger: theme.colors.danger,
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        {
          minHeight: theme.minTouchTarget,
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          backgroundColor: background,
          borderWidth: focused ? theme.focusRingWidth : 1,
          borderColor: focused
            ? theme.colors.focus
            : variant === 'primary'
              ? theme.colors.accent
              : theme.colors.border,
          // Выключенная кнопка приглушается целиком, но остаётся читаемой.
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <AppText variant="label" color={textColor} numberOfLines={2}>
        {title}
      </AppText>
    </Pressable>
  );
}
