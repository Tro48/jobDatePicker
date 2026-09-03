import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSnoozeMinutes,
  describeRepeat,
  describeTime,
  expiredOnceAlarmIds,
  hasAnyTrigger,
  hasSnooze,
  isPastOnce,
  newAlarmDraft,
  nextDateForTime,
  nextOccurrences,
  parseSnoozeMinutes,
  planAlarms,
  restartOnce,
} from '../alarm.ts';
import type { Alarm, AlarmTrackContext } from '../alarm.ts';
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

/** Один график под именем «Основная»: имя в подпись не попадает. */
function alone(context: ScheduleContext): Map<string, AlarmTrackContext> {
  return new Map([['main', { context, name: 'Основная', named: false }]]);
}

/** Ни одного графика: будить не по чему. */
const noTracks = new Map<string, AlarmTrackContext>();

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
  const found = nextOccurrences(base, noTracks, localNoon('2026-09-01'));

  assert.equal(found.length, 1);
  assert.equal(found[0].triggerAtMillis, localDateTimeToMillis('2026-09-02', '07:00'));
  assert.equal(found[0].id, 'a1:2026-09-02:07:00');
  assert.equal(found[0].title, 'На смену');
});

test('прошедшее время не ставится: AlarmManager отработал бы его мгновенно', () => {
  const past: Alarm = { ...base, repeat: { kind: 'once', date: '2026-09-01' } };

  assert.deepEqual(nextOccurrences(past, noTracks, localNoon('2026-09-01')), []);
});

test('выключенный будильник не звонит', () => {
  assert.deepEqual(
    nextOccurrences({ ...base, enabled: false }, noTracks, localNoon('2026-09-01')),
    [],
  );
});

test('по дням недели попадает только в выбранные дни', () => {
  // 1 сентября 2026 — вторник, значит ближайшие среда, пятница, понедельник.
  const weekly: Alarm = { ...base, repeat: { kind: 'weekly', days: [1, 3, 5] } };
  const found = nextOccurrences(weekly, noTracks, localNoon('2026-09-01'), 3);

  assert.deepEqual(
    found.map((item) => item.date),
    ['2026-09-02', '2026-09-04', '2026-09-07'],
  );
  assert.equal(found[0].time, '07:00');
});

test('без выбранных дней недели будильник не звонит никогда', () => {
  const weekly: Alarm = { ...base, repeat: { kind: 'weekly', days: [] } };

  assert.deepEqual(nextOccurrences(weekly, noTracks, localNoon('2026-09-01')), []);
  assert.equal(hasAnyTrigger(weekly), false);
});

test('сегодняшний день недели берётся, если время ещё впереди', () => {
  const weekly: Alarm = { ...base, time: '23:00', repeat: { kind: 'weekly', days: [2] } };
  const found = nextOccurrences(weekly, noTracks, localNoon('2026-09-01'), 1);

  assert.equal(found[0].date, '2026-09-01');
});

test('по графику: у дневной и ночной смены своё время подъёма', () => {
  // 2/2 день-ночь от 1 сентября: 1–2 дневные, 3–4 выходные, 5–6 ночные.
  const context = contextFor('2-2-mixed', '2026-09-01');
  const alarm: Alarm = {
    ...base,
    repeat: {
      kind: 'schedule',
      tracks: [{ trackId: 'main', times: { day12: '06:30', night12: '18:30' } }],
    },
  };

  const found = nextOccurrences(alarm, alone(context), localNoon('2026-09-01'), 4);

  // Выходные пропущены: будить в них незачем.
  assert.deepEqual(
    found.map((item) => `${item.date} ${item.time}`),
    ['2026-09-02 06:30', '2026-09-05 18:30', '2026-09-06 18:30', '2026-09-09 06:30'],
  );
  assert.equal(found[0].subtitle, 'Дневная смена, начало в 08:00');
});

