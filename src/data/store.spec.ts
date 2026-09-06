import {
  INITIAL_STATE,
  SCHEMA_VERSION,
  activeTrack,
  alarmTrack,
  migrateState,
  useAppStore,
} from './store.ts';
import { shiftDurationMinutes } from '@/domain/engine.ts';
import { MAIN_TRACK_NAME } from './migrations.ts';
import type { PersistedSnapshot } from './store.ts';
import { LATEST_RELEASE_ID, unseenReleases } from '@/domain/releaseNotes.ts';
import type { ReleaseManifest } from '@/domain/release.ts';

/**
 * Хранилище и его миграции.
 *
 * В голом Node эти тесты не бегут: store тянет zustand и MMKV, а MMKV — это
 * нативный модуль. Поэтому они здесь, где jest подменяет хранилище объектом в
 * памяти, а не в доменном наборе.
 */

const build: ReleaseManifest = {
  runtimeVersion: 'новая-сборка',
  url: 'https://example.com/smeny.apk',
  version: '0.1.9',
};

/**
 * Снимок состояния из прошлой версии схемы: полей обновлений в нём нет, а
 * график и правки лежат в корне — дорожек до версии 9 не существовало.
 */
const persistedV7: PersistedSnapshot = {
  appearance: 'dark',
  // Поле именно schedule: истории графиков в этой версии ещё не было.
  schedule: {
    presetId: '2-2-day',
    pattern: { kind: 'cycle', slots: ['day12', 'day12', 'off', 'off'] },
    anchorDate: '2026-09-01',
  },
  payroll: INITIAL_STATE.payroll,
  alarms: [],
  overrides: { '2026-09-05': { date: '2026-09-05', note: 'за Сергея' } },
  payments: [],
};

test('новая установка «что нового» не показывает', () => {
  expect(INITIAL_STATE.lastSeenReleaseId).toBe(LATEST_RELEASE_ID);
  expect(unseenReleases(INITIAL_STATE.lastSeenReleaseId)).toHaveLength(0);
});

test('обновление со схемы 7: «что нового» показывается, данные не теряются', () => {
  const migrated = migrateState(persistedV7, 7);

  // Отметки в старом снимке нет — значит, человек только что получил новую
  // версию, и рассказать ему о ней надо.
  expect(migrated.lastSeenReleaseId).toBeNull();
  expect(unseenReleases(migrated.lastSeenReleaseId).length).toBeGreaterThan(0);

  // Своё из снимка переживает миграцию. Правленых смен в снимке версии 7 быть
  // не могло — редактора тогда не было, — поэтому справочник равен встроенному.
  expect(migrated.appearance).toBe('dark');
  expect(migrated.shiftTypes).toEqual(INITIAL_STATE.shiftTypes);
});

test('обновление со схемы 8: график и правки переезжают в дорожку', () => {
  const migrated = migrateState(persistedV7, 8);

  expect(migrated.tracks).toHaveLength(1);
  expect(activeTrack(migrated)?.id).toBe(migrated.tracks[0].id);
  expect(migrated.tracks[0].own).toBe(true);
  expect(migrated.tracks[0].schedules.at(-1)?.presetId).toBe('2-2-day');
  expect(migrated.tracks[0].overrides['2026-09-05'].note).toBe('за Сергея');

  // Плоские поля прошлой схемы дальше не едут — иначе висели бы мёртвым грузом.
  expect(migrated).not.toHaveProperty('schedule');
  expect(migrated).not.toHaveProperty('overrides');
});

test('кеш проверки выпусков достраивается по умолчанию', () => {
  const migrated = migrateState(persistedV7, 7);
  expect(migrated.buildCheck).toEqual({ checkedAt: 0, build: null, dismissedRuntime: null });
});

test('уже прочитанное после миграции остаётся прочитанным', () => {
  const migrated = migrateState({ ...persistedV7, lastSeenReleaseId: '2026-09-03' }, 8);
  expect(migrated.lastSeenReleaseId).toBe('2026-09-03');
});

