import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { readableOn, typography, useTheme } from '@/theme';

export interface RescueButtonProps {
  title: string;
  onPress: () => void;
  accessibilityHint?: string;
  disabled?: boolean;
}

/**
 * Кнопка, которую видно при любой палитре.
 *
 * Обычная кнопка берёт цвета из темы — а тему человек прямо сейчас и мог
 * испортить: покрасив фон и текст в один цвет, он остался бы на экране, где
 * кнопки сброса не видно, и вышел бы из этого только переустановкой.
 *
 * Поэтому цвета считаются от фона: чёрная или белая заливка — та, что на этом
 * фоне контрастнее, — и подпись противоположным. Контраст подписи к заливке
 * при этом всегда 21:1.
 */
export function RescueButton({ title, onPress, accessibilityHint, disabled }: RescueButtonProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const background = readableOn(theme.colors.background);
  const foreground = readableOn(background);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled === true }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: theme.minTouchTarget,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        backgroundColor: background,
        // Кольцо фокуса тоже не из палитры: причина та же.
        borderWidth: focused ? theme.focusRingWidth : 1,
        borderColor: foreground,
        opacity: disabled === true ? 0.5 : 1,
      }}
    >
      <Text style={[typography.label, { color: foreground, textAlign: 'center' }]}>{title}</Text>
    </Pressable>
  );
}
