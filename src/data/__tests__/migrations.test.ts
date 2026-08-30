import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAlarm, migrateSchedule } from '../migrations.ts';
import { DEFAULT_SHIFT_TYPES } from '../../domain/shifts.ts';
import type { Alarm } from '../../domain/alarm.ts';
import type { ActiveSchedule } from '../../domain/types.ts';

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

test('версия 5: выбранные вручную смены отбрасываются, время остаётся', () => {
  const legacy = {
    ...base,
    repeat: { kind: 'schedule', shiftTypeIds: ['day12', 'night12'] },
  } as unknown as Alarm;

  const migrated = migrateAlarm(legacy);

  assert.equal(migrated.time, '07:00');
  assert.deepEqual(migrated.repeat, { kind: 'schedule', times: {} });
});

test('будильники остальных режимов миграция не трогает', () => {
  assert.equal(migrateAlarm(base), base);

  const once: Alarm = { ...base, repeat: { kind: 'once', date: '2026-09-02' } };
  assert.equal(migrateAlarm(once), once);

  const already: Alarm = { ...base, repeat: { kind: 'schedule', times: { day12: '06:30' } } };
  assert.equal(migrateAlarm(already), already);
});

test('версия 7: график на исчезнувшую смену сбрасывается, а не роняет календарь', () => {
  const broken: ActiveSchedule = {
    presetId: '2-2-day',
    pattern: { kind: 'cycle', slots: ['day12', 'ghost', 'off', 'off'] },
    anchorDate: '2026-09-01',
  };

  assert.equal(migrateSchedule(broken, DEFAULT_SHIFT_TYPES), null);
});

test('целый график миграция отдаёт как есть', () => {
  const usable: ActiveSchedule = {
    presetId: '2-2-day',
    pattern: { kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] },
    anchorDate: '2026-09-01',
  };

  assert.equal(migrateSchedule(usable, DEFAULT_SHIFT_TYPES), usable);
  assert.equal(migrateSchedule(null, DEFAULT_SHIFT_TYPES), null);
});
