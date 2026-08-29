import { useState } from 'react';
import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export interface FabProps {
  name: ComponentProps<typeof Ionicons>['name'];
  /** Доступное имя обязательно: у иконки нет текста, который мог бы её заменить. */
  label: string;
  onPress: () => void;
}

/** Круглая кнопка заметно больше минимальных 48 dp: в неё целятся большим пальцем. */
const SIZE = 64;

/**
 * Круглая кнопка действия, закреплённая внизу по центру.
 *
 * Лежит поверх прокрутки, поэтому содержимое экрана обязано оставлять снизу
 * запас — иначе последняя карточка уезжает под кнопку.
 */
export function Fab({ name, label, onPress }: FabProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: 'absolute',
        alignSelf: 'center',
        bottom: insets.bottom + theme.spacing.lg,
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accent,
        borderWidth: focused ? theme.focusRingWidth : 0,
        borderColor: theme.colors.focus,
      }}
    >
      <Ionicons name={name} size={32} color={theme.colors.onAccent} />
    </Pressable>
  );
}