test('по графику: смена без своего времени звонит общим', () => {
  const context = contextFor('2-2-mixed', '2026-09-01');
  const alarm: Alarm = {
    ...base,
    repeat: { kind: 'schedule', tracks: [{ trackId: 'main', times: { night12: '18:30' } }] },
  };

  const found = nextOccurrences(alarm, alone(context), localNoon('2026-09-01'), 2);

  assert.deepEqual(
    found.map((item) => `${item.date} ${item.time}`),
    ['2026-09-02 07:00', '2026-09-05 18:30'],
  );
});

test('по графику без выбранного графика звонить нечему', () => {
  const alarm: Alarm = {
    ...base,
    repeat: { kind: 'schedule', tracks: [{ trackId: 'main', times: {} }] },
  };

  assert.deepEqual(nextOccurrences(alarm, noTracks, localNoon('2026-09-01')), []);
});

test('ручная правка дня меняет расписание будильника', () => {
  const context = contextFor('2-2-mixed', '2026-09-01');
  // 3 сентября по графику выходной; ставим подработку — будильник появляется.
  context.overrides.set('2026-09-03', { date: '2026-09-03', shiftTypeId: 'night12' });
  const alarm: Alarm = {
    ...base,
    repeat: { kind: 'schedule', tracks: [{ trackId: 'main', times: {} }] },
  };

  const found = nextOccurrences(alarm, alone(context), localNoon('2026-09-01'), 2);

  assert.deepEqual(
    found.map((item) => item.date),
    ['2026-09-02', '2026-09-03'],
  );
});

test('все будильники сливаются в один список по времени и режутся по потолку', () => {
  const morning: Alarm = {
    ...base,
    id: 'morning',
    repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] },
  };
  const evening: Alarm = {
    ...base,
    id: 'evening',
    time: '20:00',
    repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] },
  };

  const found = planAlarms([morning, evening], noTracks, localNoon('2026-09-01'), 3);

  assert.deepEqual(
    found.map((item) => `${item.alarmId} ${item.date} ${item.time}`),
    ['evening 2026-09-01 20:00', 'morning 2026-09-02 07:00', 'evening 2026-09-02 20:00'],
  );
});

test('отзвонивший разовый будильник помечается на выключение', () => {
  const fired: Alarm = { ...base, id: 'fired', repeat: { kind: 'once', date: '2026-09-01' } };
  const future: Alarm = { ...base, id: 'future', repeat: { kind: 'once', date: '2026-09-03' } };
  const off: Alarm = {
    ...base,
    id: 'off',
    enabled: false,
    repeat: { kind: 'once', date: '2026-09-01' },
  };

  assert.deepEqual(expiredOnceAlarmIds([fired, future, off], localNoon('2026-09-01')), ['fired']);
});

test('прошедший момент разового будильника виден форме сразу', () => {
  const now = localNoon('2026-09-01');

  assert.equal(isPastOnce({ ...base, repeat: { kind: 'once', date: '2026-08-31' } }, now), true);
  // Сегодня, но время уже прошло: 07:00 против полудня.
  assert.equal(isPastOnce({ ...base, repeat: { kind: 'once', date: '2026-09-01' } }, now), true);
  assert.equal(isPastOnce({ ...base, repeat: { kind: 'once', date: '2026-09-02' } }, now), false);
  // У повторяющегося прошедшего момента не бывает.
  assert.equal(isPastOnce({ ...base, repeat: { kind: 'weekly', days: [1] } }, now), false);
});

test('отзвонивший разовый будильник запускается заново на ближайший день', () => {
  const now = localNoon('2026-09-01');
  const fired: Alarm = { ...base, repeat: { kind: 'once', date: '2026-08-30' } };

  // 07:00 сегодня уже прошло — значит, завтра.
  assert.deepEqual(restartOnce(fired, now).repeat, { kind: 'once', date: '2026-09-02' });
  // Вечернее время сегодняшнего дня ещё впереди.
  assert.deepEqual(restartOnce({ ...fired, time: '23:00' }, now).repeat, {
    kind: 'once',
    date: '2026-09-01',
  });

  // Будущий разовый и повторяющиеся не трогаются.
  const future: Alarm = { ...base, repeat: { kind: 'once', date: '2026-09-05' } };
  assert.equal(restartOnce(future, now), future);
  const weekly: Alarm = { ...base, repeat: { kind: 'weekly', days: [1] } };
  assert.equal(restartOnce(weekly, now), weekly);
});

