import { useState } from 'react';
import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * Значок перед подписью. Только в дополнение к тексту: сам по себе он смысла
   * не несёт — ни при озвучке, ни для того, кто видит его впервые.
   */
  icon?: ComponentProps<typeof Ionicons>['name'];
  /**
   * Кнопка по ширине подписи, а не во всю строку. Для второстепенного рядом с
   * главным: строка во всю ширину читается как основное действие экрана.
   * Высота остаётся прежней — зона нажатия меньше 48 пунктов не бывает.
   */
  compact?: boolean;
  disabled?: boolean;
  /**
   * Чем кнопка называется озвучке, если короткой подписи для этого мало.
   * «Не звонит?» понятно на своём экране, но в списке элементов управления
   * рядом с чужими кнопками — уже нет.
   */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'secondary',
  icon,
  compact = false,
  disabled = false,
  accessibilityLabel,
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
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[
        {
          minHeight: theme.minTouchTarget,
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.xs,
          alignSelf: compact ? 'flex-start' : undefined,
          paddingHorizontal: compact ? theme.spacing.md : theme.spacing.lg,
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
      {icon ? (
        // Значок скрыт от озвучки: подпись рядом говорит то же самое, и читать
        // её дважды незачем.
        <Ionicons name={icon} size={18} color={textColor} importantForAccessibility="no" />
      ) : null}
      {/* Подпись обязана сжиматься: в строке из значка и текста ей иначе некуда
          переноситься, и длинное название вылезает за кнопку. */}
      <AppText
        variant="label"
        color={textColor}
        numberOfLines={2}
        style={{ flexShrink: 1, textAlign: 'center' }}
      >
        {title}
      </AppText>
    </Pressable>
  );
}
