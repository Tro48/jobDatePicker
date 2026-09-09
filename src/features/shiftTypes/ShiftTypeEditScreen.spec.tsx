import { act, fireEvent, render } from '@testing-library/react-native';
import { ShiftTypeEditScreen } from './ShiftTypeEditScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import { ThemeProvider } from '@/theme';

/**
 * Редактор смены.
 *
 * Проверяется то, ради чего он и написан: заведённая смена доезжает до
 * хранилища целиком, встроенная не теряет вид, а удаление не уносит смену, на
 * которой стоит чей-то график.
 */

// Приставка mock — единственный способ дать фабрике jest.mock доступ к
// внешней переменной: остальное она запрещает как неинициализированное.
const mockBack = jest.fn();
let mockParams: { type?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * Экран всегда рисуется в теме: без неё он не знает ни цветов, ни отступов.
 * render здесь ждут — под React 19 он возвращает обещание, и без await из него
 * не достать ни одного запроса.
 */
function renderScreen(type?: string) {
  mockParams = type === undefined ? {} : { type };
  return render(
    <ThemeProvider>
      <ShiftTypeEditScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockBack.mockClear();
});

test('новая смена доезжает до справочника вместе с названием и буквой', async () => {
  const view = await renderScreen('new');

  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Название смены'), 'Вечерняя смена');
  });
  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Буква в календаре'), 'Веч');
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить смену'));
  });

  const added = useAppStore.getState().shiftTypes.at(-1);
  expect(added?.name).toBe('Вечерняя смена');
  expect(added?.badge).toBe('Веч');
  expect(added?.builtinId).toBeNull();
  expect(mockBack).toHaveBeenCalled();
});

test('смена без названия не сохраняется: в списке её было бы не отличить', async () => {
  const view = await renderScreen('new');
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить смену'));
  });

  expect(useAppStore.getState().shiftTypes).toHaveLength(INITIAL_STATE.shiftTypes.length);
  expect(mockBack).not.toHaveBeenCalled();
});

test('у встроенной смены правится название, а вид не спрашивают', async () => {
  const view = await renderScreen('night12');

  // Переключателя вида нет вовсе: на «Выходном» стоят все готовые графики.
  expect(view.queryByLabelText('Вид смены')).toBeNull();

  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Название смены'), 'Ночь на складе');
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить смену'));
  });

  const night = useAppStore.getState().shiftTypes.find((type) => type.id === 'night12');
  expect(night?.name).toBe('Ночь на складе');
  expect(night?.kind).toBe('work');
});

test('встроенную смену удалять нечем', async () => {
  const view = await renderScreen('off');

  expect(view.queryByText('Удалить смену')).toBeNull();
});

test('своя смена удаляется, и справочник становится короче', async () => {
  const id = useAppStore.getState().addShiftType({
    name: 'Учёба',
    badge: 'У',
    kind: 'rest',
    colorToken: 'shift.sleep',
    rateMultiplier: 0,
  });

  const view = await renderScreen(id);
  await act(async () => {
    fireEvent.press(view.getByText('Удалить смену'));
  });

  expect(useAppStore.getState().shiftTypes.some((type) => type.id === id)).toBe(false);
  expect(mockBack).toHaveBeenCalled();
});

test('смену, на которой стоит график, удалить не дают и объясняют почему', async () => {
  const id = useAppStore.getState().addShiftType({
    name: 'Вечерняя',
    badge: 'Веч',
    kind: 'work',
    colorToken: 'shift.extra',
    time: { start: '16:00', end: '00:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  });

  useAppStore.setState({
    tracks: [
      {
        id: 'main',
        name: 'Основная',
        own: true,
        schedules: [
          {
            presetId: 'custom',
            pattern: { kind: 'cycle', slots: [id, 'off'] },
            anchorDate: '2026-09-01',
            startsOn: '2026-09-01',
          },
        ],
        overrides: {},
        payrollRules: DEFAULT_PAYMENT_RULES,
      },
    ],
  });

  const view = await renderScreen(id);
  await act(async () => {
    fireEvent.press(view.getByText('Удалить смену'));
  });

  expect(useAppStore.getState().shiftTypes.some((type) => type.id === id)).toBe(true);
  // Молча не сработавшая кнопка — худший из вариантов: причина названа текстом.
  expect(view.getByText(/Эту смену не удалить/)).toBeTruthy();
});

test('смене задаётся свой цвет, и он не зависит от темы', async () => {
  const view = await renderScreen('day12');

  await act(async () => {
    fireEvent.press(view.getByLabelText('Задать свой цвет'));
  });

  // Квадрат оттенка появился прямо здесь, без перехода на другой экран.
  const field = view.getByLabelText('Код цвета');
  await act(async () => {
    fireEvent.changeText(field, '#123456');
  });
  await act(async () => {
    fireEvent(field, 'blur');
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить смену'));
  });

  const saved = useAppStore.getState().shiftTypes.find((type) => type.id === 'day12');
  expect(saved?.color).toBe('#123456');
  // Оттенок палитры при этом остаётся записанным: по нему смена вернётся к
  // теме, если свой цвет снимут.
  expect(saved?.colorToken).toBe('shift.day');
});

test('свой цвет снимается, и смена снова красится темой', async () => {
  useAppStore.getState().updateShiftType('day12', { color: '#123456' });
  const view = await renderScreen('day12');

  await act(async () => {
    fireEvent.press(view.getByText('Вернуть оттенок темы'));
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить смену'));
  });

  expect(
    useAppStore.getState().shiftTypes.find((type) => type.id === 'day12')?.color,
  ).toBeUndefined();
});
