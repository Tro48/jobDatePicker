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

test('версия 4: времена по типам смен схлопываются в одно, самое раннее', () => {
  const legacy = {
    ...base,
    repeat: { kind: 'schedule', times: { night12: '18:30', day12: '06:30' } },
  } as unknown as Alarm;

  const migrated = migrateAlarm(legacy);

  assert.equal(migrated.time, '06:30');
  assert.deepEqual(migrated.repeat, { kind: 'schedule', shiftTypeIds: ['night12', 'day12'] });
});

test('версия 4: пустой набор смен не ломает время будильника', () => {
  const legacy = { ...base, repeat: { kind: 'schedule', times: {} } } as unknown as Alarm;

  const migrated = migrateAlarm(legacy);

  assert.equal(migrated.time, '07:00');
  assert.deepEqual(migrated.repeat, { kind: 'schedule', shiftTypeIds: [] });
});

test('будильники остальных режимов миграция не трогает', () => {
  assert.equal(migrateAlarm(base), base);

  const once: Alarm = { ...base, repeat: { kind: 'once', date: '2026-09-02' } };
  assert.equal(migrateAlarm(once), once);

  const already: Alarm = { ...base, repeat: { kind: 'schedule', shiftTypeIds: ['day12'] } };
  assert.equal(migrateAlarm(already), already);
});
