/** Промежуток между клетками. Два пункта — компромисс ради зоны нажатия. */
export const GRID_GAP = 2;

/** Строк в сетке всегда шесть: иначе высота прыгает при листании месяцев. */
export const GRID_ROWS = 6;

export interface GridMetrics {
  cellSize: number;
  /** Реальная ширина сетки: она чуть меньше экрана из-за округления клетки. */
  gridWidth: number;
  height: number;
}

/**
 * Размеры месячной сетки.
 *
 * Клетка округляется ВНИЗ. Это не косметика: при дробной ширине сумма семи
 * клеток и шести промежутков вылезала за контейнер на доли пикселя, flexWrap
 * переносил седьмую клетку на новую строку, и весь месяц смещался на колонку —
 * воскресенья оставались пустыми. Остаток ширины уходит в поля по краям.
 *
 * Лежит отдельно от компонента намеренно: чистую арифметику можно прогнать
 * тестами в обычном Node, а файл с разметкой — нельзя.
 */
export function gridMetrics(width: number): GridMetrics {
  const cellSize = Math.floor((width - GRID_GAP * 6) / 7);
  const gridWidth = cellSize * 7 + GRID_GAP * 6;
  return { cellSize, gridWidth, height: GRID_ROWS * (cellSize + GRID_GAP) };
}
