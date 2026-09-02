import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  floorMod,
  monthDays,
  monthGridDates,
  monthGridRows,
  startOfWeek,
  toIsoDateLocal,
  weekday,
} from '../date.ts';

test('день недели по ISO: понедельник 1, воскресенье 7', () => {
  assert.equal(weekday('2026-08-28'), 5); // пятница
  assert.equal(weekday('2026-08-31'), 1); // понедельник
  assert.equal(weekday('2026-08-30'), 7); // воскресенье
});

test('сложение дней не ломается на переводе часов', () => {
  // Последнее воскресенье марта — переход на летнее время в Европе.
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addDays('2026-10-24', 3), '2026-10-27');
});

test('floorMod даёт неотрицательный остаток для дат до точки отсчёта', () => {
  assert.equal(floorMod(-1, 4), 3);
  assert.equal(floorMod(-4, 4), 0);
  assert.equal(floorMod(-5, 4), 3);
});

test('начало недели — понедельник', () => {
  assert.equal(startOfWeek('2026-08-28'), '2026-08-24');
  assert.equal(startOfWeek('2026-08-24'), '2026-08-24');
});

test('високосный февраль', () => {
  assert.equal(monthDays(2024, 2).length, 29);
  assert.equal(monthDays(2027, 2).length, 28);
  assert.equal(monthDays(2026, 9).at(-1), '2026-09-30');
});

test('дата берётся по локальному времени, а не по UTC', () => {
  // 23:30 по местному времени — это всё ещё 17-е число, в какой бы зоне ни был телефон.
  assert.equal(toIsoDateLocal(new Date(2026, 8, 17, 23, 30)), '2026-09-17');
  assert.equal(toIsoDateLocal(new Date(2026, 0, 1, 0, 5)), '2026-01-01');
  assert.equal(toIsoDateLocal(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('сетка месяца — целые недели подряд, начиная с понедельника', () => {
  const grid = monthGridDates(2026, 9);
  assert.equal(grid.length, 35);
  assert.equal(weekday(grid[0].date), 1);
  assert.equal(weekday(grid[grid.length - 1].date), 7);
  for (let i = 1; i < grid.length; i += 1) {
    assert.equal(grid[i].date, addDays(grid[i - 1].date, 1), `разрыв перед ${grid[i].date}`);
  }
});

/**
 * Регрессия: февраль 2027 начинается с понедельника и кончается воскресеньем,
 * и под ним рисовались две полные недели марта — не хвост месяца, а следующий
 * месяц целиком.
 */
test('целиком чужая неделя в сетку не попадает', () => {
  assert.equal(monthGridRows(2027, 2), 4);
  const grid = monthGridDates(2027, 2);
  assert.equal(grid.length, 28);
  assert.equal(grid[0].date, '2027-02-01');
  assert.equal(grid[27].date, '2027-02-28');
  assert.ok(grid.every((day) => day.inMonth));
});

test('число недель в месяце — от четырёх до шести', () => {
  // Май 2027: 1 мая — суббота, 31 день, последнее число падает на шестую неделю.
  assert.equal(monthGridRows(2027, 5), 6);
  assert.equal(monthGridRows(2026, 9), 5);

  for (let year = 2024; year <= 2032; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const rows = monthGridRows(year, month);
      assert.ok(rows >= 4 && rows <= 6, `${year}-${month}: ${rows} строк`);
      assert.equal(monthGridDates(year, month).length, rows * 7);
    }
  }
});

test('в сетке видны хвосты соседних месяцев', () => {
  const grid = monthGridDates(2026, 9); // 1 сентября 2026 — вторник
  assert.equal(grid[0].date, '2026-08-31');
  assert.equal(grid[0].inMonth, false);
  assert.equal(grid[1].date, '2026-09-01');
  assert.equal(grid[1].inMonth, true);
  assert.equal(grid[30].date, '2026-09-30');
  assert.equal(grid[30].inMonth, true);
  assert.equal(grid[31].date, '2026-10-01');
  assert.equal(grid[31].inMonth, false);
  assert.equal(grid.filter((day) => day.inMonth).length, 30);
});

test('месяц, начинающийся с понедельника, не теряет первое число', () => {
  const grid = monthGridDates(2026, 6); // 1 июня 2026 — понедельник
  assert.equal(grid[0].date, '2026-06-01');
  assert.equal(grid[0].inMonth, true);
  assert.equal(grid.filter((day) => day.inMonth).length, 30);
});

test('каждый день месяца попадает в сетку ровно один раз', () => {
  for (const [year, month] of [
    [2027, 2],
    [2028, 2],
    [2026, 12],
    [2026, 8],
  ] as const) {
    const inMonth = monthGridDates(year, month)
      .filter((day) => day.inMonth)
      .map((day) => day.date);
    assert.deepEqual(inMonth, monthDays(year, month), `месяц ${year}-${month}`);
  }
});
