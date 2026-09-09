import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeList } from './ThemeList.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider, darkPalette, lightPalette } from '@/theme';

/**
 * Список тем в настройках.
 *
 * Проверяется то, ради чего он написан: свои темы стоят в одном списке со
 * встроенными, выбираются тем же нажатием и правятся кнопкой рядом — не
 * переключая при этом оформление.
 */

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

function renderList() {
  return render(
    <ThemeProvider>
      <ThemeList />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockPush.mockClear();
});

test('своя тема стоит в общем списке со встроенными', async () => {
  useAppStore.getState().addTheme('Ночная смена', darkPalette);
  const view = await renderList();

  expect(view.getByLabelText('Как в системе')).toBeTruthy();
  expect(view.getByLabelText('Светлая')).toBeTruthy();
  expect(view.getByLabelText('Тёмная')).toBeTruthy();
  expect(view.getByLabelText('Ночная смена')).toBeTruthy();
});

test('выбор своей темы переключает оформление', async () => {
  const id = useAppStore.getState().addTheme('Ночная смена', darkPalette);
  const view = await renderList();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Ночная смена'));
  });

  expect(useAppStore.getState().appearance).toBe(`custom:${id}`);
  expect(view.getByLabelText('Ночная смена').props.accessibilityState.selected).toBe(true);
});

test('правка темы её не включает', async () => {
  const id = useAppStore.getState().addTheme('Ночная смена', darkPalette);
  const view = await renderList();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Изменить тему «Ночная смена»'));
  });

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/settings/theme', params: { theme: id } });
  expect(useAppStore.getState().appearance).toBe('system');
});

test('встроенную тему править нечем', async () => {
  const view = await renderList();

  expect(view.queryByLabelText(/^Изменить тему/)).toBeNull();
  expect(view.getByText('Создать тему')).toBeTruthy();
});

test('создание заводит тему сразу и открывает её на цветах', async () => {
  const view = await renderList();

  await act(async () => {
    fireEvent.press(view.getByText('Создать тему'));
  });

  const created = useAppStore.getState().themes.at(-1);
  expect(created?.name).toBe('Своя тема');
  // Снята с той темы, что показана: в тестах это светлая.
  expect(created?.colors.background).toBe(lightPalette.background);
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/settings/theme',
    params: { theme: created?.id },
  });
});
