import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateAlarm } from '../migrations.ts';
import type { Alarm } from '../../domain/alarm.ts';

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
