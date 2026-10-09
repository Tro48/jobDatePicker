import { render, screen } from '@testing-library/react-native';
import { UpdateCard } from './UpdateCard.tsx';
import type { UpdateStatus } from './useAppUpdate.ts';
import type { BuildSignal } from './useBuildSignal.ts';
import type { RustoreUpdateState } from '@/features/rustore/useRustoreUpdate.ts';
import { ThemeProvider } from '@/theme';

/**
 * Карточка обновлений: что пишется, когда обновление нашёл один из каналов.
 *
 * Все три канала подменяются: их поведение проверено собственными спеками, а
 * здесь важно одно — как карточка сводит их ответы в одну надпись. Главная
 * ловушка — пара «установлена последняя версия» рядом с кнопкой обновления:
 * в ней карточка сама себе противоречит.
 */

// Имена с приставкой mock — требование jest: только такие переменные фабрика
// подмены видит снаружи.
const mockStore: RustoreUpdateState = {
  available: false,
  versionCode: null,
  install: jest.fn(),
};

const mockBuild: BuildSignal = {
  build: null,
  notice: false,
  dismiss: jest.fn(),
  refresh: jest.fn(),
};

const mockApp: {
  status: UpdateStatus;
  runtimeVersion: string | null;
  channel: string | null;
  bundleCreatedAt: Date | null;
  check: () => void;
  apply: () => void;
} = {
  status: { kind: 'idle' },
  runtimeVersion: null,
  channel: null,
  bundleCreatedAt: null,
  check: jest.fn(),
  apply: jest.fn(),
};

jest.mock('@/features/rustore/useRustoreUpdate.ts', () => ({
  useRustoreUpdate: () => mockStore,
}));

jest.mock('@/features/updates/useBuildSignal.ts', () => ({
  useBuildSignal: () => mockBuild,
}));

jest.mock('@/features/updates/useAppUpdate.ts', () => ({
  useAppUpdate: () => mockApp,
}));

jest.mock('@/navigation/useGuardedPush.ts', () => ({
  useGuardedPush: () => jest.fn(),
}));

beforeEach(() => {
  mockStore.available = false;
  mockStore.versionCode = null;
  mockBuild.build = null;
  mockApp.status = { kind: 'idle' };
});

function renderCard() {
  return render(
    <ThemeProvider>
      <UpdateCard />
    </ThemeProvider>,
  );
}

test('обновление в магазине: надписи «установлена последняя версия» нет', async () => {
  mockStore.available = true;
  mockStore.versionCode = 20;
  // По воздуху обновлений нет — именно этот ответ и писал прежде «установлена
  // последняя версия» рядом с кнопкой обновления из магазина.
  mockApp.status = { kind: 'current' };

  await renderCard();

  expect(screen.getByText('В RuStore вышло обновление.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Обновить в RuStore' })).toBeTruthy();
  expect(screen.queryByText('Установлена последняя версия.')).toBeNull();
});

test('без обновлений нигде — «установлена последняя версия»', async () => {
  mockApp.status = { kind: 'current' };

  await renderCard();

  expect(screen.getByText('Установлена последняя версия.')).toBeTruthy();
  expect(screen.queryByText('В RuStore вышло обновление.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Обновить в RuStore' })).toBeNull();
});

test('вышедшая сборка важнее магазинного обновления', async () => {
  mockBuild.build = {
    runtimeVersion: 'новая-сборка',
    url: 'https://example.com/smeny.apk',
    version: '0.1.28',
    builtAt: '2026-10-04T09:49:32Z',
    notes: 'Будильник звонит надёжнее',
  };
  mockStore.available = true;
  mockApp.status = { kind: 'current' };

  await renderCard();

  expect(screen.getByText(/Вышла версия 0\.1\.28/)).toBeTruthy();
  expect(screen.queryByText('В RuStore вышло обновление.')).toBeNull();
});