describe('дорожки', () => {
  beforeEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  const mine = {
    name: '',
    own: true,
    presetId: '2-2-day',
    anchorDate: '2026-09-01',
  } as const;

  const anya = {
    name: 'Аня',
    own: false,
    presetId: '2-2-night',
    anchorDate: '2026-09-01',
  } as const;

  test('первую дорожку заводят без имени, и оно подставляется', () => {
    useAppStore.getState().addTrack(mine);

    const state = useAppStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(activeTrack(state)?.schedules.at(-1)?.presetId).toBe('2-2-day');
    // Имя у единственной работы человек не выбирал, и спрашивать его незачем.
    expect(activeTrack(state)?.name).toBe(MAIN_TRACK_NAME);
    expect(activeTrack(state)?.own).toBe(true);
  });

  test('график правится у названной дорожки, а не у активной', () => {
    const first = useAppStore.getState().addTrack(mine);
    // Активной становится вторая — правим при этом первую.
    useAppStore.getState().addTrack(anya);

    useAppStore.getState().setTrackSchedule(first, 0, {
      presetId: '3-3-day',
      startsOn: '2026-10-01',
      anchorDate: '2026-10-01',
    });

    const state = useAppStore.getState();
    expect(state.tracks.find((track) => track.id === first)?.schedules.at(-1)?.presetId).toBe(
      '3-3-day',
    );
    expect(activeTrack(state)?.schedules.at(-1)?.presetId).toBe('2-2-night');
  });

  test('смена графика с даты не переписывает прожитое', () => {
    const id = useAppStore.getState().addTrack(mine);
    useAppStore.getState().addTrackSchedule(id, {
      presetId: '5-2',
      startsOn: '2026-10-01',
      anchorDate: '2026-10-01',
    });

    const track = useAppStore.getState().tracks.find((item) => item.id === id);
    expect(track?.schedules.map((period) => [period.startsOn, period.presetId])).toEqual([
      ['2026-09-01', '2-2-day'],
      ['2026-10-01', '5-2'],
    ]);
  });

  test('период с той же датой начала заменяет прежний, а не двоится', () => {
    const id = useAppStore.getState().addTrack(mine);
    const entry = { startsOn: '2026-10-01', anchorDate: '2026-10-01' } as const;
    useAppStore.getState().addTrackSchedule(id, { ...entry, presetId: '5-2' });
    useAppStore.getState().addTrackSchedule(id, { ...entry, presetId: '3-3-day' });

    const track = useAppStore.getState().tracks.find((item) => item.id === id);
    expect(track?.schedules).toHaveLength(2);
    expect(track?.schedules.at(-1)?.presetId).toBe('3-3-day');
  });

  test('история держится в порядке действия, как бы её ни добавляли', () => {
    const id = useAppStore.getState().addTrack(mine);
    useAppStore
      .getState()
      .addTrackSchedule(id, { presetId: '5-2', startsOn: '2027-01-01', anchorDate: '2027-01-01' });
    // Задним числом, между уже заведёнными периодами.
    useAppStore.getState().addTrackSchedule(id, {
      presetId: '3-3-day',
      startsOn: '2026-11-01',
      anchorDate: '2026-11-01',
    });

    const track = useAppStore.getState().tracks.find((item) => item.id === id);
    expect(track?.schedules.map((period) => period.startsOn)).toEqual([
      '2026-09-01',
      '2026-11-01',
      '2027-01-01',
    ]);
  });

  test('убрать период истории — не то же самое, что убрать работу', () => {
    const id = useAppStore.getState().addTrack(mine);
    useAppStore
      .getState()
      .addTrackSchedule(id, { presetId: '5-2', startsOn: '2026-10-01', anchorDate: '2026-10-01' });
    useAppStore.getState().removeTrackSchedule(id, 1);

    const state = useAppStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0].schedules.map((period) => period.presetId)).toEqual(['2-2-day']);
  });

  test('новая дорожка становится активной, чужие часы не считаются моими', () => {
    useAppStore.getState().addTrack(mine);
    const id = useAppStore.getState().addTrack(anya);

    const state = useAppStore.getState();
    expect(state.tracks).toHaveLength(2);
    expect(state.activeTrackId).toBe(id);
    expect(activeTrack(state)?.own).toBe(false);
  });

  test('правки дня ложатся в активную дорожку, а не в соседнюю', () => {
    const first = useAppStore.getState().addTrack(mine);
    useAppStore.getState().addTrack(anya);

    useAppStore.getState().setOverride({ date: '2026-09-05', shiftTypeId: 'vacation' });

    const state = useAppStore.getState();
    expect(activeTrack(state)?.overrides['2026-09-05'].shiftTypeId).toBe('vacation');
    // Отпуск Ани не должен появиться в моей сводке часов.
    expect(state.tracks.find((track) => track.id === first)?.overrides).toEqual({});
  });

  test('удаление активной дорожки переводит взгляд на оставшуюся', () => {
    const first = useAppStore.getState().addTrack(mine);
    const id = useAppStore.getState().addTrack(anya);

    useAppStore.getState().removeTrack(id);

    const state = useAppStore.getState();
    expect(state.tracks).toHaveLength(1);
    // Взгляд переезжает сам: удалённый id разрешается в первую дорожку.
    expect(activeTrack(state)?.id).toBe(first);
  });

  test('удаление последней дорожки оставляет «график не выбран», а не пустоту', () => {
    useAppStore.getState().addTrack(mine);
    useAppStore.getState().removeTrack(useAppStore.getState().tracks[0].id);

    expect(activeTrack(useAppStore.getState())).toBeNull();
  });

  test('будильники не следуют за вкладками', () => {
    useAppStore.getState().addTrack(mine);
    const mineId = useAppStore.getState().activeTrackId;
    // Смотрим на чужой график — а звонить всё равно должно по своей работе.
    useAppStore.getState().addTrack(anya);

    const state = useAppStore.getState();
    expect(state.activeTrackId).not.toBe(mineId);
    expect(alarmTrack(state)?.id).toBe(mineId);
  });

  test('без своей работы будильник берёт первый график, а не пустоту', () => {
    const id = useAppStore.getState().addTrack(anya);

    expect(alarmTrack(useAppStore.getState())?.id).toBe(id);
    expect(alarmTrack(INITIAL_STATE)).toBeNull();
  });

  test('пустой выбор — это первая дорожка, а не пустой календарь', () => {
    const first = useAppStore.getState().addTrack(mine);
    useAppStore.getState().addTrack(anya);

    // Так приложение поднимается на каждом запуске: выбор не сохраняется, а
    // миграция при совпадении версий даже не зовётся.
    useAppStore.setState({ activeTrackId: null });
    expect(activeTrack(useAppStore.getState())?.id).toBe(first);

    // И так же — если выбор указывает на удалённую дорожку.
    useAppStore.setState({ activeTrackId: 'ghost' });
    expect(activeTrack(useAppStore.getState())?.id).toBe(first);
  });

  test('группа теряет участников, чьи графики удалили', () => {
    const anyaId = useAppStore.getState().addTrack(anya);
    useAppStore.getState().addSharedGroup('Друзья', [anyaId, 'ghost']);

    // Подъём состояния: снимок мог пережить удаление дорожки.
    const migrated = migrateState(
      {
        tracks: useAppStore.getState().tracks,
        sharedGroups: useAppStore.getState().sharedGroups,
      },
      12,
    );

    // Иначе группа навсегда осталась бы без совпадений, и объяснить это нечем.
    expect(migrated.sharedGroups[0].trackIds).toEqual([anyaId]);
  });

  test('деньги и числа выплат у каждой работы свои', () => {
    const first = useAppStore.getState().addTrack(mine);
    const second = useAppStore.getState().addTrack({ ...anya, own: true, name: 'Склад' });

    useAppStore.getState().setTrackPayrollRules(second, [
      {
        kind: 'advance',
        dayOfMonth: 7,
        paidInMonthOffset: 0,
        weekendShift: 'before',
      },
    ]);
    useAppStore.getState().addPayment({
      trackId: second,
      kind: 'salary',
      period: '2026-09',
      receivedOn: '2026-10-05',
      amount: 20000,
    });

    const tracks = useAppStore.getState().tracks;
    const mainRules = tracks.find((track) => track.id === first)?.payrollRules;
    const storeRules = tracks.find((track) => track.id === second)?.payrollRules;

    // Числа второй работы не переписали числа первой.
    expect(storeRules?.[0].dayOfMonth).toBe(7);
    expect(mainRules?.[0].dayOfMonth).not.toBe(7);
    expect(useAppStore.getState().payments[0].trackId).toBe(second);
  });

  test('без единой дорожки правки дня некуда класть и состояние не портится', () => {
    useAppStore.getState().setOverride({ date: '2026-09-05', note: 'мимо' });

    expect(useAppStore.getState().tracks).toEqual([]);
  });
});

