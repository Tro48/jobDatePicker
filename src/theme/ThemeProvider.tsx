import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { darkPalette, fadedShiftPair, lightPalette } from './palette.ts';
import type { ColorPair, Palette } from './palette.ts';
import { EMPTY_THEME_COLORS, applyOverrides } from './slots.ts';
import type { PaletteOverrides, SchemeName } from './slots.ts';
import { FOCUS_RING_WIDTH, MIN_TOUCH_TARGET, radius, spacing, typography } from './typography.ts';
import { useAppStore } from '@/data/store.ts';

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
 * Тема схемы с учётом цветов, заданных человеком.
 *
 * Поправки накладываются здесь, а не в палитре: палитра в коде — это то, с чем
 * приложение ставится и что проверяет CI, и переписывать её значениями с
 * телефона нельзя, иначе сброс оформления было бы неоткуда взять.
 */
export function buildTheme(scheme: SchemeName, overrides: PaletteOverrides = {}): Theme {
  return {
    scheme,
    colors: applyOverrides(scheme === 'dark' ? darkPalette : lightPalette, overrides),
    spacing,
    radius,
    typography,
    minTouchTarget: MIN_TOUCH_TARGET,
    focusRingWidth: FOCUS_RING_WIDTH,
  };
}

const ThemeContext = createContext<Theme>(buildTheme('light'));

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = useAppStore((state) => state.appearance);
  const themeColors = useAppStore((state) => state.themeColors);

  const scheme: SchemeName =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const overrides = (themeColors ?? EMPTY_THEME_COLORS)[scheme];
  const theme = useMemo(() => buildTheme(scheme, overrides), [scheme, overrides]);

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

/**
 * Цвета конкретной смены в текущей теме. Неизвестный токен не роняет экран, а
 * отдаёт нейтральную пару: новый тип смены мог появиться раньше, чем цвет для
 * него.
 *
 * faded — смена уже отработана: заливка уходит в серый, подпись остаётся.
 */
export function useShiftColors(colorToken: string, options: { faded?: boolean } = {}): ColorPair {
  const theme = useTheme();
  const pair = theme.colors.shifts[colorToken] ?? {
    surface: theme.colors.surface,
    on: theme.colors.text,
  };

  return options.faded ? fadedShiftPair(pair, theme.colors.surface) : pair;
}
