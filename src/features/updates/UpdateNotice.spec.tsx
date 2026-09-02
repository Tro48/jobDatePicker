import { render, screen, userEvent } from '@testing-library/react-native';
import { UpdateNotice } from './UpdateNotice.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { RELEASE_NOTES } from '@/domain/releaseNotes.ts';
import { ThemeProvider } from '@/theme';

/**
 * Полоска об обновлении на календаре: что она показывает, в каком порядке и
 * что происходит по крестику.
 */

// Приставка mock — требование jest: только такие имена фабрика подмены видит
// снаружи.
const mockNavigate = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: mockPush, back: jest.fn() }),
  // Замок «не открывать дважды» снимается по возврату фокуса; в тесте экрана
  // под полоской нет, и звать колбэк некому.
  useFocusEffect: () => {},
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

const build = {
  runtimeVersion: 'новая-сборка',
  url: 'https://example.com/smeny.apk',
  version: '0.1.9',
  notes: 'Видно, сколько уже отработано',
};

function setup(state: Partial<typeof INITIAL_STATE> = {}) {
  useAppStore.setState({ ...INITIAL_STATE, ...state });
  return render(
    <ThemeProvider>
      <UpdateNotice />
    </ThemeProvider>,
  );
}

test('всё прочитано и сборок нет — полоски нет', async () => {
  const { toJSON } = await setup();
  expect(toJSON()).toBeNull();
});

test('непрочитанный выпуск: полоска называет главное изменение и ведёт в список', async () => {
  await setup({ lastSeenReleaseId: null });

  const notice = screen.getByRole('button', { name: /Обновление приехало/ });
  expect(notice.props.accessibilityLabel).toContain(RELEASE_NOTES[0].title);

  await userEvent.press(notice);
  expect(mockPush).toHaveBeenCalledWith('/whats-new');
});

test('крестик закрывает «что нового» насовсем', async () => {
  await setup({ lastSeenReleaseId: null });

  await userEvent.press(screen.getByLabelText('Скрыть сообщение об обновлении'));

  expect(useAppStore.getState().lastSeenReleaseId).toBe(RELEASE_NOTES[0].id);
  expect(screen.queryByRole('button', { name: /Обновление приехало/ })).toBeNull();
});

test('вышедшая сборка важнее «что нового» и ведёт в настройки, а не за APK', async () => {
  await setup({
    lastSeenReleaseId: null,
    buildCheck: { checkedAt: Date.now(), build, dismissedRuntime: null },
  });

  const notice = screen.getByRole('button', { name: /Вышла версия 0\.1\.9/ });
  expect(notice.props.accessibilityLabel).toContain('Видно, сколько уже отработано');
  // Про «что нового» полоска молчит: разом две новости — это уже лента.
  expect(screen.queryByRole('button', { name: /Обновление приехало/ })).toBeNull();

  await userEvent.press(notice);
  expect(mockNavigate).toHaveBeenCalledWith('/settings');
});

test('закрытая сборка уступает место «что нового»', async () => {
  await setup({
    lastSeenReleaseId: null,
    buildCheck: { checkedAt: Date.now(), build, dismissedRuntime: 'новая-сборка' },
  });

  expect(screen.queryByRole('button', { name: /Вышла версия/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Обновление приехало/ })).toBeTruthy();
});
