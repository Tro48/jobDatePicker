/**
 * Подмены нативных модулей: в jest нет ни MMKV, ни expo-updates, ни нативного
 * будильника — все трое ходят в Kotlin через Nitro или Expo Modules.
 *
 * Подменяется свой модуль-обёртка, а не сама библиотека: хранилище всё равно
 * прячется за адаптером, и подмена на объект в памяти даёт настоящий persist
 * zustand со всеми миграциями, только без файла на диске.
 */
// Имя с приставкой mock — единственный способ дать фабрике jest.mock доступ к
// внешней переменной: остальное она запрещает как неинициализированное.
const mockMemory = new Map();

jest.mock('@/data/storage.ts', () => ({
  mmkvStateStorage: {
    getItem: (name) => (mockMemory.has(name) ? mockMemory.get(name) : null),
    setItem: (name, value) => {
      mockMemory.set(name, value);
    },
    removeItem: (name) => {
      mockMemory.delete(name);
    },
  },
}));

/**
 * Иконки. Настоящие тянут expo-font с expo-asset, которого в зависимостях нет:
 * приложению он приезжает транзитивно через Metro, а jest резолвит по-другому.
 * Ставить ради тестов нативный пакет — значит менять отпечаток нативной части
 * и платить сборкой APK, поэтому иконка подменяется заглушкой. В тестах она и
 * не нужна: всё осмысленное в интерфейсе выражено текстом.
 */
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

/** Обновления по воздуху: в тестах модуль всегда выключен, если тест не сказал иначе. */
jest.mock('expo-updates', () => ({
  isEnabled: false,
  runtimeVersion: 'test-runtime',
  channel: 'test',
  createdAt: null,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

/** Хранилище чистится между тестами: иначе состояние течёт из файла в файл. */
beforeEach(() => {
  mockMemory.clear();
});
