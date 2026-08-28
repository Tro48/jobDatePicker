import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme/ThemeProvider.tsx';

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface ChoiceGroupProps<T extends string> {
  /** Доступное имя группы: без него это не переключатель, а набор кнопок. */
  label: string;
  choices: ReadonlyArray<Choice<T>>;
  value: T;
  onChange: (value: T) => void;
}

/**
 * Группа взаимоисключающих вариантов. Выбранный вариант помечается галочкой и
 * жирным начертанием, а не только цветом рамки.
 */
export function ChoiceGroup<T extends string>({ label, choices, value, onChange }: ChoiceGroupProps<T>) {
  const theme = useTheme();
  const [focused, setFocused] = useState<T | null>(null);

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: theme.spacing.sm }}>
      {choices.map((choice) => {
        const selected = choice.value === value;
        const hasFocus = focused === choice.value;

        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={choice.label}
            accessibilityHint={choice.hint}
            onPress={() => onChange(choice.value)}
            onFocus={() => setFocused(choice.value)}
            onBlur={() => setFocused(null)}
            style={{
              minHeight: theme.minTouchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: hasFocus ? theme.focusRingWidth : 1,
              borderColor: hasFocus
                ? theme.colors.focus
                : selected
                  ? theme.colors.accent
                  : theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={22}
              color={selected ? theme.colors.accent : theme.colors.textMuted}
              // Иконка дублирует состояние, которое уже озвучено accessibilityState.
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
            <View style={{ flex: 1 }}>
              <AppText variant="body" style={{ fontWeight: selected ? '700' : '400' }}>
                {choice.label}
              </AppText>
              {choice.hint ? (
                <AppText variant="caption" tone="muted">
                  {choice.hint}
                </AppText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
