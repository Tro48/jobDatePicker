import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays } from '../date.ts';
import {
  countedDay,
  overtimeMinutes,
  resolveDay,
  resolvePlannedShiftId,
  scheduleShiftTypeIds,
  scheduleUsesKnownShifts,
  upcomingShiftTypeIds,
  shiftDurationMinutes,
  validatePreset,
} from '../engine.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import type { ActiveSchedule, SchedulePeriod } from '../types.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

function contextFor(presetId: string, anchorDate: string): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
  assert.ok(preset, `пресет ${presetId} не найден`);
  const schedule: SchedulePeriod = {
    presetId,
    pattern: preset.pattern,
    anchorDate,
    startsOn: anchorDate,
  };
  return { schedules: [schedule], shiftTypes, overrides: new Map() };
}

function badges(context: ScheduleContext, dates: string[]): string {
  return dates.map((date) => resolveDay(context, date).shiftType.badge).join('');
}

test('все пресеты ссылаются только на существующие смены', () => {
  const errors = SCHEDULE_PRESETS.flatMap((preset) => validatePreset(preset, shiftTypes));
  assert.deepEqual(errors, []);
});

test('validatePreset ловит ссылку на несуществующую смену', () => {
  const errors = validatePreset(
    {
      id: 'broken',
      name: '',
      description: '',
      pattern: { kind: 'cycle', slots: ['day12', 'ghost'] },
    },
    shiftTypes,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ghost/);
});

test('2/2 дневные: две смены, два выходных от даты первой смены', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const first = monthDays(2026, 9).slice(0, 10);
  assert.equal(badges(context, first), 'ДДВВДДВВДД');
});

test('внутри периода график разворачивается и назад от даты первой смены', () => {
  // Перевели с 28 августа, а первый выход по новому графику — 1 сентября:
  // дни между ними раскладываются предыдущим оборотом цикла.
  const preset = SCHEDULE_PRESETS.find((item) => item.id === '2-2-day')!;
  const context: ScheduleContext = {
    schedules: [
      {
        presetId: '2-2-day',
        pattern: preset.pattern,
        anchorDate: '2026-09-01',
        startsOn: '2026-08-28',
      },
    ],
    shiftTypes,
    overrides: new Map(),
  };

  assert.equal(badges(context, ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31']), 'ДДВВ');
  // Но не дальше начала периода: 27 августа человек по этому графику ещё не работал.
  assert.equal(resolveDay(context, '2026-08-27').source, 'none');
});

test('день/ночь/отсыпной/выходной — цикл из четырёх дней', () => {
  const context = contextFor('dnso', '2026-09-01');
  assert.equal(badges(context, monthDays(2026, 9).slice(0, 8)), 'ДНОВДНОВ');
});

test('3/3 день-ночь — цикл из двенадцати дней', () => {
  const context = contextFor('3-3-mixed', '2026-09-01');
  assert.equal(badges(context, monthDays(2026, 9).slice(0, 12)), 'ДДДВВВНННВВВ');
  assert.equal(badges(context, monthDays(2026, 9).slice(12, 15)), 'ДДД');
});

test('5/2 привязана к дням недели, а не к дате отсчёта', () => {
  const fromTuesday = contextFor('5-2-short-friday', '2026-09-01');
  const fromSaturday = contextFor('5-2-short-friday', '2026-09-05');
  const week = [
    '2026-09-07',
    '2026-09-08',
    '2026-09-09',
    '2026-09-10',
    '2026-09-11',
    '2026-09-12',
    '2026-09-13',
  ];
  assert.equal(badges(fromTuesday, week), 'РРРРСВВ');
  assert.equal(badges(fromSaturday, week), 'РРРРСВВ');
});

test('ручная правка перекрывает график и помечается как правка', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-03', {
    date: '2026-09-03',
    shiftTypeId: 'extra',
    workedMinutesOverride: 300,
  });
  const planned = resolveDay(context, '2026-09-04');
  const adjusted = resolveDay(context, '2026-09-03');

  assert.equal(planned.source, 'schedule');
  assert.equal(planned.shiftType.id, 'off');
  assert.equal(adjusted.source, 'override');
  assert.equal(adjusted.shiftType.id, 'extra');
  assert.equal(adjusted.workedMinutes, 300);
});

