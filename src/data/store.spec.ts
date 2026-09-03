import { INITIAL_STATE, activeTrack, alarmTrack, migrateState, useAppStore } from './store.ts';
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

  // Своё из снимка переживает миграцию, справочник смен берётся из кода.
  expect(migrated.appearance).toBe('dark');
  expect(migrated.shiftTypes).toBe(INITIAL_STATE.shiftTypes);
});

test('обновление со схемы 8: график и правки переезжают в дорожку', () => {
  const migrated = migrateState(persistedV7, 8);

  expect(migrated.tracks).toHaveLength(1);
  expect(activeTrack(migrated)?.id).toBe(migrated.tracks[0].id);
  expect(migrated.tracks[0].own).toBe(true);
  expect(migrated.tracks[0].schedule?.presetId).toBe('2-2-day');
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
    expect(activeTrack(state)?.schedule?.presetId).toBe('2-2-day');
    // Имя у единственной работы человек не выбирал, и спрашивать его незачем.
    expect(activeTrack(state)?.name).toBe(MAIN_TRACK_NAME);
    expect(activeTrack(state)?.own).toBe(true);
  });

  test('график правится у названной дорожки, а не у активной', () => {
    const first = useAppStore.getState().addTrack(mine);
    // Активной становится вторая — правим при этом первую.
    useAppStore.getState().addTrack(anya);

    useAppStore.getState().setTrackSchedule(first, '3-3-day', '2026-10-01');

    const state = useAppStore.getState();
    expect(state.tracks.find((track) => track.id === first)?.schedule?.presetId).toBe('3-3-day');
    expect(activeTrack(state)?.schedule?.presetId).toBe('2-2-night');
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
