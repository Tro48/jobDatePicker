import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from '@/ui';
import { SHIFT_COLOR_TOKENS } from '@/domain/shifts.ts';
import { SHIFT_COLOR_NAMES, useTheme } from '@/theme';

export interface ColorChoiceProps {
  value: string;
  onChange: (token: string) => void;
  /** Буква-маркер смены: цвет выбирают под неё, а не сам по себе. */
  badge: string;
}

/**
 * Выбор цвета смены из проверенной палитры.
 *
 * Выбранный цвет помечен галочкой и утолщённой рамкой, а не только тем, что он
 * выбранный: отличить «этот кружок сейчас активен» по одному лишь цвету нельзя
 * ни при дальтонизме, ни в списке из десяти оттенков. Каждый кружок — кнопка с
 * названием оттенка, поэтому список работает и с клавиатуры, и со
 * скринридером.
 */
export function ColorChoice({ value, onChange, badge }: ColorChoiceProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Цвет смены"
      style={{ gap: theme.spacing.xs }}
    >
      <AppText variant="label" tone="muted">
        Цвет в календаре
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {SHIFT_COLOR_TOKENS.map((token) => {
          const pair = theme.colors.shifts[token];
          const name = SHIFT_COLOR_NAMES[token] ?? token;
          const selected = token === value;

          return (
            <Pressable
              key={token}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityState={{ selected }}
              onPress={() => onChange(token)}
              onFocus={() => setFocused(token)}
              onBlur={() => setFocused(null)}
              style={{
                width: theme.minTouchTarget,
                height: theme.minTouchTarget,
                borderRadius: theme.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pair.surface,
                borderWidth: selected || focused === token ? theme.focusRingWidth : 1,
                borderColor:
                  focused === token ? theme.colors.focus : selected ? pair.on : theme.colors.border,
              }}
            >
              {/* Внутри — та самая буква, что окажется в клетке календаря:
                  цвет выбирают, чтобы её было видно, а не сам по себе. */}
              <View
                importantForAccessibility="no-hide-descendants"
                style={{ alignItems: 'center' }}
              >
                {selected ? (
                  <Ionicons name="checkmark" size={16} color={pair.on} />
                ) : (
                  <AppText variant="badge" color={pair.on} numberOfLines={1}>
                    {badge}
                  </AppText>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
