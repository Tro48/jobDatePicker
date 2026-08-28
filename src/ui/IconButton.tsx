import { useState } from 'react';
import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '@/theme';

export interface IconButtonProps {
  name: ComponentProps<typeof Ionicons>['name'];
  /** Доступное имя обязательно: у иконки нет текста, который мог бы её заменить. */
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

export function IconButton({ name, label, onPress, disabled = false }: IconButtonProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        borderWidth: focused ? theme.focusRingWidth : 0,
        borderColor: theme.colors.focus,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Ionicons name={name} size={24} color={theme.colors.text} />
    </Pressable>
  );
}
