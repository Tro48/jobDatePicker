/**
 * Проверка палитры по WCAG 2.1. Запуск:
 *   node --experimental-strip-types scripts/check-contrast.ts
 *
 * Пороги: обычный текст 4.5:1, границы интерактивных элементов и кольцо
 * фокуса 3:1. Скрипт возвращает ненулевой код, если что-то не проходит, —
 * чтобы палитру нельзя было «поправить на глаз» и сломать доступность.
 */
import { palettes } from '../src/theme/palette.ts';
import type { Palette } from '../src/theme/palette.ts';

function channelLuminance(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

interface Check {
  label: string;
  foreground: string;
  background: string;
  minimum: number;
}

function checksFor(palette: Palette): Check[] {
  const checks: Check[] = [
    { label: 'основной текст на фоне', foreground: palette.text, background: palette.background, minimum: 4.5 },
    { label: 'основной текст на панели', foreground: palette.text, background: palette.surface, minimum: 4.5 },
    { label: 'приглушённый текст на фоне', foreground: palette.textMuted, background: palette.background, minimum: 4.5 },
    { label: 'приглушённый текст на панели', foreground: palette.textMuted, background: palette.surface, minimum: 4.5 },
    { label: 'основной текст на поле ввода', foreground: palette.text, background: palette.surfaceElevated, minimum: 4.5 },
    { label: 'приглушённый текст на поле ввода', foreground: palette.textMuted, background: palette.surfaceElevated, minimum: 4.5 },
    { label: 'акцент на поле ввода', foreground: palette.accent, background: palette.surfaceElevated, minimum: 3 },
    { label: 'граница элемента на фоне', foreground: palette.border, background: palette.background, minimum: 3 },
    { label: 'акцент на фоне', foreground: palette.accent, background: palette.background, minimum: 4.5 },
    { label: 'текст на акценте', foreground: palette.onAccent, background: palette.accent, minimum: 4.5 },
    { label: 'кольцо фокуса на фоне', foreground: palette.focus, background: palette.background, minimum: 3 },
    { label: 'кольцо фокуса на панели', foreground: palette.focus, background: palette.surface, minimum: 3 },
    { label: 'цвет ошибки на фоне', foreground: palette.danger, background: palette.background, minimum: 4.5 },
  ];

  for (const [token, pair] of Object.entries(palette.shifts)) {
    checks.push({ label: `${token}: подпись на заливке`, foreground: pair.on, background: pair.surface, minimum: 4.5 });
    checks.push({ label: `${token}: кольцо фокуса на заливке`, foreground: palette.focus, background: pair.surface, minimum: 3 });
  }
  return checks;
}

let failures = 0;
for (const [themeName, palette] of Object.entries(palettes)) {
  console.log(`\n${themeName === 'light' ? 'Светлая тема' : 'Тёмная тема'}`);
  for (const check of checksFor(palette)) {
    const ratio = contrastRatio(check.foreground, check.background);
    const passed = ratio >= check.minimum;
    if (!passed) failures += 1;
    console.log(
      `  ${passed ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(5)}:1 (нужно ${check.minimum}) — ${check.label}`,
    );
  }
}

console.log(failures === 0 ? '\nВся палитра проходит пороги WCAG.' : `\nНе проходит проверок: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
