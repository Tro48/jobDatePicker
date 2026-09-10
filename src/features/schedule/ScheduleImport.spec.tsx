import { act, fireEvent, render } from '@testing-library/react-native';
import { SchedulePickerScreen } from './SchedulePickerScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Приём чужого графика в окне нового графика.
 *
 * Проверяется то, ради чего вход сюда и вынесен: присланный файл должен
 * открыть предпросмотр вместо формы, а не тихо ничего не сделать, — и чужой
 * файл обязан сказать словами, что графика в нём нет. Сканер проверяется
 * заодно: обе кнопки без подписей, и перепутать их назначение легко.
 */

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ track: 'new' }),
}));

jest.mock('@/navigation/useGuardedPush.ts', () => ({ useGuardedPush: () => jest.fn() }));

const mockPick = jest.fn();
jest.mock('@/features/share/pickShareFile.ts', () => ({
  pickShareFile: (...args: unknown[]) => mockPick(...args),
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderPicker() {
  return render(
    <ThemeProvider>
      <SchedulePickerScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockReplace.mockClear();
  mockPick.mockReset();
});

// Кнопка без подписи: ищется по доступному имени, и если оно потеряется,
// значок останется молчащим квадратом для скринридера.
const BUTTON = 'Загрузить график из файла';

test('присланный файл открывает предпросмотр вместо формы', async () => {
  mockPick.mockResolvedValue({ kind: 'track', payload: 'AQID' });
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText(BUTTON));
  });

  // Именно replace: возвращаться в брошенную форму после принятия чужого
  // графика некуда и незачем.
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/track', params: { d: 'AQID' } });
});

test('файл без графика объясняется словами, а не тишиной', async () => {
  mockPick.mockResolvedValue({ kind: 'other', text: '{"что-то":"чужое"}' });
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText(BUTTON));
  });

  expect(view.getByText(/графика нет/)).toBeTruthy();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('закрытый проводник ошибкой не считается', async () => {
  mockPick.mockResolvedValue({ kind: 'canceled' });
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText(BUTTON));
  });

  expect(view.queryByText(/графика нет/)).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('вторая кнопка открывает сканер, а не проводник', async () => {
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Сканировать QR'));
  });

  expect(mockReplace).toHaveBeenCalledWith('/settings/scan');
  expect(mockPick).not.toHaveBeenCalled();
});