test('новый будильник встаёт на ближайшие семь утра', () => {
  assert.equal(nextDateForTime('07:00', localNoon('2026-09-01')), '2026-09-02');
  assert.equal(nextDateForTime('23:00', localNoon('2026-09-01')), '2026-09-01');

  const draft = newAlarmDraft(localNoon('2026-09-01'));
  assert.equal(draft.time, '07:00');
  assert.deepEqual(draft.repeat, { kind: 'once', date: '2026-09-02' });
});

test('повтор описывается человеческим текстом', () => {
  const trackNames = new Map([['main', 'Основная']]);
  const describe = (alarm: Alarm): string => describeRepeat(alarm, trackNames);

  assert.equal(describe(base), 'Один раз, 2 сентября');
  assert.equal(
    describe({ ...base, repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5, 6, 7] } }),
    'Каждый день',
  );
  assert.equal(
    describe({ ...base, repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5] } }),
    'По будням',
  );
  assert.equal(describe({ ...base, repeat: { kind: 'weekly', days: [6, 7] } }), 'По выходным');
  assert.equal(describe({ ...base, repeat: { kind: 'weekly', days: [5, 1] } }), 'Пн, Пт');
  assert.equal(
    describe({
      ...base,
      repeat: {
        kind: 'schedule',
        tracks: [{ trackId: 'main', times: { day12: '06:30', night12: '18:30' } }],
      },
    }),
    'Рабочие дни по графику',
  );
  assert.equal(
    describe({ ...base, repeat: { kind: 'schedule', tracks: [{ trackId: 'main', times: {} }] } }),
    'Рабочие дни по графику',
  );
});

test('в списке у графика показываются все его времена', () => {
  assert.equal(describeTime(base), '07:00');
  assert.equal(
    describeTime({
      ...base,
      repeat: {
        kind: 'schedule',
        tracks: [{ trackId: 'main', times: { night12: '18:30', day12: '06:30' } }],
      },
    }),
    '06:30 · 18:30',
  );
  // Без своих времён список показывает общее время будильника.
  assert.equal(
    describeTime({
      ...base,
      repeat: { kind: 'schedule', tracks: [{ trackId: 'main', times: {} }] },
    }),
    '07:00',
  );
});

test('отсрочка держится в разумных пределах', () => {
  assert.equal(clampSnoozeMinutes(0), 0);
  assert.equal(clampSnoozeMinutes(-5), 0);
  assert.equal(clampSnoozeMinutes(90), 60);
  assert.equal(clampSnoozeMinutes(Number.NaN), 0);
});

test('поле отсрочки разбирается только при сохранении', () => {
  // Пустое поле — это «без отсрочки», а не «подставить десять минут».
  assert.equal(parseSnoozeMinutes(''), 0);
  assert.equal(parseSnoozeMinutes('0'), 0);
  assert.equal(parseSnoozeMinutes('5'), 5);
  assert.equal(parseSnoozeMinutes('999'), 60);
  assert.equal(parseSnoozeMinutes('abc'), 0);
});

test('кнопка «Отложить» появляется только при ненулевой отсрочке', () => {
  assert.equal(hasSnooze({ snoozeMinutes: 0 }), false);
  assert.equal(hasSnooze({ snoozeMinutes: 10 }), true);
});

test('новый будильник заводится без отсрочки', () => {
  assert.equal(newAlarmDraft(new Date(2026, 7, 29, 12, 0)).snoozeMinutes, 0);
});

