import { useMemo } from 'react';
import { applyOverrides, darkPalette, lightPalette } from '@/theme';
import type { Palette, PaletteOverrides, SchemeName } from '@/theme';
import { useAppStore } from '@/data/store.ts';

/**
 * Палитра выбранной темы с цветами человека — не обязательно той темы, что
 * сейчас на экране.
 *
 * Тёмная тема правится из светлой и наоборот, поэтому брать цвета из useTheme
 * здесь нельзя: они всегда про активную тему.
 *
 * extra — ещё не сохранённый цвет из-под пальца: экран правки показывает
 * образец до нажатия «Сохранить». Объект обязан быть стабильным между
 * рендерами, иначе палитра пересобирается на каждый кадр.
 */
export function useEditedPalette(scheme: SchemeName, extra?: PaletteOverrides): Palette {
  const overrides = useAppStore((state) => state.themeColors[scheme]);

  return useMemo(
    () =>
      applyOverrides(scheme === 'dark' ? darkPalette : lightPalette, { ...overrides, ...extra }),
    [scheme, overrides, extra],
  );
}
