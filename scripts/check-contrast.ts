/**
 * Проверка палитры по WCAG 2.1. Запуск:
 *   node --experimental-strip-types scripts/check-contrast.ts
 *
 * Пороги: обычный текст 4.5:1, границы интерактивных элементов и кольцо
 * фокуса 3:1. Скрипт возвращает ненулевой код, если что-то не проходит, —
 * чтобы палитру нельзя было «поправить на глаз» и сломать доступность.
 *
 * Сами правила лежат в src/theme/checks.ts и здесь только исполняются: по ним
 * же приложение предупреждает человека, задавшего свой цвет. Скрипт проверяет
 * палитру из кода — ту, с которой приложение ставится; заданные руками цвета
 * живут на телефоне, и до них CI не дотягивается.
 */
import { paletteChecks, runCheck } from '../src/theme/checks.ts';
import { palettes } from '../src/theme/palette.ts';

let failures = 0;
for (const [themeName, palette] of Object.entries(palettes)) {
  console.log(`\n${themeName === 'light' ? 'Светлая тема' : 'Тёмная тема'}`);
  for (const check of paletteChecks(palette)) {
    const { ratio, passed } = runCheck(palette, check);
    if (!passed) failures += 1;
    console.log(
      `  ${passed ? 'ok  ' : 'FAIL'} ${ratio.toFixed(2).padStart(5)}:1 (нужно ${check.minimum}) — ${check.label}`,
    );
  }
}

console.log(
  failures === 0 ? '\nВся палитра проходит пороги WCAG.' : `\nНе проходит проверок: ${failures}`,
);
process.exit(failures === 0 ? 0 : 1);
