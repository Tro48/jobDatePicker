import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio,
  hexToHsv,
  hsvToHex,
  isHex,
  mixHex,
  normalizeHex,
  readableOn,
} from '../color.ts';

test('цвет читается в любой записи', () => {
  assert.equal(normalizeHex('#1d4ed8'), '#1D4ED8');
  assert.equal(normalizeHex('1D4ED8'), '#1D4ED8');
  assert.equal(normalizeHex('  #abc  '), '#AABBCC');
  assert.equal(normalizeHex('abc'), '#AABBCC');
});

test('не цвет остаётся не цветом', () => {
  for (const input of ['', '#', '#12', '#12345', '#1234567', 'красный', '#1D4ED', 'rgb(1,2,3)']) {
    assert.equal(normalizeHex(input), null, input);
  }
  assert.equal(isHex('#GGGGGG'), false);
});

test('половина набранного кода — ещё не ошибка, но и не цвет', () => {
  assert.equal(isHex('#1D4'), true);
  assert.equal(isHex('#1D4E'), false);
});

test('контраст считается по WCAG', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF'), 1);
  // Порядок не важен: контраст — это отношение, а не разность.
  assert.equal(
    contrastRatio('#1D4ED8', '#FFFFFF').toFixed(4),
    contrastRatio('#FFFFFF', '#1D4ED8').toFixed(4),
  );
});

test('на светлом читается чёрный, на тёмном — белый', () => {
  assert.equal(readableOn('#FFFFFF'), '#000000');
  assert.equal(readableOn('#0F1115'), '#FFFFFF');
  assert.equal(readableOn('#FAE188'), '#000000');
});

test('перевод в HSV и обратно не теряет цвет', () => {
  for (const hex of ['#1D4ED8', '#FAE188', '#0F1115', '#FFFFFF', '#000000', '#4C1D95']) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex, hex);
  }
});

test('у серого нет тона, и выдумывать его нечем', () => {
  const gray = hexToHsv('#808080');
  assert.equal(gray.h, 0);
  assert.equal(gray.s, 0);
  assert.ok(Math.abs(gray.v - 50) < 1);
  assert.deepEqual(hexToHsv('#000000'), { h: 0, s: 0, v: 0 });
});

test('HSV не округляется: на округлении цвет уезжает', () => {
  // #1D4ED8 — акцент светлой темы. Тон у него 224.3°, и на целых числах цвет
  // возвращается уже другим: ползунки показывали бы не тот цвет, который
  // человек сохранил.
  const exact = hexToHsv('#1D4ED8');
  assert.ok(Math.abs(exact.h - 224.3) < 0.1);

  const rounded = { h: Math.round(exact.h), s: Math.round(exact.s), v: Math.round(exact.v) };
  assert.equal(hsvToHex(exact), '#1D4ED8');
  assert.equal(hsvToHex(rounded), '#1C4ED9');
});

test('крайние тона дают чистые цвета', () => {
  assert.equal(hsvToHex({ h: 0, s: 100, v: 100 }), '#FF0000');
  assert.equal(hsvToHex({ h: 120, s: 100, v: 100 }), '#00FF00');
  assert.equal(hsvToHex({ h: 240, s: 100, v: 100 }), '#0000FF');
  // Круг замыкается: 360 — тот же красный, что и 0.
  assert.equal(hsvToHex({ h: 360, s: 100, v: 100 }), '#FF0000');
});

test('смешение цветов идёт по долям', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080');
});