describe('действия', () => {
  beforeEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  test('отметка «прочитано» ставится на самую свежую запись', () => {
    useAppStore.setState({ lastSeenReleaseId: null });
    useAppStore.getState().markReleasesSeen();

    expect(useAppStore.getState().lastSeenReleaseId).toBe(LATEST_RELEASE_ID);
    expect(unseenReleases(useAppStore.getState().lastSeenReleaseId)).toHaveLength(0);
  });

  test('«понял» молчит про эту сборку, но не про следующую', () => {
    const store = useAppStore.getState();
    store.setKnownBuild(build);
    store.dismissBuildNotice();

    expect(useAppStore.getState().buildCheck.dismissedRuntime).toBe('новая-сборка');

    // Вышла следующая сборка — молчание с неё не переносится.
    useAppStore.getState().setKnownBuild({ ...build, runtimeVersion: 'ещё-новее' });
    const { build: known, dismissedRuntime } = useAppStore.getState().buildCheck;
    expect(known?.runtimeVersion).not.toBe(dismissedRuntime);
  });

  test('ручная проверка снимает молчание', () => {
    const store = useAppStore.getState();
    store.setKnownBuild(build);
    store.dismissBuildNotice();
    store.allowBuildNotice();

    expect(useAppStore.getState().buildCheck.dismissedRuntime).toBeNull();
  });
});

