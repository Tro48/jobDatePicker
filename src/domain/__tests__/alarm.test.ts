import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSnoozeMinutes,
  describeRepeat,
  describeTime,
  expiredOnceAlarmIds,
  hasAnyTrigger,
  newAlarmDraft,
  nextDateForTime,
  nextOccurrences,
  planAlarms,
} from '../alarm.ts';
import type { Alarm } from '../alarm.ts';
import type { ScheduleContext } from '../engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import { localDateTimeToMillis } from '../date.ts';

const shiftTypes = indexShiftTypes(DEFAULT_SHIFT_TYPES);

function contextFor(presetId: string, anchorDate: string): ScheduleContext {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return {
    schedule: { presetId, pattern: preset.pattern, anchorDate },
    shiftTypes,
    overrides: new Map(),
  };
}

/** Полдень местного времени: тесты не должны зависеть от часового пояса машины. */
function localNoon(date: string): Date {
  return new Date(localDateTimeToMillis(date, '12:00'));
}

const base: Alarm = {
  id: 'a1',
  label: 'На смену',
  time: '07:00',
  enabled: true,
  repeat: { kind: 'once', date: '2026-09-02' },
  soundUri: null,
  vibrate: true,
  snoozeMinutes: 10,
};

test('разовый будильник даёт ровно одно срабатывание', () => {
  const found = nextOccurrences(base, null, localNoon('2026-09-01'));

  assert.equal(found.length, 1);
  assert.equal(found[0].triggerAtMillis, localDateTimeToMillis('2026-09-02', '07:00'));
  assert.equal(found[0].id, 'a1:2026-09-02');
  assert.equal(found[0].title, 'На смену');
});

test('прошедшее время не ставится: AlarmManager отработал бы его мгновенно', () => {
  const past: Alarm = { ...base, repeat: { kind: 'once', date: '2026-09-01' } };

  assert.deepEqual(nextOccurrences(past, null, localNoon('2026-09-01')), []);
});

test('выключенный будильник не звонит', () => {
  assert.deepEqual(nextOccurrences({ ...base, enabled: false }, null, localNoon('2026-09-01')), []);
});

test('по дням недели попадает только в выбранные дни', () => {
  // 1 сентября 2026 — вторник, значит ближайшие среда, пятница, понедельник.
  const weekly: Alarm = { ...base, repeat: { kind: 'weekly', days: [1, 3, 5] } };
  const found = nextOccurrences(weekly, null, localNoon('2026-09-01'), 3);

  assert.deepEqual(
    found.map((item) => item.date),
    ['2026-09-02', '2026-09-04', '2026-09-07'],
  );
  assert.equal(found[0].time, '07:00');
});

test('без выбранных дней недели будильник не звонит никогда', () => {
  const weekly: Alarm = { ...base, repeat: { kind: 'weekly', days: [] } };

  assert.deepEqual(nextOccurrences(weekly, null, localNoon('2026-09-01')), []);
  assert.equal(hasAnyTrigger(weekly), false);
});

test('сегодняшний день недели берётся, если время ещё впереди', () => {
  const weekly: Alarm = { ...base, time: '23:00', repeat: { kind: 'weekly', days: [2] } };
  const found = nextOccurrences(weekly, null, localNoon('2026-09-01'), 1);

  assert.equal(found[0].date, '2026-09-01');
});

test('по графику: у дневной и ночной смены своё время подъёма', () => {
  // 2/2 день-ночь от 1 сентября: 1–2 дневные, 5–6 ночные, дальше цикл.
  const context = contextFor('2-2-mixed', '2026-09-01');
  const alarm: Alarm = {
    ...base,
    repeat: { kind: 'schedule', times: { day12: '06:30', night12: '18:30' } },
  };

  const found = nextOccurrences(alarm, context, localNoon('2026-09-01'), 4);

  assert.deepEqual(
    found.map((item) => `${item.date} ${item.time}`),
    ['2026-09-02 06:30', '2026-09-05 18:30', '2026-09-06 18:30', '2026-09-09 06:30'],
  );
  assert.equal(found[0].subtitle, 'Дневная смена, начало в 08:00');
});

