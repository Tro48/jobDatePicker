import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_GAP, gridMetrics } from '../gridMetrics.ts';

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

test('высота считается по шести строкам', () => {
  const { cellSize, height } = gridMetrics(360);
  assert.equal(height, 6 * (cellSize + GRID_GAP));
});