describe('свои смены', () => {
  beforeEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  const evening = {
    name: 'Вечерняя смена',
    badge: 'Веч',
    kind: 'work',
    colorToken: 'shift.extra',
    time: { start: '16:00', end: '00:00', unpaidBreakMinutes: 30 },
    rateMultiplier: 1.2,
  } as const;

  test('заведённая смена появляется в справочнике и считает часы за вычетом перерыва', () => {
    const id = useAppStore.getState().addShiftType(evening);
    const type = useAppStore.getState().shiftTypes.find((item) => item.id === id);

    expect(type?.builtinId).toBeNull();
    expect(type?.name).toBe('Вечерняя смена');
    expect(type && shiftDurationMinutes(type)).toBe(7 * 60 + 30);
  });

  test('у встроенной смены правится название, но не вид', () => {
    useAppStore.getState().updateShiftType('night12', { name: 'Ночь на складе', kind: 'rest' });
    const type = useAppStore.getState().shiftTypes.find((item) => item.id === 'night12');

    expect(type?.name).toBe('Ночь на складе');
    expect(type?.kind).toBe('work');
  });

  test('встроенная смена не удаляется: на неё ссылаются встроенные графики', () => {
    useAppStore.getState().removeShiftType('off');

    expect(useAppStore.getState().shiftTypes.some((type) => type.id === 'off')).toBe(true);
  });

  test('смену, на которой стоит график, удалить нельзя', () => {
    const id = useAppStore.getState().addShiftType(evening);
    const trackId = useAppStore.getState().addTrack({
      name: 'Основная',
      own: true,
      presetId: '2-2-day',
      anchorDate: '2026-09-01',
    });
    useAppStore.setState((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              schedules: [
                {
                  presetId: 'custom',
                  pattern: { kind: 'cycle', slots: [id, 'off'] },
                  anchorDate: '2026-09-01',
                  startsOn: '2026-09-01',
                },
              ],
            }
          : track,
      ),
    }));

    useAppStore.getState().removeShiftType(id);

    expect(useAppStore.getState().shiftTypes.some((type) => type.id === id)).toBe(true);
  });

  test('удаление смены оставляет заметку дня, но снимает саму смену', () => {
    const id = useAppStore.getState().addShiftType(evening);
    useAppStore.getState().addTrack({
      name: 'Основная',
      own: true,
      presetId: '2-2-day',
      anchorDate: '2026-09-01',
    });
    useAppStore.getState().setOverride({ date: '2026-09-10', shiftTypeId: id, note: 'за Сергея' });
    useAppStore.getState().setOverride({ date: '2026-09-11', shiftTypeId: id });

    useAppStore.getState().removeShiftType(id);

    const overrides = activeTrack(useAppStore.getState())?.overrides ?? {};
    expect(overrides['2026-09-10']).toEqual({ date: '2026-09-10', note: 'за Сергея' });
    // Правка, в которой не осталось ничего, кроме снятой смены, исчезает целиком.
    expect(overrides['2026-09-11']).toBeUndefined();
  });

  test('правки смен переживают перезапуск, а поля из кода — обновление сборки', () => {
    useAppStore.getState().updateShiftType('day12', { name: 'Дневная на складе' });
    const id = useAppStore.getState().addShiftType(evening);

    // Снимок, каким он уходит в MMKV, — и подъём с него.
    const snapshot = JSON.parse(
      JSON.stringify({ shiftTypes: useAppStore.getState().shiftTypes }),
    ) as PersistedSnapshot;
    const restored = migrateState(snapshot, SCHEMA_VERSION);

    expect(restored.shiftTypes.find((type) => type.id === 'day12')?.name).toBe('Дневная на складе');
    expect(restored.shiftTypes.find((type) => type.id === id)?.name).toBe('Вечерняя смена');
    // Многодневность отпуска задана кодом, и снимок её не отменяет — из-за
    // ровно этого поля справочник когда-то и не хранили.
    expect(restored.shiftTypes.find((type) => type.id === 'vacation')?.multiDay).toBe(true);
  });
});

