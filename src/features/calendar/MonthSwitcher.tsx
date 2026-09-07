import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatMonthTitle } from '@/domain/format.ts';
import { FIRST_PERIOD, LAST_PERIOD, monthRefOf } from '@/domain/months.ts';
import { shiftPeriod } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import { AppText, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { MonthPicker } from './MonthPicker.tsx';

export interface MonthSwitcherProps {
  /** Открытый месяц. */
  period: Period;
  /** Куда переехать: соседний месяц со стрелки или любой другой из окна выбора. */
  onChange: (period: Period) => void;
}

/**
 * Шапка месяца: стрелки по соседям и название, открывающее выбор месяца и года.
 *
 * Одна на календарь и сводку — экраны ходят по одним и тем же месяцам, и
 * расходиться в том, как по ним ходят, им нельзя.
 *
 * Название — кнопка, а не заголовок страницы: роль у элемента одна, и роль
 * кнопки здесь важнее. Без неё нажатие на название не объявляется вовсе, и
 * добраться до далёкого месяца можно только стрелками — по одному месяцу за
 * нажатие. Смена месяца по-прежнему проговаривается: за это отвечает
 * accessibilityLiveRegion.
 */
export function MonthSwitcher({ period, onChange }: MonthSwitcherProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const current = monthRefOf(period);
  const title = formatMonthTitle(current.year, current.month);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        name="chevron-back"
        label="Предыдущий месяц"
        disabled={period <= FIRST_PERIOD}
        onPress={() => onChange(shiftPeriod(period, -1))}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint="Открывает выбор месяца и года"
        accessibilityState={{ expanded: open }}
        accessibilityLiveRegion="polite"
        onPress={() => setOpen(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: focused ? theme.focusRingWidth : 0,
          borderColor: theme.colors.focus,
        }}
      >
        <AppText variant="title" importantForAccessibility="no" style={{ textAlign: 'center' }}>
          {title}
        </AppText>
        {/* Стрелка вниз — единственный знак того, что название нажимается:
            цветом или подчёркиванием этого не показать, шапка и так пёстрая. */}
        <Ionicons
          name="chevron-down"
          size={20}
          color={theme.colors.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>

      <IconButton
        name="chevron-forward"
        label="Следующий месяц"
        disabled={period >= LAST_PERIOD}
        onPress={() => onChange(shiftPeriod(period, 1))}
      />

      {/* Окно живёт, только пока открыто: так выбранный в нём год сбрасывается
          к открытому месяцу на каждое открытие. */}
      {open ? (
        <MonthPicker
          period={period}
          onPick={(next) => {
            onChange(next);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}
