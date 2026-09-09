import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeColorsScreen } from './ThemeColorsScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Экран своих цветов.
 *
 * Проверяется то, ради чего он написан: разделы свёрнуты и не превращают экран
 * в стену, цвет открывается на правку в выбранной теме, а сброс возвращает
 * палитру приложения.
 */

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderScreen() {
  return render(
    <ThemeProvider>
      <ThemeColorsScreen />
    </ThemeProvider>,
  );
}

/** Раскрывает раздел: пока он свёрнут, цветов в нём не видно. */
async function openGroup(view: Awaited<ReturnType<typeof render>>, title: string) {
  await act(async () => {
    fireEvent.press(view.getByLabelText(new RegExp(`^${title}: `)));
  });
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockPush.mockClear();
  mockBack.mockClear();
});

test('разделы свёрнуты, и по каждому видно, сколько в нём цветов', async () => {
  const view = await renderScreen();

  expect(view.getByLabelText('Цвета смен: 10 цветов, все как в приложении')).toBeTruthy();
  expect(view.getByLabelText('Основа: 6 цветов, все как в приложении')).toBeTruthy();
  // Ни одной строки цвета на экране, пока раздел не раскрыт.
  expect(view.queryByLabelText(/^Акцент,/)).toBeNull();
});

test('раскрытый раздел показывает свои цвета', async () => {
  const view = await renderScreen();
  await openGroup(view, 'Акценты и состояния');

  expect(view.getByLabelText('Акцент, #1D4ED8')).toBeTruthy();
});

test('открыт один раздел за раз: иначе это та же стена', async () => {
  const view = await renderScreen();
  await openGroup(view, 'Основа');
  expect(view.getByLabelText(/^Фон,/)).toBeTruthy();

  await openGroup(view, 'Цвета смен');
  expect(view.queryByLabelText(/^Фон,/)).toBeNull();
  expect(view.getByLabelText(/^Синий,/)).toBeTruthy();
});

test('нажатие на цвет открывает его правку в выбранной теме', async () => {
  const view = await renderScreen();
  await openGroup(view, 'Акценты и состояния');

  await act(async () => {
    fireEvent.press(view.getByLabelText(/^Акцент,/));
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/settings/theme-color',
    params: { slot: 'accent', scheme: 'light' },
  });
});

test('свой цвет посчитан и в заголовке раздела, и в строке', async () => {
  useAppStore.setState({ themeColors: { light: { accent: '#7C2D12' }, dark: {} } });
  const view = await renderScreen();

  expect(view.getByLabelText('Акценты и состояния: 3 цветов, свой 1')).toBeTruthy();
  expect(view.getByText('Своих цветов в этой теме: 1. Остальные — как в приложении.')).toBeTruthy();

  await openGroup(view, 'Акценты и состояния');
  expect(view.getByLabelText('Акцент, #7C2D12 · свой цвет')).toBeTruthy();
});

test('нечитаемый цвет живёт в списке как любой другой, без укоров', async () => {
  // Жёлтая заливка — ровно тот случай, ради которого свободный выбор цвета
  // когда-то и не заводили. Приложение про него молчит: что получилось,
  // человек видит в образце, а букву на заливке оно подобрало само.
  useAppStore.setState({ themeColors: { light: { 'shift.day.surface': '#FFE066' }, dark: {} } });
  const view = await renderScreen();
  await openGroup(view, 'Цвета смен');

  expect(view.getByLabelText('Синий, #FFE066 · свой цвет')).toBeTruthy();
  expect(view.queryByText(/контраст/i)).toBeNull();
});

test('сброс возвращает цвета приложения', async () => {
  useAppStore.setState({
    themeColors: { light: { accent: '#7C2D12' }, dark: { background: '#000000' } },
  });
  const view = await renderScreen();

  await act(async () => {
    fireEvent.press(view.getByText('Сбросить светлую тему'));
  });

  expect(useAppStore.getState().themeColors).toEqual({
    light: {},
    dark: { background: '#000000' },
  });

  await act(async () => {
    fireEvent.press(view.getByText('Сбросить обе темы'));
  });

  expect(useAppStore.getState().themeColors).toEqual({ light: {}, dark: {} });
});

test('тёмная тема правится из светлой', async () => {
  const view = await renderScreen();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Тёмная'));
  });

  expect(
    view.getByText(
      'Сейчас на экране другая тема. Образец ниже показывает, что получится в выбранной.',
    ),
  ).toBeTruthy();

  await openGroup(view, 'Основа');
  await act(async () => {
    fireEvent.press(view.getByLabelText(/^Фон,/));
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/settings/theme-color',
    params: { slot: 'background', scheme: 'dark' },
  });
});
