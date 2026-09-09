import { createBackup, parseBackup, serializeBackup, stateFromBackup } from './backup.ts';
import { INITIAL_STATE, SCHEMA_VERSION, activeTrack, useAppStore } from './store.ts';
import { darkPalette } from '@/theme';

/**
 * Резервная копия.
 *
 * В голом Node не бежит: backup ходит через migrateState, а тот живёт в store
 * вместе с zustand и MMKV. Здесь jest подменяет хранилище объектом в памяти,
 * и путь получается ровно тот же, что на телефоне.
 */

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
});

/** Состояние, в котором есть что терять. */
function fillStore(): void {
  const store = useAppStore.getState();
  store.addShiftType({
    name: 'Вечерняя',
    badge: 'Веч',
    kind: 'work',
    colorToken: 'shift.extra',
    time: { start: '16:00', end: '00:00', unpaidBreakMinutes: 30 },
    rateMultiplier: 1.2,
  });
  store.addTrack({ name: 'Основная', own: true, presetId: '2-2-day', anchorDate: '2026-09-01' });
  useAppStore.getState().setOverride({ date: '2026-09-10', workedMinutesOverride: 300 });
  useAppStore.getState().addNote({ date: '2026-09-10', text: 'за Сергея', remindAt: '09:00' });
  const themeId = useAppStore.getState().addTheme('Ночная', darkPalette);
  useAppStore.getState().setThemeColor(themeId, 'accent', '#FDBA74');
  useAppStore.getState().addPayment({
    trackId: useAppStore.getState().tracks[0].id,
    kind: 'salary',
    period: '2026-09',
    receivedOn: '2026-10-10',
    amount: 75_000,
  });
}

test('копия и восстановление возвращают состояние как было', () => {
  fillStore();
  const before = useAppStore.getState();
  const text = serializeBackup(before);

  // Так выглядит чистая установка на новом телефоне.
  useAppStore.setState(INITIAL_STATE);
  const parsed = parseBackup(text);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  useAppStore.getState().restoreState(stateFromBackup(parsed.backup));
  const after = useAppStore.getState();

  expect(after.tracks).toEqual(before.tracks);
  expect(after.shiftTypes).toEqual(before.shiftTypes);
  expect(after.payments).toEqual(before.payments);
  expect(after.notes).toEqual(before.notes);
  // Оформление — тоже данные человека: подбирать цвета заново на новом
  // телефоне он не должен.
  expect(after.themes).toEqual(before.themes);
  expect(activeTrack(after)?.overrides['2026-09-10']?.workedMinutesOverride).toBe(300);
});

test('в сводке видно, что внутри файла, — до замены', () => {
  fillStore();
  const parsed = parseBackup(serializeBackup(useAppStore.getState()));

  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  expect(parsed.summary.tracks).toBe(1);
  expect(parsed.summary.overrides).toBe(1);
  expect(parsed.summary.notes).toBe(1);
  expect(parsed.summary.payments).toBe(1);
  expect(parsed.summary.schema).toBe(SCHEMA_VERSION);
});

test('чужой и битый файл отвергаются с понятным текстом', () => {
  for (const text of ['', 'не json', '{}', '{"format":"чужое"}']) {
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.length).toBeGreaterThan(10);
  }
});

test('копия из будущей версии отвергается, а не читается наполовину', () => {
  const backup = createBackup(useAppStore.getState());
  const parsed = parseBackup(JSON.stringify({ ...backup, schema: SCHEMA_VERSION + 1 }));

  expect(parsed.ok).toBe(false);
  if (!parsed.ok) expect(parsed.error).toContain('Обнови приложение');
});

test('копия со старой схемы проходит через ту же миграцию, что и обновление', () => {
  // Снимок версии 7: график и правки лежали в корне, дорожек не существовало.
  const legacy = {
    format: 'jobdatepicker-backup',
    schema: 7,
    createdAt: '2026-01-01T10:00:00.000Z',
    state: {
      appearance: 'dark',
      // Поле именно schedule: истории графиков в этой схеме ещё не было.
      schedule: {
        presetId: '2-2-day',
        pattern: { kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] },
        anchorDate: '2026-09-01',
      },
      overrides: { '2026-09-05': { date: '2026-09-05', note: 'за Сергея' } },
      payments: [],
      alarms: [],
    },
  };

  const parsed = parseBackup(JSON.stringify(legacy));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  const restored = stateFromBackup(parsed.backup);
  expect(restored.appearance).toBe('dark');
  expect(restored.tracks).toHaveLength(1);
  // Заметка старой копии переезжает в общий список, а пустая правка исчезает.
  expect(restored.notes.map((note) => note.text)).toEqual(['за Сергея']);
  expect(restored.tracks[0].overrides['2026-09-05']).toBeUndefined();
  // Единственный график старой копии становится первым периодом истории.
  expect(restored.tracks[0].schedules).toHaveLength(1);
  expect(restored.tracks[0].schedules[0].startsOn).toBe('2026-09-01');
  // Справочник смен в той схеме не хранился — он собирается из кода.
  expect(restored.shiftTypes).toEqual(INITIAL_STATE.shiftTypes);
});
