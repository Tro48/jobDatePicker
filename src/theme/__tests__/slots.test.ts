import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_GROUPS,
  COLOR_SLOTS,
  applyOverrides,
  findColorSlot,
  sanitizeOverrides,
  sanitizeThemeColors,
  slotsOfGroup,
} from '../slots.ts';
import { darkPalette, lightPalette } from '../palette.ts';
import { contrastRatio } from '../color.ts';

/** Цвета, которые считаются от заданных, а не спрашиваются отдельно. */
const DERIVED = ['onAccent', 'focus'];

test('каждый цвет палитры либо настраивается, либо выводится из настраиваемого', () => {
  const ids = new Set(COLOR_SLOTS.map((slot) => slot.id));

  // Незакрытый цвет означал бы, что в приложении он есть, а на экране правки
  // его нет и вывести его неоткуда.
  for (const key of Object.keys(lightPalette)) {
    if (key === 'shifts' || key === 'highlight' || key === 'baseWeekday') continue;
    assert.ok(ids.has(key) || DERIVED.includes(key), key);
  }

  // У пары задаётся только заливка: подпись поверх неё считается.
  for (const key of ['highlight', 'baseWeekday']) {
    assert.ok(ids.has(`${key}.surface`), key);
    assert.ok(!ids.has(`${key}.on`), key);
  }

  for (const token of Object.keys(lightPalette.shifts)) {
    assert.ok(ids.has(`${token}.surface`), token);
    assert.ok(!ids.has(`${token}.on`), token);
  }
});

test('буква на заданной заливке подбирается и остаётся читаемой', () => {
  for (const fill of ['#FFE066', '#101820', '#7C2D12', '#FFFFFF', '#000000', '#808080']) {
    const painted = applyOverrides(lightPalette, { 'shift.day.surface': fill });
    const pair = painted.shifts['shift.day'];

    assert.equal(pair.surface, fill, fill);
    assert.ok(contrastRatio(pair.on, pair.surface) >= 4.5, `${fill} → ${pair.on}`);
  }
});

test('подпись и кольцо фокуса идут за акцентом', () => {
  const painted = applyOverrides(lightPalette, { accent: '#0B3D91' });

  assert.equal(painted.focus, '#0B3D91');
  assert.equal(painted.onAccent, '#FFFFFF');
  assert.ok(contrastRatio(painted.onAccent, painted.accent) >= 4.5);
});

test('нетронутые цвета остаются такими, как в коде', () => {
  // Пары палитры подобраны руками и проверены скриптом контраста: пока человек
  // заливку не тронул, считать подпись за него незачем.
  const painted = applyOverrides(lightPalette, { accent: '#0B3D91' });

  assert.deepEqual(painted.shifts['shift.day'], lightPalette.shifts['shift.day']);
  assert.deepEqual(painted.highlight, lightPalette.highlight);
});

test('слоты не повторяются и разложены по разделам', () => {
  assert.equal(new Set(COLOR_SLOTS.map((slot) => slot.id)).size, COLOR_SLOTS.length);

  const byGroup = COLOR_GROUPS.flatMap((group) => slotsOfGroup(group.id));
  assert.equal(byGroup.length, COLOR_SLOTS.length);
});

test('слот читает и пишет тот цвет, за который отвечает', () => {
  for (const slot of COLOR_SLOTS) {
    const painted = applyOverrides(lightPalette, { [slot.id]: '#123456' });
    assert.equal(slot.read(painted), '#123456', slot.id);
    // Исходная палитра не тронута: она общая на всё приложение.
    assert.notEqual(slot.read(lightPalette), '#123456', slot.id);
  }
});

test('поправки одной темы не задевают другую', () => {
  const painted = applyOverrides(lightPalette, { background: '#000000' });
  assert.equal(painted.background, '#000000');
  assert.equal(darkPalette.background, '#0F1115');
  assert.equal(lightPalette.background, '#FFFFFF');
});

test('без поправок возвращается та же палитра, а не копия', () => {
  assert.equal(applyOverrides(lightPalette, {}), lightPalette);
  // Незнакомый слот — тоже «нечего менять»: так бывает после отката приложения
  // на прошлую версию.
  assert.equal(applyOverrides(lightPalette, { 'shift.moon.surface': '#FFFFFF' }), lightPalette);
});

test('в палитру попадает только шестнадцатеричный цвет', () => {
  const clean = sanitizeOverrides({
    accent: '#abc',
    background: 'red',
    text: 'rgb(0,0,0)',
    'shift.day.surface': '#112233',
    'shift.night.surface': 42,
    // Цвета буквы больше нет среди настраиваемых: он считается.
    'shift.day.on': '#FFFFFF',
    'shift.moon.surface': '#FFFFFF',
  });

  assert.deepEqual(clean, { accent: '#AABBCC', 'shift.day.surface': '#112233' });
});

test('мусор вместо набора цветов даёт пустые темы', () => {
  for (const value of [null, undefined, 'тема', 7, []]) {
    assert.deepEqual(sanitizeThemeColors(value), { light: {}, dark: {} });
  }

  assert.deepEqual(sanitizeThemeColors({ light: { accent: '#000' }, dark: null }), {
    light: { accent: '#000000' },
    dark: {},
  });
});

test('слот ищется по имени, несуществующий не находится', () => {
  assert.equal(findColorSlot('accent')?.id, 'accent');
  assert.equal(findColorSlot('shift.day.surface')?.id, 'shift.day.surface');
  assert.equal(findColorSlot('нет такого'), null);
});
