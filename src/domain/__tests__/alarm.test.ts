import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALARM_SETTINGS, MAX_SCHEDULED_ALARMS, planAlarms, settingFor } from '../alarm.ts';
import type { AlarmSettings } from '../alarm.ts';
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

const settings: AlarmSettings = {
  ...DEFAULT_ALARM_SETTINGS,
  byShiftType: { day12: { enabled: true, leadMinutes: 60 } },
};

/** Полночь местного времени: тесты не должны зависеть от часового пояса машины. */
function localNoon(date: string): Date {
  return new Date(localDateTimeToMillis(date, '12:00'));
}

test('будильник встаёт за указанное время до начала смены', () => {
  // 2/2 дневные от 1 сентября: 1 и 2 рабочие, 3 и 4 выходные.
  const alarms = planAlarms(contextFor('2-2-day', '2026-09-01'), settings, localNoon('2026-09-01'));

  assert.equal(alarms[0].date, '2026-09-02');
  assert.equal(alarms[0].triggerAtMillis, localDateTimeToMillis('2026-09-02', '07:00'));
  assert.equal(alarms[0].id, '2026-09-02:day12');
  assert.equal(alarms[0].title, 'Дневная смена');
});

test('сегодняшний будильник в прошлом не ставится', () => {
  // В полдень 1 сентября будильник на 07:00 этого же дня уже отзвонил.
  const alarms = planAlarms(contextFor('2-2-day', '2026-09-01'), settings, localNoon('2026-09-01'));
  assert.ok(alarms.every((alarm) => alarm.date !== '2026-09-01'));

  // А в полночь того же дня он ещё впереди.
  const early = planAlarms(
    contextFor('2-2-day', '2026-09-01'),
    settings,
    new Date(localDateTimeToMillis('2026-09-01', '03:00')),
  );
  assert.equal(early[0].date, '2026-09-01');
});

test('вперёд ставится не больше семи будильников', () => {
  const alarms = planAlarms(contextFor('2-2-day', '2026-09-01'), settings, localNoon('2026-09-01'));
  assert.equal(alarms.length, MAX_SCHEDULED_ALARMS);
  // Список строго по возрастанию времени.
  const sorted = [...alarms].sort((a, b) => a.triggerAtMillis - b.triggerAtMillis);
  assert.deepEqual(alarms.map((a) => a.id), sorted.map((a) => a.id));
});

test('выключенный тип смены и общий выключатель убирают будильники', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  assert.equal(planAlarms(context, DEFAULT_ALARM_SETTINGS, localNoon('2026-09-01')).length, 0);
  assert.equal(
    planAlarms(context, { ...settings, enabled: false }, localNoon('2026-09-01')).length,
    0,
  );
});

test('ручная правка снимает будильник с рабочего дня и ставит на подработку', () => {
  const context = contextFor('2-2-day', '2026-09-01');
  const withOverrides: ScheduleContext = {
    ...context,
    overrides: new Map([
      // 2 сентября было рабочим — стало выходным.
      ['2026-09-02', { date: '2026-09-02', shiftTypeId: 'off' }],
      // 3 сентября было выходным — вышел подработать.
      ['2026-09-03', { date: '2026-09-03', shiftTypeId: 'day12' }],
    ]),
  };

  const alarms = planAlarms(withOverrides, settings, localNoon('2026-09-01'));
  assert.ok(alarms.every((alarm) => alarm.date !== '2026-09-02'));
  assert.equal(alarms[0].date, '2026-09-03');
});

test('отступ может увести будильник на предыдущий день', () => {
  const nightSettings: AlarmSettings = {
    ...DEFAULT_ALARM_SETTINGS,
    // Ночная смена начинается в 20:00, отступ 21 час — это 23:00 накануне.
    byShiftType: { night12: { enabled: true, leadMinutes: 21 * 60 } },
  };
  const alarms = planAlarms(contextFor('2-2-night', '2026-09-01'), nightSettings, localNoon('2026-09-01'));

  assert.equal(alarms[0].date, '2026-09-02');
  assert.equal(alarms[0].triggerAtMillis, localDateTimeToMillis('2026-09-01', '23:00'));
  // Звонит накануне — и показывать его надо на дате звонка, а не смены.
  assert.equal(alarms[0].wakeDate, '2026-09-01');
  assert.equal(alarms[0].wakeTime, '23:00');
});

test('у типа смены без своей записи будильник выключен, а отступ — час', () => {
  const setting = settingFor(DEFAULT_ALARM_SETTINGS, 'day12');
  assert.equal(setting.enabled, false);
  assert.equal(setting.leadMinutes, 60);
});
