import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { AppText, ColorPicker } from '@/ui';
import { SHIFT_COLOR_TOKENS } from '@/domain/shifts.ts';
import { SHIFT_COLOR_NAMES, markerOn, useTheme } from '@/theme';

export interface ColorChoiceProps {
  /** Оттенок палитры. Работает, пока у смены не задан свой цвет. */
  colorToken: string;
  /** Свой цвет смены, «#RRGGBB». Задан — оттенок палитры не смотрят. */
  color?: string;
  onChange: (next: { colorToken: string; color?: string }) => void;
  /** Буква-маркер смены: цвет выбирают под неё, а не сам по себе. */
  badge: string;
}

/**
 * Цвет смены: готовый оттенок темы или свой.
 *
 * Готовые идут первыми, потому что закрывают почти все случаи и меняются
 * вместе с темой: перекрасив тему, человек перекрашивает и смены. Свой цвет —
 * последняя клетка в ряду; выбрав её, человек получает тот же квадрат оттенка,
 * что и в редакторе темы, прямо здесь, без перехода на другой экран.
 *
 * Свой цвет от темы не зависит: он остаётся тем же в любой из них. Буква
 * поверх него подбирается сама — отдельного вопроса про неё нет.
 *
 * Выбранный вариант помечен галочкой и утолщённой рамкой, а не только тем, что
 * он выбранный: отличить «этот кружок сейчас активен» по одному лишь цвету
 * нельзя ни при дальтонизме, ни в списке из десяти оттенков.
 */
export function ColorChoice({ colorToken, color, onChange, badge }: ColorChoiceProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState<string | null>(null);

  const own = color !== undefined;
  const fallback = theme.colors.shifts[colorToken]?.surface ?? theme.colors.surface;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="label" tone="muted">
        Цвет в календаре
      </AppText>
      <AppText variant="caption" tone="muted">
        Готовые оттенки меняются вместе с темой оформления. Плитка с карандашом задаёт свой цвет —
        он остаётся таким же в любой теме.
      </AppText>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Цвет смены"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
      >
        {SHIFT_COLOR_TOKENS.map((token) => {
          const pair = theme.colors.shifts[token];
          const name = SHIFT_COLOR_NAMES[token] ?? token;
          const selected = !own && token === colorToken;

          return (
            <Swatch
              key={token}
              label={name}
              badge={badge}
              surface={pair.surface}
              on={pair.on}
              selected={selected}
              focused={focused === token}
              onFocus={() => setFocused(token)}
              onBlur={() => setFocused(null)}
              onPress={() => onChange({ colorToken: token })}
            />
          );
        })}

        {/* Последняя плитка — с карандашом: на ней не оттенок, а действие
            «задать свой». Пока цвет не задан, она стоит на нынешнем цвете
            смены — так видно, от чего человек будет отталкиваться. */}
        <Swatch
          label={own ? `Свой цвет ${color}` : 'Задать свой цвет'}
          icon="create-outline"
          badge={badge}
          surface={color ?? fallback}
          on={markerOn(color ?? fallback)}
          selected={own}
          focused={focused === 'own'}
          onFocus={() => setFocused('own')}
          onBlur={() => setFocused(null)}
          // Свой цвет начинается с нынешнего: так его правят, а не подбирают с нуля.
          onPress={() => onChange({ colorToken, color: color ?? fallback })}
        />
      </View>

      {own ? (
        <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
          <ColorPicker
            value={color}
            onChange={(next) => onChange({ colorToken, color: next })}
            label="Цвет смены"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Вернуть оттенок темы"
            accessibilityHint="Смена снова будет краситься выбранным оттенком палитры"
            onPress={() => onChange({ colorToken })}
            style={{
              minHeight: theme.minTouchTarget,
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: theme.radius.md,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            <AppText variant="label">Вернуть оттенок темы</AppText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

interface SwatchProps {
  label: string;
  /**
   * Значок вместо буквы-маркера. Стоит на плитке «свой цвет»: она не оттенок,
   * а действие, и путать её с готовыми оттенками нельзя.
   */
  icon?: ComponentProps<typeof Ionicons>['name'];
  badge: string;
  surface: string;
  on: string;
  selected: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
}

/** Одна клетка выбора: та же буква, что окажется в календаре, на своей заливке. */
function Swatch({
  label,
  icon,
  badge,
  surface,
  on,
  selected,
  focused,
  onFocus,
  onBlur,
  onPress,
}: SwatchProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        borderRadius: theme.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: surface,
        borderWidth: selected || focused ? theme.focusRingWidth : 1,
        borderColor: focused ? theme.colors.focus : selected ? on : theme.colors.border,
      }}
    >
      {/* Внутри — та самая буква, что окажется в клетке календаря: цвет
          выбирают, чтобы её было видно, а не сам по себе. */}
      <View importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
        {icon ? (
          <Ionicons name={selected ? 'checkmark' : icon} size={18} color={on} />
        ) : selected ? (
          <Ionicons name="checkmark" size={16} color={on} />
        ) : (
          <AppText variant="badge" color={on} numberOfLines={1}>
            {badge}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}
