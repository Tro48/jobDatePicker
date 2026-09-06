import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_TRACK_NAME,
  migrateAlarm,
  migrateCustomSchedules,
  migratePayments,
  migrateSchedule,
  migrateShiftTypes,
  migrateTracks,
} from '../migrations.ts';
import { DEFAULT_SHIFT_TYPES } from '../../domain/shifts.ts';
import { DEFAULT_PAYMENT_RULES } from '../../domain/payday.ts';
import type { Alarm } from '../../domain/alarm.ts';
import type { ActiveSchedule, ScheduleTrack } from '../../domain/types.ts';

const usable: ActiveSchedule = {
  presetId: '2-2-day',
  pattern: { kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] },
  anchorDate: '2026-09-01',
};

const broken: ActiveSchedule = {
  presetId: '2-2-day',
  pattern: { kind: 'cycle', slots: ['day12', 'ghost', 'off', 'off'] },
  anchorDate: '2026-09-01',
};

const base: Alarm = {
  id: 'a1',
  label: 'На смену',
  time: '07:00',
  enabled: true,
  repeat: { kind: 'weekly', days: [1, 2, 3, 4, 5] },
  soundUri: null,
  vibrate: true,
  snoozeMinutes: 10,
};

/** Своя работа и чужой график: перенос обязан выбрать первую. */
const mainTrack: ScheduleTrack = {
  id: 'main',
  name: 'Основная',
  own: true,
  schedules: [{ ...usable, startsOn: usable.anchorDate }],
  overrides: {},
  payrollRules: DEFAULT_PAYMENT_RULES,
};

const anyaTrack: ScheduleTrack = { ...mainTrack, id: 'anya', name: 'Аня', own: false };

test('версия 5: выбранные вручную смены отбрасываются, время остаётся', () => {
  const legacy = {
    ...base,
    repeat: { kind: 'schedule', shiftTypeIds: ['day12', 'night12'] },
  } as unknown as Alarm;

  const migrated = migrateAlarm(legacy, [mainTrack]);

  assert.equal(migrated.time, '07:00');
  assert.deepEqual(migrated.repeat, { kind: 'schedule', tracks: [] });
});

test('версия 11: времена подъёма достаются своей работе, а не чужому графику', () => {
  const legacy = {
    ...base,
    repeat: { kind: 'schedule', times: { day12: '06:30' } },
  } as unknown as Alarm;

  // Чужой график идёт первым в списке — выбрать всё равно должно свою работу:
  // иначе человек начал бы вставать по чужим сменам.
  const migrated = migrateAlarm(legacy, [anyaTrack, mainTrack]);

  assert.deepEqual(migrated.repeat, {
    kind: 'schedule',
    tracks: [{ trackId: 'main', times: { day12: '06:30' } }],
  });
});

test('версия 11: без единой дорожки привязывать будильник не к чему', () => {
  const legacy = {
    ...base,
    repeat: { kind: 'schedule', times: { day12: '06:30' } },
  } as unknown as Alarm;

  assert.deepEqual(migrateAlarm(legacy, []).repeat, { kind: 'schedule', tracks: [] });
});

test('будильники остальных режимов миграция не трогает', () => {
  assert.equal(migrateAlarm(base, [mainTrack]), base);

  const once: Alarm = { ...base, repeat: { kind: 'once', date: '2026-09-02' } };
  assert.equal(migrateAlarm(once, [mainTrack]), once);

  const already: Alarm = {
    ...base,
    repeat: { kind: 'schedule', tracks: [{ trackId: 'main', times: { day12: '06:30' } }] },
  };
  assert.equal(migrateAlarm(already, [mainTrack]), already);
});

test('версия 7: график на исчезнувшую смену сбрасывается, а не роняет календарь', () => {
  assert.equal(migrateSchedule(broken, DEFAULT_SHIFT_TYPES), null);
});

test('целый график миграция отдаёт как есть', () => {
  assert.equal(migrateSchedule(usable, DEFAULT_SHIFT_TYPES), usable);
  assert.equal(migrateSchedule(null, DEFAULT_SHIFT_TYPES), null);
});

test('версия 8: плоский график и правки сворачиваются в одну дорожку', () => {
  const tracks = migrateTracks(
    { schedule: usable, overrides: { '2026-09-05': { date: '2026-09-05', note: 'за Сергея' } } },
    DEFAULT_SHIFT_TYPES,
  );

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].name, MAIN_TRACK_NAME);
  assert.equal(tracks[0].own, true);
  // График становится первым периодом истории и начинается с даты первой смены.
  assert.deepEqual(tracks[0].schedules, [{ ...usable, startsOn: usable.anchorDate }]);
  assert.equal(tracks[0].overrides['2026-09-05'].note, 'за Сергея');
});

