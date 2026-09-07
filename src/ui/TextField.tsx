import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { AppText } from './AppText.tsx';
import { HelpButton } from './HelpButton.tsx';
import { useSheetReveal } from './Sheet.tsx';
import { useTheme } from '@/theme';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  /**
   * Пояснение под знаком вопроса рядом с подписью: зачем поле и что будет с
   * набранным. На экране его не видно, пока не спросят.
   */
  help?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  /**
   * Предел длины. Обрезать набранное потом нельзя: человек увидит в поле одно,
   * а сохранится другое — так буква-маркер смены и должна ограничиваться прямо
   * при вводе.
   */
  maxLength?: number;
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
  help,
  keyboardType = 'default',
  multiline = false,
  maxLength,
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <AppText variant="label" tone="muted" style={{ flex: 1 }}>
          {label}
        </AppText>
        {help ? <HelpButton title={label} text={help} /> : null}
      </View>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        accessibilityHint={[hint, help].filter(Boolean).join('. ') || undefined}
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
        maxLength={maxLength}
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
