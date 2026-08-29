import { View } from 'react-native';
import { AppText } from './AppText.tsx';
import { Select } from './Select.tsx';
import type { SelectOption } from './Select.tsx';
import { useTheme } from '@/theme';

const pad = (value: number): string => String(value).padStart(2, '0');

const range = (count: number): SelectOption[] =>
  Array.from({ length: count }, (_, value) => ({ value: pad(value), label: pad(value) }));

const HOURS = range(24);
const MINUTES = range(60);

export interface TimeSelectProps {
  label: string;
  /** «ЧЧ:ММ». */
  value: string;
  onChange: (time: string) => void;
  hint?: string;
}

/**
 * Время двумя выпадающими списками: часы и минуты.
 *
 * Списки, а не поля ввода: набрать «25» и «61» нельзя в принципе, проверять
 * нечего. Значения все до одной минуты — без шага в пять, чтобы не отнимать
 * возможность встать в 06:37.
 */
export function TimeSelect({ label, value, onChange, hint }: TimeSelectProps) {
  const theme = useTheme();
  const hours = value.slice(0, 2);
  const minutes = value.slice(3, 5);

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Select
          label="Часы"
          value={hours}
          options={HOURS}
          onChange={(next) => onChange(`${next}:${minutes}`)}
        />
        <Select
          label="Минуты"
          value={minutes}
          options={MINUTES}
          onChange={(next) => onChange(`${hours}:${next}`)}
        />
      </View>
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
