import { act, fireEvent, render } from '@testing-library/react-native';
import { ColorEditScreen } from './ColorEditScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider, buildTheme, contrastRatio, lightPalette } from '@/theme';

/**
 * Правка одного цвета.
 *
 * Проверяется то, ради чего экран написан: набранный цвет доезжает до
 * хранилища одной кнопкой, ползунок под пальцем в хранилище не пишет, а
 * неудачный цвет получает разбор с числами и всё равно сохраняется.
 */

const mockBack = jest.fn();
let mockParams: { slot?: string; scheme?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderScreen(slot: string, scheme = 'light') {
  mockParams = { slot, scheme };
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

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockBack.mockClear();
});

test('экран открывается на нынешнем цвете этого слота', async () => {
  const view = await renderScreen('accent');

  expect(view.getByLabelText('Код цвета').props.value).toBe(lightPalette.accent);
});

test('набранный цвет уезжает в хранилище одной кнопкой', async () => {
  const view = await renderScreen('accent');
  await type(view, '#7C2D12');

  // До нажатия в хранилище ничего нет: ползунок под пальцем не должен
  // перекрашивать приложение на каждое движение.
  expect(useAppStore.getState().themeColors.light).toEqual({});

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(useAppStore.getState().themeColors.light).toEqual({ accent: '#7C2D12' });
  expect(mockBack).toHaveBeenCalled();
});

test('тёмная тема правится отдельно от светлой', async () => {
  const view = await renderScreen('background', 'dark');
  await type(view, '#101010');

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(useAppStore.getState().themeColors).toEqual({
    light: {},
    dark: { background: '#101010' },
  });
});

test('нечитаемый цвет сохраняется молча: экран не спорит с человеком', async () => {
  const view = await renderScreen('shift.day.surface');
  await type(view, '#FFF9E0');

  expect(view.queryByText(/контраст/i)).toBeNull();

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(useAppStore.getState().themeColors.light).toEqual({ 'shift.day.surface': '#FFF9E0' });
});

test('цвет буквы на заливке не спрашивают: его считают', async () => {
  const view = await renderScreen('shift.day.surface');

  // Отдельного цвета буквы в оформлении больше нет: править на экране нечего,
  // про него только сказано в пояснении.
  expect(view.queryByLabelText(/буква/i)).toBeNull();
  expect(
    view.getByText(
      'Чем залита клетка календаря у смен этого оттенка. Буква-маркер поверх заливки подбирается сама.',
    ),
  ).toBeTruthy();

  await type(view, '#101820');
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  // На тёмной заливке буква стала светлой сама: в хранилище при этом лежит
  // только заливка.
  expect(useAppStore.getState().themeColors.light).toEqual({ 'shift.day.surface': '#101820' });
  const pair = buildTheme('light', useAppStore.getState().themeColors.light).colors.shifts[
    'shift.day'
  ];
  expect(contrastRatio(pair.on, pair.surface)).toBeGreaterThanOrEqual(4.5);
});

test('образец показывает цвет до сохранения', async () => {
  const view = await renderScreen('background');
  await type(view, '#123456');

  // Образец рисуется черновиком, а не тем, что лежит в хранилище: иначе
  // смотреть на него до нажатия «Сохранить» было бы бессмысленно.
  expect(backgroundColors(view.toJSON())).toContain('#123456');
  expect(useAppStore.getState().themeColors.light).toEqual({});
});

test('в образце есть сетка месяца, а не одни плашки', async () => {
  const view = await renderScreen('shift.day.surface');
  const preview = view.getByLabelText(
    'Образец: сетка месяца, карточка с текстом и кнопки в выбранных цветах',
  );

  expect(preview).toBeTruthy();

  // Дневная смена в образце стоит шесть раз: цикл «день — ночь — отсыпной —
  // выходной» на тридцати днях даёт восемь дневных, из которых два попадают в
  // уже отработанные и красятся приглушённой заливкой, а не этой.
  await type(view, '#123456');
  const painted = backgroundColors(view.toJSON()).filter((color) => color === '#123456');
  expect(painted).toHaveLength(6);
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

test('свой цвет возвращается к цвету приложения', async () => {
  useAppStore.setState({ themeColors: { light: { accent: '#7C2D12' }, dark: {} } });
  const view = await renderScreen('accent');

  expect(view.getByLabelText('Код цвета').props.value).toBe('#7C2D12');

  await act(async () => {
    fireEvent.press(view.getByText('Вернуть цвет приложения'));
  });

  expect(useAppStore.getState().themeColors.light).toEqual({});
  expect(mockBack).toHaveBeenCalled();
});

test('цвета, которого в оформлении нет, экран не выдумывает', async () => {
  const view = await renderScreen('shift.moon.surface');

  expect(view.getByText('Такого цвета в оформлении нет.')).toBeTruthy();
});
