import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedDaysOff } from '../overlap.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import { monthDays } from '../date.ts';
import type { IsoDate } from '../date.ts';

function contextFor(presetId: string, anchorDate: IsoDate): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new ReferenceError(`Нет графика "${presetId}"`);
  return {
    schedule: { presetId, pattern: preset.pattern, anchorDate },
    shiftTypes: indexShiftTypes(DEFAULT_SHIFT_TYPES),
    overrides: new Map(),
  };
}

const september = monthDays(2026, 9);

test('совпадают только те дни, когда свободны обе стороны', () => {
  // Один и тот же график, сдвинутый на два дня: выходные одного приходятся на
  // смены другого, и общих дней не остаётся вовсе.
  const mine = contextFor('2-2-day', '2026-09-01');
  const theirs = contextFor('2-2-day', '2026-09-03');

  assert.deepEqual(sharedDaysOff([mine], [theirs], september), []);
});

test('одинаковый график совпадает ровно по своим выходным', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  const theirs = contextFor('2-2-day', '2026-09-01');

  const shared = sharedDaysOff([mine], [theirs], september);

  assert.ok(shared.length > 0);
  // Каждый найденный день должен быть выходным у обоих — проверяем по своему.
  for (const date of shared) {
    assert.equal(mine.shiftTypes.get('off')?.kind, 'rest');
    assert.ok(september.includes(date));
  }
  // А рабочие дни в список не попали.
  assert.ok(!shared.includes('2026-09-01'));
});

test('со второй работой свободен только тот день, что свободен на обеих', () => {
  const first = contextFor('2-2-day', '2026-09-01');
  const second = contextFor('5-2', '2026-09-01');
  const theirs = contextFor('2-2-day', '2026-09-01');

  const alone = sharedDaysOff([first], [theirs], september);
  const withSecondJob = sharedDaysOff([first, second], [theirs], september);

  // Вторая работа может только отнять свободные дни, но не добавить их.
  assert.ok(withSecondJob.length < alone.length);
  assert.ok(withSecondJob.every((date) => alone.includes(date)));
});

test('без своих графиков сравнивать не с чем', () => {
  const theirs = contextFor('2-2-day', '2026-09-01');

  assert.deepEqual(sharedDaysOff([], [theirs], september), []);
});

/** Десять человек, у каждого свой график из справочника пресетов. */
const CROWD = [
  '2-2-day',
  '2-2-night',
  '2-2-mixed',
  '3-3-day',
  '3-3-mixed',
  'dnso',
  '5-2-short-friday',
  '5-2',
  '6-1',
  '1-3',
] as const;

test('десять человек: у каждого свой ответ, и они не смешиваются', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  const people = CROWD.map((presetId, index) =>
    // Точки отсчёта разные: иначе половина людей совпала бы друг с другом
    // ровно, и тест перестал бы что-либо различать.
    contextFor(presetId, `2026-09-0${(index % 9) + 1}` as IsoDate),
  );

  const answers = people.map((theirs) => sharedDaysOff([mine], [theirs], september));

  assert.equal(answers.length, 10);
  // Каждый ответ — подмножество моих выходных: чужой график может только
  // отнимать дни, но не добавлять.
  const myDaysOff = september.filter((date) => resolveDayKind(mine, date) === 'rest');
  for (const answer of answers) {
    assert.ok(answer.every((date) => myDaysOff.includes(date)));
  }
  // И ответы правда разные: иначе цвет на клетке ничего бы не различал.
  assert.ok(new Set(answers.map((answer) => answer.join(','))).size > 1);
});

test('десять человек: в один день может совпасть сразу несколько', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  // Все десять с одной точкой отсчёта: у 6/1 и 1/3 выходные попадают на мои.
  const people = CROWD.map((presetId) => contextFor(presetId, '2026-09-01'));

  const byDate = new Map<IsoDate, number>();
  for (const theirs of people) {
    for (const date of sharedDaysOff([mine], [theirs], september)) {
      byDate.set(date, (byDate.get(date) ?? 0) + 1);
    }
  }

  const crowded = [...byDate.values()].filter((count) => count > 1);
  assert.ok(crowded.length > 0, 'должен найтись день с несколькими совпадениями');
});

/** Тип дня без вытаскивания всего движка в тест. */
function resolveDayKind(context: ScheduleContext, date: IsoDate): string {
  return sharedDaysOff([context], [context], [date]).length > 0 ? 'rest' : 'work';
}

test('группа: день попадает в ответ, только если свободны все', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  // Один совпадает со мной полностью, второй сдвинут на половину цикла и не
  // совпадает никогда.
  const twin = contextFor('2-2-day', '2026-09-01');
  const opposite = contextFor('2-2-day', '2026-09-03');

  assert.ok(sharedDaysOff([mine], [twin], september).length > 0);
  assert.deepEqual(sharedDaysOff([mine], [twin, opposite], september), []);
});

test('пустая группа ни с чем не совпадает', () => {
  const mine = contextFor('2-2-day', '2026-09-01');

  assert.deepEqual(sharedDaysOff([mine], [], september), []);
});

test('2/2 против 2/2 со сдвигом на половину цикла не совпадает никогда', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  const shifted = contextFor('2-2-day', '2026-09-03');

  // Три месяца подряд: пусто — это правильный ответ, а не потерянный расчёт.
  for (const month of [9, 10, 11]) {
    assert.deepEqual(sharedDaysOff([mine], [shifted], monthDays(2026, month)), []);
  }
});
