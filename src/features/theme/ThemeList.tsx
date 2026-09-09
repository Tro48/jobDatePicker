import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText, Button, IconButton } from '@/ui';
import { useAppStore } from '@/data/store.ts';
import type { ThemePreference } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { CUSTOM_PREFIX, useTheme } from '@/theme';

/** Встроенные варианты. Свои темы встают в тот же список следом за ними. */
const BUILT_IN: ReadonlyArray<{ value: ThemePreference; label: string; hint?: string }> = [
  { value: 'system', label: 'Как в системе', hint: 'Следовать настройке телефона' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

/**
 * Оформление: встроенные темы и свои в одном списке.
 *
 * Свои живут здесь же, а не отдельной настройкой: выбор темы один, и держать
 * его в двух местах значило бы спрашивать человека дважды об одном. У своей
 * темы рядом с кружком выбора стоит кнопка правки — она открывает редактор, не
 * переключая тему.
 */
export function ThemeList() {
  const theme = useTheme();
  const push = useGuardedPush();
  const appearance = useAppStore((state) => state.appearance);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const addTheme = useAppStore((state) => state.addTheme);
  const themes = useAppStore((state) => state.themes);

  /**
   * Новая тема снимается с той, что человек сейчас видит: светлая днём,
   * тёмная ночью, чужая своя — если показана она. Спрашивать основу отдельно
   * незачем, а заводить тему до открытия редактора нужно затем, чтобы он сразу
   * показывал цвета: копия того, что и так есть, без них ничего не объясняет.
   */
  const create = (): void => {
    const id = addTheme('', theme.colors);
    push({ pathname: '/settings/theme', params: { theme: id } });
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Тема оформления"
      style={{ gap: theme.spacing.sm }}
    >
      {BUILT_IN.map((choice) => (
        <ThemeRow
          key={choice.value}
          label={choice.label}
          hint={choice.hint}
          selected={appearance === choice.value}
          onPress={() => setAppearance(choice.value)}
        />
      ))}

      {themes.map((item) => (
        <ThemeRow
          key={item.id}
          label={item.name}
          hint="Своя тема"
          selected={appearance === `${CUSTOM_PREFIX}${item.id}`}
          onPress={() => setAppearance(`${CUSTOM_PREFIX}${item.id}`)}
          action={
            <IconButton
              name="create-outline"
              label={`Изменить тему «${item.name}»`}
              onPress={() => push({ pathname: '/settings/theme', params: { theme: item.id } })}
            />
          }
        />
      ))}

      <Button
        title="Создать тему"
        icon="add"
        accessibilityHint="Копия показанной темы: имя и цвета правятся сразу"
        onPress={create}
      />
    </View>
  );
}

interface ThemeRowProps {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  /** Кнопка правки у своей темы. Встроенные править нечем. */
  action?: React.ReactNode;
}

/**
 * Строка выбора темы.
 *
 * Выбранная помечена галочкой и жирным начертанием, а не только цветом рамки:
 * отличить активную строку по одному лишь цвету нельзя ни при дальтонизме, ни
 * в списке из шести строк.
 */
function ThemeRow({ label, hint, selected, onPress, action }: ThemeRowProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, checked: selected }}
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minHeight: theme.minTouchTarget,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: selected || focused ? theme.focusRingWidth : 1,
          borderColor: focused
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
          color={selected ? theme.colors.accent : theme.colors.border}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <View style={{ flex: 1 }}>
          <AppText variant="body" style={{ fontWeight: selected ? '700' : '400' }}>
            {label}
          </AppText>
          {hint ? (
            <AppText variant="caption" tone="muted">
              {hint}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {action}
    </View>
  );
}