test('длительность смены: обычная, через полночь, суточная, с перерывом', () => {
  const byId = (id: string) => shiftTypes.get(id)!;
  assert.equal(shiftDurationMinutes(byId('day12')), 12 * 60);
  assert.equal(shiftDurationMinutes(byId('night12')), 12 * 60); // 20:00 → 08:00
  assert.equal(shiftDurationMinutes(byId('day24')), 24 * 60); // start === end
  assert.equal(shiftDurationMinutes(byId('work8')), 8 * 60); // 09:00–18:00 минус час обеда
  assert.equal(shiftDurationMinutes(byId('work7')), 7 * 60);
  assert.equal(shiftDurationMinutes(byId('off')), 0);
});

test('неизвестный тип смены падает с внятной ошибкой, а не молча', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-05', { date: '2026-09-05', shiftTypeId: 'ghost' });
  assert.throws(() => resolveDay(context, '2026-09-05'), /ghost/);
});

test('resolvePlannedShiftId игнорирует правки — это план, а не факт', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'off' });
  assert.equal(resolvePlannedShiftId(context.schedules[0], '2026-09-01'), 'day12');
});

test('правка без смены продолжает следовать графику при сдвиге даты отсчёта', () => {
  // Часы без смены: день остаётся за графиком, и раскладка его двигает.
  const hoursOnly = { date: '2026-09-01' as const, workedMinutesOverride: 420 };

  const early = contextFor('2-2-day', '2026-09-01');
  early.overrides.set('2026-09-01', hoursOnly);
  assert.equal(resolveDay(early, '2026-09-01').shiftType.id, 'day12');

  // Тот же день после сдвига первой смены на два дня назад — уже выходной.
  const shifted = contextFor('2-2-day', '2026-08-30');
  shifted.overrides.set('2026-09-01', hoursOnly);
  assert.equal(resolveDay(shifted, '2026-09-01').shiftType.id, 'off');
});

test('одни только часы — это изменение дня', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-01', { date: '2026-09-01', workedMinutesOverride: 420 });
  const day = resolveDay(context, '2026-09-01');

  assert.equal(day.source, 'override');
  assert.equal(day.shiftType.id, 'day12');
  assert.equal(day.workedMinutes, 420);
});

test('scheduleUsesKnownShifts ловит график на исчезнувшую смену', () => {
  const ok = contextFor('2-2-day', '2026-09-01');
  assert.equal(scheduleUsesKnownShifts(ok.schedules[0], shiftTypes), true);

  const broken: ActiveSchedule = {
    presetId: '2-2-day',
    pattern: { kind: 'cycle', slots: ['day12', 'ghost', 'off', 'off'] },
    anchorDate: '2026-09-01',
  };
  assert.equal(scheduleUsesKnownShifts(broken, shiftTypes), false);
});

test('норма дня берётся из графика и переживает правку смены', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'off' });

  const overridden = resolveDay(context, '2026-09-01');
  assert.equal(overridden.workedMinutes, 0);
  assert.equal(overridden.plannedMinutes, 12 * 60);

  // 3 сентября график даёт выходной — нормы у дня нет.
  assert.equal(resolveDay(context, '2026-09-03').plannedMinutes, 0);
});

test('отклонение считается от графика, а у отпуска и больничного его нет', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  context.overrides.set('2026-09-01', { date: '2026-09-01', workedMinutesOverride: 14 * 60 });
  context.overrides.set('2026-09-02', { date: '2026-09-02', workedMinutesOverride: 10 * 60 });
  context.overrides.set('2026-09-03', {
    date: '2026-09-03',
    shiftTypeId: 'extra',
    workedMinutesOverride: 4 * 60,
  });
  context.overrides.set('2026-09-05', { date: '2026-09-05', shiftTypeId: 'vacation' });

  assert.equal(overtimeMinutes(resolveDay(context, '2026-09-01')), 2 * 60);
  assert.equal(overtimeMinutes(resolveDay(context, '2026-09-02')), -2 * 60);
  // Подработка в выходной — плюс все часы, а не минус до штатной подработки.
  assert.equal(overtimeMinutes(resolveDay(context, '2026-09-03')), 4 * 60);
  // Отпуск поверх смены недоработкой не считается.
  assert.equal(overtimeMinutes(resolveDay(context, '2026-09-05')), 0);
  assert.equal(overtimeMinutes(resolveDay(context, '2026-09-06')), 0);
});

