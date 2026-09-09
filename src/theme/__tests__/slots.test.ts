import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_GROUPS,
  COLOR_SLOTS,
  findColorSlot,
  paintSlot,
  paletteOf,
  sanitizePalette,
  slotsOfGroup,
} from '../slots.ts';
import { darkPalette, lightPalette } from '../palette.ts';
import { contrastRatio } from '../color.ts';

/** Цвета, которые считаются от заданных, а не спрашиваются отдельно. */
const DERIVED = ['onAccent', 'focus'];

test('каждый цвет темы либо настраивается, либо выводится из настраиваемого', () => {
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
});

test('цвета смен в теме не настраиваются: они у самой смены', () => {
  const ids = new Set(COLOR_SLOTS.map((slot) => slot.id));

  for (const token of Object.keys(lightPalette.shifts)) {
    assert.ok(!ids.has(`${token}.surface`), token);
    assert.ok(!ids.has(`${token}.on`), token);
  }
});

test('подпись на заданной заливке подбирается и остаётся читаемой', () => {
  for (const fill of ['#FFE066', '#101820', '#7C2D12', '#FFFFFF', '#000000', '#808080']) {
    const painted = paintSlot(lightPalette, 'highlight.surface', fill);

    assert.equal(painted.highlight.surface, fill, fill);
    assert.ok(
      contrastRatio(painted.highlight.on, painted.highlight.surface) >= 4.5,
      `${fill} → ${painted.highlight.on}`,
    );
  }
});

test('подпись и кольцо фокуса идут за акцентом', () => {
  const painted = paintSlot(lightPalette, 'accent', '#0B3D91');

  assert.equal(painted.focus, '#0B3D91');
  assert.equal(painted.onAccent, '#FFFFFF');
  assert.ok(contrastRatio(painted.onAccent, painted.accent) >= 4.5);
});

test('нетронутые цвета остаются такими, как в коде', () => {
  const painted = paintSlot(lightPalette, 'accent', '#0B3D91');

  assert.deepEqual(painted.shifts['shift.day'], lightPalette.shifts['shift.day']);
  assert.deepEqual(painted.baseWeekday, lightPalette.baseWeekday);
});

test('палитра темы — копия, а исходная остаётся нетронутой', () => {
  const copy = paletteOf('dark');
  const painted = paintSlot(copy, 'background', '#101010');

  assert.equal(painted.background, '#101010');
  assert.equal(copy.background, darkPalette.background);
  assert.equal(darkPalette.background, '#0F1115');
  // Смены тоже копируются: правка одной темы не должна доставать до другой.
  assert.notEqual(copy.shifts, darkPalette.shifts);
});

test('слоты не повторяются и разложены по разделам', () => {
  assert.equal(new Set(COLOR_SLOTS.map((slot) => slot.id)).size, COLOR_SLOTS.length);

  const byGroup = COLOR_GROUPS.flatMap((group) => slotsOfGroup(group.id));
  assert.equal(byGroup.length, COLOR_SLOTS.length);
});

test('слот читает и пишет тот цвет, за который отвечает', () => {
  for (const slot of COLOR_SLOTS) {
    const painted = paintSlot(lightPalette, slot.id, '#123456');
    assert.equal(slot.read(painted), '#123456', slot.id);
    // Исходная палитра не тронута: она общая на всё приложение.
    assert.notEqual(slot.read(lightPalette), '#123456', slot.id);
  }
});

test('незнакомый слот и негодный цвет ничего не меняют', () => {
  // Первое бывает после отката приложения на прошлую версию, второе — пока
  // код набирают по букве.
  assert.equal(paintSlot(lightPalette, 'shift.moon.surface', '#FFFFFF'), lightPalette);
  assert.equal(paintSlot(lightPalette, 'accent', '#12'), lightPalette);
  assert.equal(paintSlot(lightPalette, 'accent', 'red'), lightPalette);
});

test('в палитру темы попадает только шестнадцатеричный цвет', () => {
  const clean = sanitizePalette({
    accent: '#abc',
    background: 'red; position:absolute',
    text: 'rgb(0,0,0)',
    shifts: { 'shift.day': { surface: '#112233' }, 'shift.night': { surface: 42 } },
  });

  assert.equal(clean.accent, '#AABBCC');
  assert.equal(clean.shifts['shift.day'].surface, '#112233');
  // Всё, что цветом не является, берётся из палитры-основы: тема с дырой
  // вместо фона уронила бы каждый экран.
  assert.equal(clean.background, lightPalette.background);
  assert.equal(clean.text, lightPalette.text);
  assert.equal(clean.shifts['shift.night'].surface, lightPalette.shifts['shift.night'].surface);
});

test('мусор вместо палитры даёт палитру-основу целиком', () => {
  for (const value of [null, undefined, 'тема', 7, []]) {
    assert.deepEqual(sanitizePalette(value, 'dark'), paletteOf('dark'));
  }
});

test('выводимые цвета читаются как есть, а негодные берутся из основы', () => {
  // Их посчитали при записи цвета — здесь навязывать расчёт заново значило бы
  // затирать пары палитры, подобранные руками.
  const clean = sanitizePalette({ accent: '#0B3D91', onAccent: '#FFFFFF', focus: '#0B3D91' });
  assert.equal(clean.onAccent, '#FFFFFF');
  assert.equal(clean.focus, '#0B3D91');

  const dirty = sanitizePalette({ onAccent: 'white', focus: null });
  assert.equal(dirty.onAccent, lightPalette.onAccent);
  assert.equal(dirty.focus, lightPalette.focus);
});

test('слот ищется по имени, несуществующий не находится', () => {
  assert.equal(findColorSlot('accent')?.id, 'accent');
  assert.equal(findColorSlot('highlight.surface')?.id, 'highlight.surface');
  assert.equal(findColorSlot('нет такого'), null);
  // Цвет смены слотом не является: его правят в редакторе смены.
  assert.equal(findColorSlot('shift.day.surface'), null);
});
