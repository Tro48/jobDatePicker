import { INITIAL_STATE, migrateState, useAppStore } from './store.ts';
import type { AppState } from './store.ts';
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

/** Снимок состояния из прошлой версии схемы: полей обновлений в нём нет. */
const persistedV7: Partial<AppState> = {
  appearance: 'dark',
  schedule: null,
  payroll: INITIAL_STATE.payroll,
  alarms: [],
  overrides: {},
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

test('кеш проверки выпусков достраивается по умолчанию', () => {
  const migrated = migrateState(persistedV7, 7);
  expect(migrated.buildCheck).toEqual({ checkedAt: 0, build: null, dismissedRuntime: null });
});

test('уже прочитанное после миграции остаётся прочитанным', () => {
  const migrated = migrateState({ ...persistedV7, lastSeenReleaseId: '2026-09-03' }, 8);
  expect(migrated.lastSeenReleaseId).toBe('2026-09-03');
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