describe('свои графики', () => {
  beforeEach(() => {
    useAppStore.setState(INITIAL_STATE);
  });

  test('собранный график ставится на дорожку так же, как встроенный', () => {
    const store = useAppStore.getState();
    const scheduleId = store.addCustomSchedule('Пять через два', {
      kind: 'cycle',
      slots: ['day12', 'day12', 'day12', 'day12', 'day12', 'off', 'off'],
    });

    const trackId = store.addTrack({
      name: 'Основная',
      own: true,
      presetId: scheduleId,
      anchorDate: '2026-09-01',
    });

    const track = useAppStore.getState().tracks.find((item) => item.id === trackId);
    expect(track?.schedules.at(-1)?.presetId).toBe(scheduleId);
    expect(track?.schedules.at(-1)?.pattern).toEqual({
      kind: 'cycle',
      slots: ['day12', 'day12', 'day12', 'day12', 'day12', 'off', 'off'],
    });
  });

  test('удаление собранного графика не ломает тех, кто по нему живёт', () => {
    const store = useAppStore.getState();
    const scheduleId = store.addCustomSchedule('Мой', { kind: 'cycle', slots: ['day12', 'off'] });
    store.addTrack({ name: 'Основная', own: true, presetId: scheduleId, anchorDate: '2026-09-01' });

    useAppStore.getState().removeCustomSchedule(scheduleId);

    // Раскладка скопирована в дорожку: список выбора её потерял, календарь — нет.
    expect(useAppStore.getState().customSchedules).toHaveLength(0);
    expect(activeTrack(useAppStore.getState())?.schedules.at(-1)?.pattern).toEqual({
      kind: 'cycle',
      slots: ['day12', 'off'],
    });
  });

  test('правка собранного графика не переписывает уже прожитые месяцы', () => {
    const store = useAppStore.getState();
    const scheduleId = store.addCustomSchedule('Мой', { kind: 'cycle', slots: ['day12', 'off'] });
    store.addTrack({ name: 'Основная', own: true, presetId: scheduleId, anchorDate: '2026-09-01' });

    useAppStore.getState().updateCustomSchedule(scheduleId, {
      pattern: { kind: 'cycle', slots: ['night12', 'off', 'off'] },
    });

    expect(activeTrack(useAppStore.getState())?.schedules.at(-1)?.pattern).toEqual({
      kind: 'cycle',
      slots: ['day12', 'off'],
    });
  });
});
