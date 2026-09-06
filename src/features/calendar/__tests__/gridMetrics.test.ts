import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_FONT_SCALE_CAP, GRID_GAP, gridHeight, gridMetrics } from '../gridMetrics.ts';

/**
 * Регрессия на реальную поломку: при дробной ширине клетки семь клеток и шесть
 * промежутков вылезали за контейнер, flexWrap переносил седьмую на новую
 * строку, и весь месяц смещался на колонку — воскресенья пустовали.
 */
test('семь клеток и промежутки никогда не шире контейнера', () => {
  // Ширины реальных Android-экранов в dp плюс заведомо неудобные значения.
  for (const width of [320, 360, 384, 393, 411, 412, 428, 480, 582, 600, 720, 1000, 333, 347]) {
    const { cellSize, gridWidth } = gridMetrics(width);
    assert.equal(gridWidth, cellSize * 7 + GRID_GAP * 6, `ширина ${width}`);
    assert.ok(gridWidth <= width, `сетка ${gridWidth} шире контейнера ${width}`);
    assert.ok(Number.isInteger(cellSize), `дробная клетка при ширине ${width}`);
  }
});

test('остаток ширины меньше семи пунктов — поля по краям незаметны', () => {
  for (const width of [320, 360, 393, 412, 582]) {
    const { gridWidth } = gridMetrics(width);
    assert.ok(width - gridWidth < 7, `при ширине ${width} остаётся ${width - gridWidth}`);
  }
});

test('высота считается по числу недель месяца', () => {
  const { cellHeight } = gridMetrics(360);
  for (const rows of [4, 5, 6]) {
    assert.equal(gridHeight(360, rows), rows * (cellHeight + GRID_GAP), `${rows} строк`);
  }
});

/**
 * Крупный системный шрифт. Регрессия на жалобу «шрифт не вмещается в клетки»:
 * число дня и буква-маркер в квадрат со стороной width / 7 при 200% не
 * помещаются, а вширь клетке деваться некуда.
 */
test('при крупном шрифте клетка вытягивается вниз, а ширина не меняется', () => {
  for (const width of [320, 360, 412]) {
    const normal = gridMetrics(width, 1);
    const huge = gridMetrics(width, 2);

    assert.equal(huge.cellSize, normal.cellSize, `ширина при ${width}`);
    assert.equal(huge.gridWidth, normal.gridWidth, `сетка при ${width}`);
    assert.ok(huge.cellHeight >= normal.cellHeight, `высота при ${width}`);
    // Текста в клетке 36 пунктов межстрочного плюс воздух; выше потолка
    // масштаба клетка не растёт — его держит сам DayCell.
    assert.ok(huge.cellHeight >= 36 * CELL_FONT_SCALE_CAP, `текст не влезает при ${width}`);
  }
});

test('высота страницы растёт вместе со шрифтом: сетка не вылезает за отведённое', () => {
  assert.ok(gridHeight(360, 6, 2) > gridHeight(360, 6, 1));
  assert.equal(gridHeight(360, 6, 2), 6 * (gridMetrics(360, 2).cellHeight + GRID_GAP));
});

test('на узком экране клетка дотягивает до зоны нажатия хотя бы по высоте', () => {
  // 320 пунктов на семь колонок дают 44 в ширину — шире не сделать, колонок
  // семь. Высоту довести до 48 можно, и это лучше, чем 44 на 44.
  const { cellSize, cellHeight } = gridMetrics(320);
  assert.ok(cellSize < 48);
  assert.ok(cellHeight >= 48);
});