test('снятая смена даёт минус, а обмен днями в сумме сходится в ноль', () => {
  // График: 2 и 3 сентября — смены, 1-е выходной. Обмен с коллегой: вышел
  // 1-го, 3-е стало выходным. Часов за месяц столько же.
  const context = contextFor('2-2-day', '2026-09-02');
  context.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'day12' });
  context.overrides.set('2026-09-03', { date: '2026-09-03', shiftTypeId: 'off' });

  const extra = overtimeMinutes(resolveDay(context, '2026-09-01'));
  const dropped = overtimeMinutes(resolveDay(context, '2026-09-03'));

  assert.equal(extra, 12 * 60);
  assert.equal(dropped, -12 * 60);
  assert.equal(extra + dropped, 0);
});

test('перевод на другой график: прошлое остаётся на прежнем', () => {
  const weekly = SCHEDULE_PRESETS.find((item) => item.id === '5-2')!;
  const cycle = SCHEDULE_PRESETS.find((item) => item.id === '2-2-day')!;
  const context: ScheduleContext = {
    schedules: [
      {
        presetId: '5-2',
        pattern: weekly.pattern,
        anchorDate: '2026-01-05',
        startsOn: '2026-01-05',
      },
      {
        presetId: '2-2-day',
        pattern: cycle.pattern,
        anchorDate: '2026-10-01',
        startsOn: '2026-10-01',
      },
    ],
    shiftTypes,
    overrides: new Map(),
  };

  // 30 сентября — четверг: по пятидневке рабочий, по 2/2 от 1 октября — нет.
  assert.equal(resolveDay(context, '2026-09-30').shiftType.id, 'work8');
  // 3 октября — суббота: по пятидневке выходной, по 2/2 это третий день цикла.
  assert.equal(resolveDay(context, '2026-10-01').shiftType.id, 'day12');
  assert.equal(resolveDay(context, '2026-10-03').shiftType.id, 'off');
  // До первого графика дня нет вовсе.
  assert.equal(resolveDay(context, '2025-12-31').source, 'none');
  assert.equal(resolveDay(context, '2026-01-05').source, 'schedule');
});

test('день до первого графика не идёт в счёт, а размеченный руками — идёт', () => {
  const context = contextFor('2-2-day', '2026-09-15');
  const empty = resolveDay(context, '2026-09-01');

  assert.equal(countedDay(empty), false);
  assert.equal(empty.workedMinutes, 0);
  assert.equal(empty.plannedMinutes, 0);
  // Смены у такого дня нет вовсе: раскладку назад график не разворачивает.
  assert.equal(empty.shiftType.kind, 'rest');

  context.overrides.set('2026-09-14', { date: '2026-09-14', shiftTypeId: 'day12' });
  const worked = resolveDay(context, '2026-09-14');
  assert.equal(countedDay(worked), true);
  assert.equal(worked.source, 'override');
  assert.equal(worked.workedMinutes, 12 * 60);
});

test('scheduleShiftTypeIds отдаёт смены всей истории: по ним рисуется прошлое', () => {
  const weekly = SCHEDULE_PRESETS.find((item) => item.id === '5-2')!;
  const cycle = SCHEDULE_PRESETS.find((item) => item.id === '2-2-night')!;
  const ids = scheduleShiftTypeIds([
    { presetId: '5-2', pattern: weekly.pattern, anchorDate: '2026-01-05', startsOn: '2026-01-05' },
    {
      presetId: '2-2-night',
      pattern: cycle.pattern,
      anchorDate: '2026-10-01',
      startsOn: '2026-10-01',
    },
  ]);

  assert.ok(ids.includes('work8'));
  assert.ok(ids.includes('night12'));
});

const patternOf = (id: string) => SCHEDULE_PRESETS.find((item) => item.id === id)!.pattern;

