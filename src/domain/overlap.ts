import { resolveDay } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import { isSleepShift } from './shifts.ts';
import type { IsoDate } from './date.ts';

/**
 * Дни, когда свободны и я, и все перечисленные.
 *
 * «Свободен» — это полноценный нерабочий день: выходной, отпуск, больничный.
 * Отсыпной сюда не входит: формально он нерабочий, но день после ночной уходит
 * на сон, и записывать его в общий выходной — врать человеку, который по этому
 * списку договаривается о встрече.
 *
 * theirs — список: один человек и целая группа считаются одинаково, и день
 * попадает в ответ, только если свободны все до единого. Пустой список — это
 * группа без участников, сравнивать не с кем.
 *
 * Мои графики берутся все разом: с двумя работами я свободен только в день,
 * когда не занят ни одной из них. Без единого своего графика сравнивать тоже
 * не с чем — не «совпало всё», а «не с чем совпадать».
 */
export function sharedDaysOff(
  mine: ScheduleContext[],
  theirs: ScheduleContext[],
  dates: IsoDate[],
): IsoDate[] {
  if (mine.length === 0 || theirs.length === 0) return [];

  const everyone = [...mine, ...theirs];
  const free = (context: ScheduleContext, date: IsoDate): boolean => {
    const { shiftType } = resolveDay(context, date);
    return shiftType.kind === 'rest' && !isSleepShift(shiftType);
  };

  return dates.filter((date) => everyone.every((context) => free(context, date)));
}