test('два графика в один день: разное время — два звонка, одно время — один', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  const store = contextFor('2-2-day', '2026-09-01');
  const tracks = new Map<string, AlarmTrackContext>([
    ['mine', { context: mine, name: 'Основная', named: true }],
    ['store', { context: store, name: 'Склад', named: true }],
  ]);

  const different: Alarm = {
    ...base,
    repeat: {
      kind: 'schedule',
      tracks: [
        { trackId: 'mine', times: { day12: '06:30' } },
        { trackId: 'store', times: { day12: '18:30' } },
      ],
    },
  };

  const found = nextOccurrences(different, tracks, localNoon('2026-09-01'), 1);

  // Разное время подъёма — это два разных звонка, и ключи у них разные.
  // Порядок здесь по графикам, а не по времени: сортирует уже planAlarms.
  assert.deepEqual(found.map((item) => `${item.date} ${item.time}`).sort(), [
    '2026-09-01 18:30',
    '2026-09-02 06:30',
  ]);
  assert.equal(new Set(found.map((item) => item.id)).size, 2);
});

test('совпавшее время двух графиков даёт один звонок, который называет оба', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  const store = contextFor('2-2-day', '2026-09-01');
  const tracks = new Map<string, AlarmTrackContext>([
    ['mine', { context: mine, name: 'Основная', named: true }],
    ['store', { context: store, name: 'Склад', named: true }],
  ]);

  const same: Alarm = {
    ...base,
    repeat: {
      kind: 'schedule',
      tracks: [
        { trackId: 'mine', times: { day12: '06:30' } },
        { trackId: 'store', times: { day12: '06:30' } },
      ],
    },
  };

  const found = nextOccurrences(same, tracks, localNoon('2026-09-01'), 1);

  // Будить дважды в одну минуту незачем — звонок один.
  assert.equal(found.length, 1);
  assert.match(found[0].subtitle, /Основная/);
  assert.match(found[0].subtitle, /Склад/);
});

test('запас считается на каждый график, а не делится между ними', () => {
  const mine = contextFor('2-2-day', '2026-09-01');
  const store = contextFor('2-2-day', '2026-09-01');
  const tracks = new Map<string, AlarmTrackContext>([
    ['mine', { context: mine, name: 'Основная', named: true }],
    ['store', { context: store, name: 'Склад', named: true }],
  ]);

  const alarm: Alarm = {
    ...base,
    repeat: {
      kind: 'schedule',
      tracks: [
        { trackId: 'mine', times: { day12: '06:30' } },
        { trackId: 'store', times: { day12: '18:30' } },
      ],
    },
  };

  // По два на график: вторая работа не должна вдвое укорачивать горизонт.
  const found = nextOccurrences(alarm, tracks, localNoon('2026-09-01'), 2);

  assert.equal(found.filter((item) => item.time === '06:30').length, 2);
  assert.equal(found.filter((item) => item.time === '18:30').length, 2);
});

test('будильник без единого отмеченного графика не звонит', () => {
  const alarm: Alarm = { ...base, repeat: { kind: 'schedule', tracks: [] } };

  assert.equal(hasAnyTrigger(alarm), false);
  assert.deepEqual(nextOccurrences(alarm, noTracks, localNoon('2026-09-01')), []);
});

test('карточка называет графики, только когда их больше одного', () => {
  const alarm: Alarm = {
    ...base,
    repeat: {
      kind: 'schedule',
      tracks: [
        { trackId: 'mine', times: {} },
        { trackId: 'store', times: {} },
      ],
    },
  };

  const many = new Map([
    ['mine', 'Основная'],
    ['store', 'Склад'],
  ]);

  assert.equal(describeRepeat(alarm, many), 'Основная, Склад · рабочие дни');
  assert.equal(
    describeRepeat({ ...base, repeat: { kind: 'schedule', tracks: [] } }, many),
    'Ни один график не выбран',
  );
});