test('версия 8 без графика и без правок: дорожек не заводится', () => {
  assert.deepEqual(migrateTracks({ schedule: null, overrides: {} }, DEFAULT_SHIFT_TYPES), []);
  assert.deepEqual(migrateTracks({}, DEFAULT_SHIFT_TYPES), []);
});

test('сломанный график обнуляется, но правки дорожки остаются', () => {
  const tracks = migrateTracks(
    {
      schedule: broken,
      overrides: { '2026-09-05': { date: '2026-09-05', shiftTypeId: 'vacation' } },
    },
    DEFAULT_SHIFT_TYPES,
  );

  // Дорожка выживает вместе с отпуском: терять его из-за переименованной
  // смены нельзя, а календарь покажет привычное «График не выбран».
  assert.equal(tracks.length, 1);
  assert.deepEqual(tracks[0].schedules, []);
  assert.equal(tracks[0].overrides['2026-09-05'].shiftTypeId, 'vacation');
});

test('сломанный график чистится в каждой дорожке отдельно', () => {
  const stored: ScheduleTrack[] = [
    {
      id: 'a',
      name: 'Основная',
      own: true,
      schedules: [{ ...usable, startsOn: usable.anchorDate }],
      overrides: {},
      payrollRules: DEFAULT_PAYMENT_RULES,
    },
    {
      id: 'b',
      name: 'Аня',
      own: false,
      schedules: [{ ...broken, startsOn: broken.anchorDate }],
      overrides: {},
      payrollRules: DEFAULT_PAYMENT_RULES,
    },
  ];

  const tracks = migrateTracks({ tracks: stored }, DEFAULT_SHIFT_TYPES);

  // Битая дорожка не роняет соседнюю и не исчезает сама.
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0].schedules, [{ ...usable, startsOn: usable.anchorDate }]);
  assert.deepEqual(tracks[1].schedules, []);
  assert.equal(tracks[1].own, false);
});

test('версия 9: общие числа выплат достаются каждой дорожке', () => {
  const rules = [{ ...DEFAULT_PAYMENT_RULES[0], dayOfMonth: 7 }];
  const tracks = migrateTracks({ schedule: usable, payroll: { rules } }, DEFAULT_SHIFT_TYPES);

  assert.deepEqual(tracks[0].payrollRules, rules);
});

test('выплаты достаются первой дорожке, а не пропадают', () => {
  const tracks: ScheduleTrack[] = [
    {
      id: 'a',
      name: 'Основная',
      own: true,
      schedules: [{ ...usable, startsOn: usable.anchorDate }],
      overrides: {},
      payrollRules: DEFAULT_PAYMENT_RULES,
    },
  ];

  const payments = migratePayments(
    [
      // Из версии 9: работы у выплаты ещё не было.
      { id: 'p1', kind: 'salary', period: '2026-08', receivedOn: '2026-09-05', amount: 1000 },
      // Дорожку удалили, а деньги остались — терять их нельзя.
      {
        id: 'p2',
        trackId: 'ghost',
        kind: 'advance',
        period: '2026-09',
        receivedOn: '2026-09-20',
        amount: 500,
      },
    ] as never,
    tracks,
  );

  assert.deepEqual(
    payments.map((payment) => payment.trackId),
    ['a', 'a'],
  );
  assert.deepEqual(migratePayments(undefined, tracks), []);
  assert.deepEqual(migratePayments([], []), []);
});

/**
 * Справочник смен: до версии 13 его в хранилище не было вовсе, поэтому
 * миграция обязана вытянуть весь встроенный набор из пустоты.
 */
test('снимок без справочника даёт ровно встроенный набор', () => {
  assert.deepEqual(migrateShiftTypes(undefined), DEFAULT_SHIFT_TYPES);
  assert.deepEqual(migrateShiftTypes([]), DEFAULT_SHIFT_TYPES);
});

