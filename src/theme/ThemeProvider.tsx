import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { darkPalette, fadedShiftPair, lightPalette } from './palette.ts';
import type { ColorPair, Palette } from './palette.ts';
import type { SchemeName } from './slots.ts';
import { markerOn, readableOn } from './color.ts';
import { FOCUS_RING_WIDTH, MIN_TOUCH_TARGET, radius, spacing, typography } from './typography.ts';
import { useAppStore } from '@/data/store.ts';

/** Приставка у своей темы в настройке оформления: «custom:<id>». */
export const CUSTOM_PREFIX = 'custom:';

export interface Theme {
  scheme: SchemeName;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  minTouchTarget: number;
  focusRingWidth: number;
}

/**
 * Тема из готовой палитры.
 *
 * Палитра приходит снаружи: у встроенных тем она из кода, у своей — из
 * хранилища. Светлая тема это или тёмная, спрашивать не нужно — видно по фону:
 * от этого зависят значки в системной строке, и своя тема на чёрном фоне
 * обязана вести себя как тёмная, кем бы её ни назвали.
 */
export function buildTheme(colors: Palette): Theme {
  return {
    scheme: readableOn(colors.background) === '#FFFFFF' ? 'dark' : 'light',
    colors,
    spacing,
    radius,
    typography,
    minTouchTarget: MIN_TOUCH_TARGET,
    focusRingWidth: FOCUS_RING_WIDTH,
  };
}

const ThemeContext = createContext<Theme>(buildTheme(lightPalette));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = useAppStore((state) => state.appearance);
  const themes = useAppStore((state) => state.themes);

  // Своя тема названа «custom:<id>». Пропала вместе с удалением — значит
  // экраны рисуются системной: пустого экрана из-за исчезнувшей темы быть не
  // должно.
  const custom = preference.startsWith(CUSTOM_PREFIX)
    ? (themes.find((item) => item.id === preference.slice(CUSTOM_PREFIX.length)) ?? null)
    : null;

  const dark = preference === 'dark' || (preference === 'system' && systemScheme === 'dark');
  const colors = custom ? custom.colors : dark ? darkPalette : lightPalette;

  const theme = useMemo(() => buildTheme(colors), [colors]);

  // Фон под корневым View: иначе при листании за границу экрана видно белую
  // подложку системы, и в тёмной теме это бьёт по глазам.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme.colors.background]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Откуда смена берёт цвет: свой или оттенок палитры. */
export interface ShiftColorSource {
  colorToken: string;
  /** Свой цвет смены. Задан — оттенок палитры не смотрят вовсе. */
  color?: string;
}

/**
 * Цвета конкретной смены в текущей теме.
 *
 * Свой цвет смены идёт мимо палитры: человек выбрал его в редакторе смены и
 * ждёт именно его, в какой бы теме ни открыл календарь. Букву-маркер на нём
 * приложение подбирает само — отдельного вопроса про неё нет.
 *
 * Неизвестный токен не роняет экран, а отдаёт нейтральную пару: новый тип
 * смены мог появиться раньше, чем цвет для него.
 *
 * faded — смена уже отработана: заливка уходит в серый, подпись остаётся.
 */
export function useShiftColors(
  source: ShiftColorSource,
  options: { faded?: boolean } = {},
): ColorPair {
  const theme = useTheme();
  const own = source.color;
  const pair: ColorPair = own
    ? { surface: own, on: markerOn(own) }
    : (theme.colors.shifts[source.colorToken] ?? {
        surface: theme.colors.surface,
        on: theme.colors.text,
      });

  return options.faded ? fadedShiftPair(pair, theme.colors.surface) : pair;
}
