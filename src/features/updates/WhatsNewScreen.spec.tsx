import { render, screen } from '@testing-library/react-native';
import { WhatsNewScreen } from './WhatsNewScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { RELEASE_NOTES } from '@/domain/releaseNotes.ts';
import { ThemeProvider } from '@/theme';

/**
 * Шторка «Что нового» отвечает на один вопрос — что делает обновление,
 * которое человек только что получил. История выпусков сюда не приезжает: в
 * ней он ничего не искал.
 */

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), navigate: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function setup(state: Partial<typeof INITIAL_STATE> = {}) {
  useAppStore.setState({ ...INITIAL_STATE, ...state });
  return render(
    <ThemeProvider>
      <WhatsNewScreen />
    </ThemeProvider>,
  );
}

test('показан только свежий выпуск, прошлые — нет', async () => {
  // Человек пропустил несколько выпусков: непрочитанного больше одного.
  await setup({ lastSeenReleaseId: null });

  const [latest, ...older] = RELEASE_NOTES;

  expect(screen.getByText(latest.title)).toBeTruthy();
  for (const note of older) {
    expect(screen.queryByText(note.title)).toBeNull();
  }
});

test('повторное открытие показывает тот же выпуск, а не всю историю', async () => {
  // Всё прочитано — раньше в этом случае вываливалась история целиком.
  await setup();

  const [latest, ...older] = RELEASE_NOTES;

  expect(screen.getByText(latest.title)).toBeTruthy();
  for (const note of older) {
    expect(screen.queryByText(note.title)).toBeNull();
  }
});

test('открыли — значит прочитали', async () => {
  await setup({ lastSeenReleaseId: null });

  expect(useAppStore.getState().lastSeenReleaseId).toBe(RELEASE_NOTES[0].id);
});
