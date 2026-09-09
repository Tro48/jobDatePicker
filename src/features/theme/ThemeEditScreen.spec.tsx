import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeEditScreen } from './ThemeEditScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider, lightPalette } from '@/theme';

/**
 * Редактор своей темы.
 *
 * Проверяется то, ради чего экран написан: тема открывается сразу на своих
 * цветах, правится по одному, переименовывается и удаляется — и всё это на
 * одном экране, без блуждания по вкладкам.
 */

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: { theme?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderScreen(theme?: string) {
  mockParams = theme === undefined ? {} : { theme };
  return render(
    <ThemeProvider>
      <ThemeEditScreen />
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
  mockBack.mockClear();
  mockPush.mockClear();
  mockReplace.mockClear();
});

test('экран открывается сразу на цветах, а не на пустой форме', async () => {
  // Тему завёл список, поэтому здесь она уже настоящая: копия того, что и так
  // есть, без цветов ничего не объясняла бы.
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  const view = await renderScreen(id);

  expect(view.getByLabelText('Основа: 6 цветов')).toBeTruthy();
  expect(view.getByLabelText('Имя темы')).toBeTruthy();
  // Основу не спрашивают: тема снята с той, что показана.
  expect(view.queryByLabelText('С какой темы снять цвета')).toBeNull();
});

test('цвета смен в теме не правятся: они у самой смены', async () => {
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  const view = await renderScreen(id);

  expect(view.queryByLabelText(/^Цвета смен: /)).toBeNull();
  expect(view.getByText(/Смены красятся в своём справочнике/)).toBeTruthy();
});

test('темы нет — экран её не выдумывает', async () => {
  const view = await renderScreen('нет-такой');
  expect(view.getByText('Этой темы больше нет.')).toBeTruthy();
});

test('разделы свёрнуты, а раскрытый ведёт к правке цвета', async () => {
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  const view = await renderScreen(id);

  expect(view.getByLabelText('Особые дни: 2 цветов')).toBeTruthy();
  expect(view.queryByLabelText(/^Акцент,/)).toBeNull();

  await openGroup(view, 'Акценты и состояния');
  await act(async () => {
    fireEvent.press(view.getByLabelText(/^Акцент,/));
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/settings/theme-color',
    params: { theme: id, slot: 'accent' },
  });
});

test('открыт один раздел за раз: иначе это та же стена', async () => {
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  const view = await renderScreen(id);

  await openGroup(view, 'Основа');
  expect(view.getByLabelText(/^Фон,/)).toBeTruthy();

  await openGroup(view, 'Особые дни');
  expect(view.queryByLabelText(/^Фон,/)).toBeNull();
  expect(view.getByLabelText(/^Общий выходной,/)).toBeTruthy();
});

test('имя правится и сохраняется по уходу из поля', async () => {
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  const view = await renderScreen(id);

  const field = view.getByLabelText('Имя темы');
  await act(async () => {
    fireEvent.changeText(field, 'Летняя');
  });
  await act(async () => {
    fireEvent(field, 'blur');
  });

  expect(useAppStore.getState().themes[0].name).toBe('Летняя');
});

test('тема удаляется, и экран закрывается', async () => {
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  useAppStore.getState().setAppearance(`custom:${id}`);
  const view = await renderScreen(id);

  await act(async () => {
    fireEvent.press(view.getByText('Удалить тему'));
  });

  expect(useAppStore.getState().themes).toHaveLength(0);
  expect(useAppStore.getState().appearance).toBe('system');
  expect(mockBack).toHaveBeenCalled();
});

test('чужую тему можно включить с её же экрана', async () => {
  const id = useAppStore.getState().addTheme('Своя', lightPalette);
  const view = await renderScreen(id);

  expect(useAppStore.getState().appearance).toBe('system');
  await act(async () => {
    fireEvent.press(view.getByText('Показывать эту тему'));
  });

  expect(useAppStore.getState().appearance).toBe(`custom:${id}`);
  // Показанную включать больше нечем: кнопки нет.
  expect(view.queryByText('Показывать эту тему')).toBeNull();
});
