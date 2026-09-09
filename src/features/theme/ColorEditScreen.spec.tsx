import { act, fireEvent, render } from '@testing-library/react-native';
import { ColorEditScreen } from './ColorEditScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider, lightPalette } from '@/theme';

/**
 * Правка одного цвета темы.
 *
 * Проверяется то, ради чего экран написан: набранный цвет доезжает до темы
 * одной кнопкой, палец на квадрате оттенка в хранилище не пишет, а образец
 * показывает будущий цвет до сохранения.
 */

const mockBack = jest.fn();
let mockParams: { theme?: string; slot?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** Тема, которую правят в тесте. Возвращает её id. */
function seedTheme(): string {
  return useAppStore.getState().addTheme('Своя', lightPalette);
}

function renderScreen(theme: string, slot: string) {
  mockParams = { theme, slot };
  return render(
    <ThemeProvider>
      <ColorEditScreen />
    </ThemeProvider>,
  );
}

async function type(view: Awaited<ReturnType<typeof render>>, hex: string) {
  const field = view.getByLabelText('Код цвета');
  await act(async () => {
    fireEvent.changeText(field, hex);
  });
  await act(async () => {
    fireEvent(field, 'blur');
  });
}

/** Цвета темы после действия — свежие, а не из замыкания. */
function colorsOf(id: string) {
  const theme = useAppStore.getState().themes.find((item) => item.id === id);
  if (!theme) throw new Error('Тема пропала');
  return theme.colors;
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockBack.mockClear();
});

test('экран открывается на нынешнем цвете этого слота', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'accent');

  expect(view.getByLabelText('Код цвета').props.value).toBe(lightPalette.accent);
});

test('набранный цвет уезжает в тему одной кнопкой', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'accent');
  await type(view, '#7C2D12');

  // До нажатия тема не тронута: палец на квадрате оттенка не должен
  // перекрашивать приложение на каждое движение.
  expect(colorsOf(id).accent).toBe(lightPalette.accent);

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(colorsOf(id).accent).toBe('#7C2D12');
  expect(mockBack).toHaveBeenCalled();
});

test('нечитаемый цвет сохраняется молча: экран не спорит с человеком', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'highlight.surface');
  await type(view, '#FFF9E0');

  expect(view.queryByText(/контраст/i)).toBeNull();

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(colorsOf(id).highlight.surface).toBe('#FFF9E0');
});

test('цвет числа на заливке не спрашивают: его считают', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'highlight.surface');

  // Отдельного цвета подписи в теме нет: править на экране нечего, про него
  // только сказано в пояснении.
  expect(view.queryByLabelText(/буква/i)).toBeNull();

  await type(view, '#101820');
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  // На тёмной заливке подпись стала светлой сама.
  const pair = colorsOf(id).highlight;
  expect(pair.surface).toBe('#101820');
  expect(pair.on).not.toBe(lightPalette.highlight.on);
});

test('цвета смен в теме не правятся: они у самой смены', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'shift.day.surface');

  expect(view.getByText('Этот цвет больше не правится: темы или цвета нет.')).toBeTruthy();
});

test('образец показывает цвет до сохранения', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'background');
  await type(view, '#123456');

  expect(backgroundColors(view.toJSON())).toContain('#123456');
  expect(colorsOf(id).background).toBe(lightPalette.background);
});

test('в образце есть сетка месяца, а не одни плашки', async () => {
  const id = seedTheme();
  const view = await renderScreen(id, 'baseWeekday.surface');

  expect(
    view.getByLabelText('Образец: сетка месяца, карточка с текстом и кнопки в выбранных цветах'),
  ).toBeTruthy();

  // «День без графика» в образце стоит четыре раза: это хвост октября, до
  // которого график не дотянулся.
  await type(view, '#123456');
  const painted = backgroundColors(view.toJSON()).filter((color) => color === '#123456');
  expect(painted).toHaveLength(4);
});

test('темы или цвета нет — экран не выдумывает их', async () => {
  const id = seedTheme();

  const noSlot = await renderScreen(id, 'shift.moon.surface');
  expect(noSlot.getByText('Этот цвет больше не правится: темы или цвета нет.')).toBeTruthy();
  await noSlot.unmount();

  const noTheme = await renderScreen('нет-такой', 'accent');
  expect(noTheme.getByText('Этот цвет больше не правится: темы или цвета нет.')).toBeTruthy();
});

/** Все цвета заливки в отрисованном дереве: по ним видно, чем нарисован образец. */
function backgroundColors(tree: unknown): string[] {
  const found: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as { props?: { style?: unknown }; children?: unknown };
    // Стиль бывает и объектом, и массивом: Pressable складывает свой поверх
    // переданного.
    for (const style of [element.props?.style].flat()) {
      const fill = (style as { backgroundColor?: string } | undefined)?.backgroundColor;
      if (fill) found.push(fill);
    }
    walk(element.children);
  };

  walk(tree);
  return found;
}