test('вперёд смотрят только действующий график и назначенные позже', () => {
  // Человека перевели с пятидневки на 2/2. Смены оставленной работы будильнику
  // предлагать нечего: в календаре их больше не будет никогда, а человек
  // получал четыре поля времени подъёма вместо одного.
  const history: SchedulePeriod[] = [
    {
      presetId: '5-2-short-friday',
      pattern: patternOf('5-2-short-friday'),
      anchorDate: '2026-01-05',
      startsOn: '2026-01-05',
    },
    {
      presetId: '2-2-day',
      pattern: patternOf('2-2-day'),
      anchorDate: '2026-09-01',
      startsOn: '2026-09-01',
    },
  ];

  assert.deepEqual(upcomingShiftTypeIds(history, '2026-09-10'), ['day12', 'off']);
  // Сама история никуда не делась: прошлые месяцы без неё не разложить.
  assert.ok(scheduleShiftTypeIds(history).includes('work8'));
});

test('назначенный на будущее график попадает в смены заранее', () => {
  // Иначе в день перехода будильник замолчит: времени подъёма для новых смен
  // никто не спросил.
  const history: SchedulePeriod[] = [
    {
      presetId: '2-2-day',
      pattern: patternOf('2-2-day'),
      anchorDate: '2026-01-01',
      startsOn: '2026-01-01',
    },
    {
      presetId: '2-2-night',
      pattern: patternOf('2-2-night'),
      anchorDate: '2026-10-01',
      startsOn: '2026-10-01',
    },
  ];

  assert.deepEqual(upcomingShiftTypeIds(history, '2026-09-10'), ['day12', 'off', 'night12']);
});

test('до первого периода смен нет вовсе: человек здесь ещё не работал', () => {
  const history: SchedulePeriod[] = [
    {
      presetId: '2-2-day',
      pattern: patternOf('2-2-day'),
      anchorDate: '2026-09-01',
      startsOn: '2026-09-01',
    },
  ];

  assert.deepEqual(upcomingShiftTypeIds(history, '2026-08-01'), ['day12', 'off']);
  assert.deepEqual(upcomingShiftTypeIds([], '2026-09-10'), []);
});

/**
 * Своё начало смен графика.
 *
 * Справочник смен один на всё приложение, а выходят по нему по-разному.
 * Проверяется и то, что время в календаре меняется, и то, что за ним не
 * потянулись часы: поле показательное.
 */
test('график со своим началом смен показывает своё время, а часы оставляет прежними', () => {
  const plain = contextFor('2-2-day', '2026-09-01');
  const shifted: ScheduleContext = {
    ...plain,
    schedules: [{ ...plain.schedules[0], shiftStarts: { day12: '09:00' } }],
  };

  const before = resolveDay(plain, '2026-09-01');
  const after = resolveDay(shifted, '2026-09-01');

  assert.equal(before.shiftType.time?.start, '08:00');
  assert.deepEqual(after.shiftType.time, {
    start: '09:00',
    end: '21:00',
    unpaidBreakMinutes: before.shiftType.time?.unpaidBreakMinutes,
  });
  assert.equal(after.workedMinutes, before.workedMinutes);
  assert.equal(after.plannedMinutes, before.plannedMinutes);
  assert.equal(overtimeMinutes(after), 0);
});

test('своё начало действует только в своём периоде истории', () => {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === '2-2-day');
  assert.ok(preset);

  const context: ScheduleContext = {
    schedules: [
      {
        presetId: '2-2-day',
        pattern: preset.pattern,
        anchorDate: '2026-01-01',
        startsOn: '2026-01-01',
        shiftStarts: { day12: '09:00' },
      },
      {
        presetId: '2-2-day',
        pattern: preset.pattern,
        anchorDate: '2026-09-01',
        startsOn: '2026-09-01',
      },
    ],
    shiftTypes,
    overrides: new Map(),
  };

  assert.equal(resolveDay(context, '2026-01-01').shiftType.time?.start, '09:00');
  // Новая работа — новый период: он идёт по справочнику, пока не сказано иное.
  assert.equal(resolveDay(context, '2026-09-01').shiftType.time?.start, '08:00');
});

test('день до первого графика идёт по справочнику: своего начала у него нет', () => {
  const plain = contextFor('2-2-day', '2026-09-01');
  const shifted: ScheduleContext = {
    ...plain,
    schedules: [{ ...plain.schedules[0], shiftStarts: { day12: '09:00' } }],
  };

  const early = resolveDay(shifted, '2026-08-20');
  assert.equal(countedDay(early), false);
  assert.equal(early.shiftType.kind, 'rest');
});