test('правки встроенной смены переживают миграцию, поля из кода — тоже', () => {
  const saved = DEFAULT_SHIFT_TYPES.map((type) =>
    type.id === 'vacation'
      ? // Так выглядит снимок из старой сборки: признака многодневности в нём
        // не было, и когда-то ровно из-за этого справочник и не хранили.
        { ...type, name: 'Отпуск на складе', multiDay: undefined }
      : type,
  );

  const migrated = migrateShiftTypes(saved);
  const vacation = migrated.find((type) => type.id === 'vacation');

  assert.equal(vacation?.name, 'Отпуск на складе');
  assert.equal(vacation?.multiDay, true);
});

test('вид встроенной смены из снимка не берётся: он задан кодом', () => {
  const saved = DEFAULT_SHIFT_TYPES.map((type) =>
    type.id === 'off'
      ? { ...type, kind: 'work', time: { start: '09:00', end: '18:00', unpaidBreakMinutes: 0 } }
      : type,
  );

  // «Выходной», ставший рабочей сменой, ломает все встроенные графики разом.
  assert.equal(migrateShiftTypes(saved).find((type) => type.id === 'off')?.kind, 'rest');
});

test('своя смена переживает миграцию как есть', () => {
  const migrated = migrateShiftTypes([
    ...DEFAULT_SHIFT_TYPES,
    {
      id: 'evening',
      builtinId: null,
      name: 'Вечерняя',
      badge: 'Веч',
      kind: 'work',
      colorToken: 'shift.extra',
      time: { start: '16:00', end: '00:00', unpaidBreakMinutes: 0 },
      rateMultiplier: 1,
    },
  ]);

  assert.equal(migrated.length, DEFAULT_SHIFT_TYPES.length + 1);
  assert.equal(migrated.at(-1)?.name, 'Вечерняя');
});

test('встроенная смена возвращается в справочник, даже если её из снимка выкинули', () => {
  const migrated = migrateShiftTypes(DEFAULT_SHIFT_TYPES.filter((type) => type.id !== 'off'));

  // На «Выходной» ссылаются все встроенные графики: без него они перестают
  // раскладываться и молча исчезают при следующем запуске.
  assert.ok(migrated.some((type) => type.id === 'off'));
  assert.equal(migrated.length, DEFAULT_SHIFT_TYPES.length);
});

test('битая запись в снимке не уносит с собой весь справочник', () => {
  const migrated = migrateShiftTypes([
    null,
    { id: 'broken', builtinId: null, name: 'Кривая', kind: 'work', colorToken: 'shift.day' },
    ...DEFAULT_SHIFT_TYPES,
  ]);

  assert.equal(migrated.length, DEFAULT_SHIFT_TYPES.length);
});

test('порядок смен в справочнике — пользовательский', () => {
  const reordered = [...DEFAULT_SHIFT_TYPES].reverse();
  const migrated = migrateShiftTypes(reordered);

  assert.deepEqual(
    migrated.map((type) => type.id),
    reordered.map((type) => type.id),
  );
});

test('снимок без собранных графиков даёт пустой список, а не падение', () => {
  assert.deepEqual(migrateCustomSchedules(undefined, DEFAULT_SHIFT_TYPES), []);
  assert.deepEqual(migrateCustomSchedules('мусор', DEFAULT_SHIFT_TYPES), []);
});

test('собранный график переживает миграцию, а собранный на исчезнувшей смене — нет', () => {
  const migrated = migrateCustomSchedules(
    [
      { id: 'c1', name: 'Мой', pattern: { kind: 'cycle', slots: ['day12', 'off'] } },
      { id: 'c2', name: 'Битый', pattern: { kind: 'cycle', slots: ['ghost', 'off'] } },
    ],
    DEFAULT_SHIFT_TYPES,
  );

  assert.deepEqual(
    migrated.map((schedule) => schedule.id),
    ['c1'],
  );
});

test('версия 15: битый период выбрасывается поштучно, живая история остаётся', () => {
  const tracks = migrateTracks(
    {
      tracks: [
        {
          id: 'a',
          name: 'Основная',
          own: true,
          // Порядок в снимке перепутан намеренно: восстановить его — работа миграции.
          schedules: [
            { ...usable, startsOn: '2026-10-01' },
            { ...broken, startsOn: '2026-05-01' },
            { ...usable, startsOn: '2026-01-05' },
          ],
          overrides: {},
          payrollRules: DEFAULT_PAYMENT_RULES,
        },
      ],
    },
    DEFAULT_SHIFT_TYPES,
  );

  // Прошлогодний график на исчезнувшей смене не тянет за собой текущий.
  assert.deepEqual(
    tracks[0].schedules.map((period) => period.startsOn),
    ['2026-01-05', '2026-10-01'],
  );
});
