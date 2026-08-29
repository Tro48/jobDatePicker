import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { AppText } from './AppText.tsx';
import { useSheetReveal } from './Sheet.tsx';
import { useTheme } from '@/theme';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  /**
   * Уход фокуса. Здесь экраны дописывают набранное в хранилище: писать на
   * каждую букву слишком дорого, а поле должно хранить ровно то, что набрали.
   */
  onBlur?: () => void;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  keyboardType = 'default',
  multiline = false,
  onBlur,
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  // Клавиатура выезжает поверх содержимого, и поле надо вытащить из-под неё.
  // Знает об этом шторка, но какое поле правят — известно только здесь.
  const input = useRef<TextInput>(null);
  const reveal = useSheetReveal();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {/* Подпись выводится текстом, а не только placeholder: placeholder
          исчезает при вводе, и поле остаётся без доступного имени. */}
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          reveal(input.current);
        }}
        onBlur={() => {
          setFocused(false);
          reveal(null);
          onBlur?.();
        }}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        style={{
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: focused ? theme.focusRingWidth : 1,
          borderColor: focused ? theme.colors.focus : theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          color: theme.colors.text,
          ...theme.typography.body,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