test('по графику: смена без отметки будильника пропускается', () => {
  const context = contextFor('2-2-mixed', '2026-09-01');
  const alarm: Alarm = { ...base, repeat: { kind: 'schedule', times: { night12: '18:30' } } };

  const found = nextOccurrences(alarm, context, localNoon('2026-09-01'), 2);

  assert.deepEqual(
    found.map((item) => item.date),
    ['2026-09-05', '2026-09-06'],
  );
});

test('по графику без выбранного графика звонить нечему', () => {
  const alarm: Alarm = { ...base, repeat: { kind: 'schedule', times: { day12: '06:30' } } };

  assert.deepEqual(nextOccurrences(alarm, null, localNoon('2026-09-01')), []);
});

test('ручная правка дня меняет расписание будильника', () => {
  const context = contextFor('2-2-mixed', '2026-09-01');
  // 3 сентября по графику выходной; ставим подработку — будильник появляется.
  context.overrides.set('2026-09-03', { date: '2026-09-03', shiftTypeId: 'night12' });
  const alarm: Alarm = { ...base, repeat: { kind: 'schedule', times: { night12: '18:30' } } };

  const found = nextOccurrences(alarm, context, localNoon('2026-09-01'), 1);

  assert.equal(found[0].date, '2026-09-03');
});

test('все будильники сливаются в один список по времени и режутся по потолку', () => {
  const morning: Alarm = { ...base, id: 'morning', repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] } };
  const evening: Alarm = { ...base, id: 'evening', time: '20:00', repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] } };

  const found = planAlarms([morning, evening], null, localNoon('2026-09-01'), 3);

  assert.deepEqual(
    found.map((item) => `${item.alarmId} ${item.date} ${item.time}`),
    ['evening 2026-09-01 20:00', 'morning 2026-09-02 07:00', 'evening 2026-09-02 20:00'],
  );
});

test('отзвонивший разовый будильник помечается на выключение', () => {
  const fired: Alarm = { ...base, id: 'fired', repeat: { kind: 'once', date: '2026-09-01' } };
  const future: Alarm = { ...base, id: 'future', repeat: { kind: 'once', date: '2026-09-03' } };
  const off: Alarm = { ...base, id: 'off', enabled: false, repeat: { kind: 'once', date: '2026-09-01' } };

  assert.deepEqual(expiredOnceAlarmIds([fired, future, off], localNoon('2026-09-01')), ['fired']);
});

test('новый будильник встаёт на ближайшие семь утра', () => {
  assert.equal(nextDateForTime('07:00', localNoon('2026-09-01')), '2026-09-02');
  assert.equal(nextDateForTime('23:00', localNoon('2026-09-01')), '2026-09-01');

  const draft = newAlarmDraft(localNoon('2026-09-01'));
  assert.equal(draft.time, '07:00');
  assert.deepEqual(draft.repeat, { kind: 'once', date: '2026-09-02' });
});

test('повтор описывается человеческим текстом', () => {
  const describe = (alarm: Alarm): string => describeRepeat(alarm, shiftTypes);

  assert.equal(describe(base), 'Один раз, 2 сентября');
  assert.equal(describe({ ...base, repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] } }), 'Каждый день');
  assert.equal(describe({ ...base, repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5] } }), 'По будням');
  assert.equal(describe({ ...base, repeat: { kind: 'weekly', days: [6, 7] } }), 'По выходным');
  assert.equal(describe({ ...base, repeat: { kind: 'weekly', days: [5, 1] } }), 'Пн, Пт');
  assert.equal(
    describe({ ...base, repeat: { kind: 'schedule', times: { day12: '06:30', night12: '18:30' } } }),
    'По графику: дневная смена, ночная смена',
  );
});

test('в списке у графика показываются все его времена', () => {
  assert.equal(describeTime(base), '07:00');
  assert.equal(
    describeTime({ ...base, repeat: { kind: 'schedule', times: { night12: '18:30', day12: '06:30' } } }),
    '06:30 · 18:30',
  );
});

test('отсрочка держится в разумных пределах', () => {
  assert.equal(clampSnoozeMinutes(0), 1);
  assert.equal(clampSnoozeMinutes(90), 60);
  assert.equal(clampSnoozeMinutes(Number.NaN), 10);
});
