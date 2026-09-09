import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteChecks, runCheck } from '../checks.ts';
import { lightPalette, palettes } from '../palette.ts';
import type { Palette } from '../palette.ts';
import { paintSlot } from '../slots.ts';

test('палитра из кода проходит все пороги', () => {
  for (const [name, palette] of Object.entries(palettes)) {
    for (const check of paletteChecks(palette)) {
      const { ratio, passed } = runCheck(palette, check);
      assert.ok(passed, `${name}: ${check.label} — ${ratio.toFixed(2)}:1`);
    }
  }
});

test('каждая проверка что-то проверяет и названа по-своему', () => {
  const checks = paletteChecks(lightPalette);
  const labels = new Set(checks.map((check) => check.label));

  assert.ok(checks.length > 0);
  // Две проверки с одним именем — это молча потерянная проверка в выводе
  // скрипта: по названию не понять, какая из них упала.
  assert.equal(labels.size, checks.length);
});

test('жёлтая заливка с белой подписью не проходит порог', () => {
  // Собрано руками, а не через applyOverrides: заданную человеком заливку
  // приложение так не покрасит — подпись оно считает само. Проверка ловит
  // такую пару в палитре из кода, ради чего и живёт.
  const broken: Palette = {
    ...lightPalette,
    shifts: { ...lightPalette.shifts, 'shift.day': { surface: '#FFE066', on: '#FFFFFF' } },
  };

  const failed = paletteChecks(broken)
    .map((check) => runCheck(broken, check))
    .filter((result) => !result.passed);

  assert.ok(failed.some((result) => result.check.label === 'shift.day: подпись на заливке'));
});

test('на цвета, заданные человеком, порог не влияет: он только считается', () => {
  // Приложение такой цвет принимает и показывает — проверка здесь ради CI и
  // палитры из кода, а не ради запрета на телефоне.
  const broken = paintSlot(lightPalette, 'textMuted', '#DDDDDD');
  const failed = paletteChecks(broken)
    .map((check) => runCheck(broken, check))
    .filter((result) => !result.passed);

  assert.ok(failed.length > 0);
  assert.equal(broken.textMuted, '#DDDDDD');
});
