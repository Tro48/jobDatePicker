import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useBuildSignal } from './useBuildSignal.ts';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';

/**
 * Сигнал о вышедшей сборке APK: единственный канал, который сам до телефона не
 * доезжает, — поэтому его поведение проверяется целиком, вплоть до того,
 * сколько раз он ходит в сеть.
 */

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { releaseManifestUrl: 'https://example.com/android.json' } } },
}));

const manifest = {
  runtimeVersion: 'новая-сборка',
  url: 'https://example.com/smeny.apk',
  version: '0.1.9',
  notes: 'Видно, сколько уже отработано',
};

/** Отпечаток установленной сборки задан в подмене expo-updates: test-runtime. */
function respondWith(body: unknown, ok = true) {
  const fetchMock = jest.fn().mockResolvedValue({ ok, json: async () => body });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  useAppStore.setState({ buildCheck: { ...INITIAL_STATE.buildCheck } });
});

test('вышедшая сборка попадает в хранилище и зажигает полоску', async () => {
  respondWith(manifest);

  const { result } = await renderHook(() => useBuildSignal());

  await waitFor(() => expect(result.current.build).not.toBeNull());
  expect(result.current.build?.version).toBe('0.1.9');
  expect(result.current.notice).toBe(true);
});

test('сборка с тем же отпечатком новостью не считается', async () => {
  respondWith({ ...manifest, runtimeVersion: 'test-runtime' });

  const { result } = await renderHook(() => useBuildSignal());

  await waitFor(() => expect(useAppStore.getState().buildCheck.checkedAt).toBeGreaterThan(0));
  expect(result.current.build).toBeNull();
  expect(result.current.notice).toBe(false);
});

test('«понял» гасит полоску, но сборку из хранилища не стирает', async () => {
  respondWith(manifest);
  const { result } = await renderHook(() => useBuildSignal());
  await waitFor(() => expect(result.current.notice).toBe(true));

  await act(async () => {
    result.current.dismiss();
  });

  expect(result.current.notice).toBe(false);
  expect(result.current.build).not.toBeNull();
});

test('второй экран в сеть не ходит: проверка не чаще раза в шесть часов', async () => {
  const fetchMock = respondWith(manifest);
  const first = await renderHook(() => useBuildSignal());
  await waitFor(() => expect(first.result.current.build).not.toBeNull());
  expect(fetchMock).toHaveBeenCalledTimes(1);

  await renderHook(() => useBuildSignal());
  await act(async () => {});

  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('ручная проверка ходит в сеть всегда и возвращает полоску', async () => {
  const fetchMock = respondWith(manifest);
  const { result } = await renderHook(() => useBuildSignal());
  await waitFor(() => expect(result.current.notice).toBe(true));

  await act(async () => {
    result.current.dismiss();
  });
  expect(result.current.notice).toBe(false);

  await act(async () => {
    await result.current.refresh({ force: true });
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.notice).toBe(true);
});

test('без сети прежнее знание о сборке остаётся', async () => {
  respondWith(manifest);
  const { result } = await renderHook(() => useBuildSignal());
  await waitFor(() => expect(result.current.build).not.toBeNull());

  global.fetch = jest.fn().mockRejectedValue(new Error('Network request failed')) as never;
  await act(async () => {
    await result.current.refresh({ force: true });
  });

  expect(result.current.build?.version).toBe('0.1.9');
});

test('битый список выпусков сборкой не считается', async () => {
  // Ссылка не по https: её открывает Linking, доверять такому файлу нельзя.
  respondWith({ ...manifest, url: 'intent://scan/#Intent;end' });

  const { result } = await renderHook(() => useBuildSignal());

  await waitFor(() => expect(useAppStore.getState().buildCheck.checkedAt).toBeGreaterThan(0));
  expect(result.current.build).toBeNull();
});
