import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText.tsx';
import { Button } from './Button.tsx';
import { TimeDial } from './TimeDial.tsx';
import { useTheme } from '@/theme';

export interface TimeDialFieldProps {
  label: string;
  /** «ЧЧ:ММ». */
  value: string;
  onChange: (time: string) => void;
  hint?: string;
  defaultExpanded?: boolean;
}

/**
 * Время в свёрнутом виде — крупная строка, по нажатию раскрывается циферблат.
 *
 * Свёрнутое состояние нужно там, где времён несколько: у будильника «по
 * графику» их столько, сколько типов смен, и шесть развёрнутых циферблатов на
 * одном экране не читаются.
 */
export function TimeDialField({
  label,
  value,
  onChange,
  hint,
  defaultExpanded = false,
}: TimeDialFieldProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {expanded ? (
        <>
          <TimeDial label={label} value={value} onChange={onChange} />
          <Button title="Готово" onPress={() => setExpanded(false)} />
        </>
      ) : (
        <>
          <AppText variant="label" tone="muted">
            {label}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${label}: ${value}`}
            accessibilityHint="Открывает циферблат"
            onPress={() => setExpanded(true)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
              minHeight: theme.minTouchTarget,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.md,
              borderWidth: focused ? theme.focusRingWidth : 1,
              borderColor: focused ? theme.colors.focus : theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            <AppText variant="title" importantForAccessibility="no">
              {value}
            </AppText>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
              importantForAccessibility="no-hide-descendants"
            >
              <AppText variant="label" tone="muted">
                изменить
              </AppText>
              <Ionicons name="time-outline" size={20} color={theme.colors.textMuted} />
            </View>
          </Pressable>
        </>
      )}
      {hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
