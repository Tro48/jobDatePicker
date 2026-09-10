/**
 * Инструменты RuStore за пределами магазина.
 *
 * Проверяется то, что ломается молча и в самом плохом месте: SDK нет ни в
 * отладочной сборке, ни в APK с GitHub, а вызовы к ним живут в карточке
 * обновлений и на «Сводке» — то есть на экранах, которые открывают каждый день.
 * Исключение из нативной части здесь означает не «не спросили про обновление»,
 * а белый экран вместо сводки.
 *
 * Поэтому от клиента требуется ровно одно: молча вернуть отказ. Ни падений, ни
 * обращений к модулям, которых нет.
 */

const mockExtra: { distribution?: string } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

const mockUpdate = { init: jest.fn(), getAppUpdateInfo: jest.fn(), immediate: jest.fn() };
const mockReview = { init: jest.fn(), requestReviewFlow: jest.fn(), launchReviewFlow: jest.fn() };

/**
 * Нативные модули подставляются в NativeModules, а не подменой всего
 * react-native: пресет jest-expo поднимает настоящий react-native и с
 * подменённым модулем не заводится.
 *
 * Клиент читает NativeModules один раз при импорте и запоминает удачную
 * инициализацию, поэтому каждый тест берёт модуль заново.
 */
function loadClient(withNativeModules = true): typeof import('./client.ts') {
  jest.resetModules();
  // require, а не import: динамический импорт в jest без ESM не работает, а
  // модуль нужен именно свежий — после подмены NativeModules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NativeModules } = require('react-native') as typeof import('react-native');
  const modules = NativeModules as unknown as Record<string, unknown>;
  if (withNativeModules) {
    modules.RustoreUpdate = mockUpdate;
    modules.RustoreReview = mockReview;
  } else {
    delete modules.RustoreUpdate;
    delete modules.RustoreReview;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./client.ts') as typeof import('./client.ts');
}

beforeEach(() => {
  delete mockExtra.distribution;
  mockUpdate.init.mockReset();
  mockUpdate.getAppUpdateInfo.mockReset();
  mockUpdate.immediate.mockReset();
  mockReview.init.mockReset();
  mockReview.requestReviewFlow.mockReset();
  mockReview.launchReviewFlow.mockReset();
});

test('вне сборки для магазина SDK не трогаются вовсе', async () => {
  const client = loadClient();

  expect(await client.checkUpdate()).toBeNull();
  expect(await client.runUpdate()).toBe(false);
  expect(await client.askForReview()).toBe(false);

  // Ни одного вызова: инициализировать SDK там, где магазина нет, незачем.
  expect(mockUpdate.init).not.toHaveBeenCalled();
  expect(mockReview.init).not.toHaveBeenCalled();
});

test('в сборке для магазина инициализация одна на все вызовы', async () => {
  mockExtra.distribution = 'rustore';
  mockUpdate.getAppUpdateInfo.mockResolvedValue({
    updateAvailability: 2,
    availableVersionCode: 17,
  });
  const client = loadClient();

  await client.checkUpdate();
  await client.checkUpdate();

  expect(mockUpdate.init).toHaveBeenCalledTimes(1);
  expect(mockReview.init).toHaveBeenCalledTimes(1);
});

test('падение нативной части — это отказ, а не исключение', async () => {
  mockExtra.distribution = 'rustore';
  mockUpdate.getAppUpdateInfo.mockRejectedValue(new Error('RuStore не установлен'));
  mockReview.requestReviewFlow.mockRejectedValue(new Error('нет авторизации'));
  const client = loadClient();

  await expect(client.checkUpdate()).resolves.toBeNull();
  await expect(client.askForReview()).resolves.toBe(false);
});

test('обновление предлагается только при UPDATE_AVAILABLE', async () => {
  const client = loadClient();

  expect(client.hasUpdate({ updateAvailability: 2 } as never)).toBe(true);
  // 1 — обновления нет, 3 — установка уже идёт: предлагать нечего ни в том, ни в другом случае.
  expect(client.hasUpdate({ updateAvailability: 1 } as never)).toBe(false);
  expect(client.hasUpdate({ updateAvailability: 3 } as never)).toBe(false);
  expect(client.hasUpdate(null)).toBe(false);
});

test('без нативных модулей клиент просто отказывает', async () => {
  mockExtra.distribution = 'rustore';
  const client = loadClient(false);

  expect(await client.checkUpdate()).toBeNull();
  expect(await client.runUpdate()).toBe(false);
  expect(await client.askForReview()).toBe(false);
});

test('форма оценки не открывается, если RuStore её не предложил', async () => {
  mockExtra.distribution = 'rustore';
  mockReview.requestReviewFlow.mockResolvedValue(false);
  const client = loadClient();

  expect(await client.askForReview()).toBe(false);
  expect(mockReview.launchReviewFlow).not.toHaveBeenCalled();
});
