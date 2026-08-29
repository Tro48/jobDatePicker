import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

export interface TimeFieldProps {
  label: string;
  /** «ЧЧ:ММ». */
  value: string;
  onChange: (time: string) => void;
  hint?: string;
}

const clamp = (value: number, max: number): number => Math.max(0, Math.min(value, max));
const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Ввод времени двумя полями вместо системного диалога.
 *
 * Диалог из @react-native-community/datetimepicker — это ещё одна нативная
 * зависимость ради одного экрана; два числовых поля работают с клавиатуры,
 * читаются скринридером как обычные поля и не ломаются при увеличенном шрифте.
 */
export function TimeField({ label, value, onChange, hint }: TimeFieldProps) {
  const theme = useTheme();
  const [hours, setHours] = useState(value.slice(0, 2));
  const [minutes, setMinutes] = useState(value.slice(3, 5));

  // Значение могло смениться снаружи: другой будильник, сброс формы.
  useEffect(() => {
    setHours(value.slice(0, 2));
    setMinutes(value.slice(3, 5));
  }, [value]);

  const commit = (nextHours: string, nextMinutes: string): void => {
    const h = clamp(Number(nextHours || '0'), 23);
    const m = clamp(Number(nextMinutes || '0'), 59);
    onChange(`${pad(h)}:${pad(m)}`);
  };

  const part = (
    partLabel: string,
    partValue: string,
    max: number,
    setValue: (next: string) => void,
    onCommit: (next: string) => void,
  ) => (
    <View style={{ flex: 1, gap: theme.spacing.xs }}>
      <AppText variant="caption" tone="muted">
        {partLabel}
      </AppText>
      <TextInput
        accessibilityLabel={`${label}, ${partLabel.toLowerCase()}`}
        value={partValue}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 2);
          setValue(digits);
          // Пока в поле мусор, значение наружу не уходит — иначе «7» на пути
          // к «19» успело бы переставить будильник на семь утра.
          if (digits.length > 0 && Number(digits) <= max) onCommit(digits);
        }}
        onBlur={() => commit(hours, minutes)}
        keyboardType="number-pad"
        maxLength={2}
        style={{
          minHeight: theme.minTouchTarget,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          color: theme.colors.text,
          ...theme.typography.title,
        }}
      />
    </View>
  );

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.md }}>
        {part('Часы', hours, 23, setHours, (next) => commit(next, minutes))}
        {part('Минуты', minutes, 59, setMinutes, (next) => commit(hours, next))}
      </View>
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
