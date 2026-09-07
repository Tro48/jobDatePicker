import { act, fireEvent, render } from '@testing-library/react-native';
import { SchedulePickerScreen } from './SchedulePickerScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Смена графика с даты.
 *
 * Проверяется ловушка, из-за которой день перед началом нового графика молча
 * остаётся прежней работе рабочей сменой: в сводке это всплывает недоработкой,
 * а на экране до правки не было видно ничего.
 */

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ period: 'new' }),
}));

jest.mock('@/navigation/useGuardedPush.ts', () => ({ useGuardedPush: () => jest.fn() }));

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
  // Пятидневка с января: понедельник и вторник — рабочие дни по 8 часов.
  const id = useAppStore.getState().addTrack({
    name: 'Основная',
    own: true,
    presetId: '5-2',
    anchorDate: '2026-01-05',
  });
  useAppStore.setState({ activeTrackId: id });
});

/**
 * Клетка календаря ищется по запятой после даты: строка «как ляжет» начинается
 * с того же дня, и без запятой запрос находил их обе — в дни, когда раскладка
 * стартовала с сегодняшнего числа, тест падал на ровном месте.
 */
test('день перед началом нового графика назван прямо, с часами', async () => {
  const view = await renderPicker();

  // 2 сентября 2026 — среда; накануне, во вторник, пятидневка ставит смену.
  await act(async () => {
    fireEvent.press(view.getByText(/Действует с:/));
  });
  await act(async () => {
    fireEvent.press(view.getByLabelText(/^2 сентября,/));
  });

  // Прямым текстом: какой день, какой график и сколько часов он принесёт.
  // Прямым текстом: какой день и какому графику он достанется.
  expect(view.getByText(/остаются на графике/)).toBeTruthy();

  // Считается вся серия: перед средой пятидневка ставит смены и в понедельник,
  // и во вторник, поэтому кнопка уводит к 31 августа, а не к 1 сентября.
  await act(async () => {
    fireEvent.press(view.getByText('Начать с 31 августа'));
  });

  expect(view.getByText('Действует с: 31 августа')).toBeTruthy();
  // Перед 31 августа воскресенье — предупреждать больше не о чем.
  expect(view.queryByText(/остаются на графике/)).toBeNull();
  expect(view.queryByText(/останется на графике/)).toBeNull();
});

test('выходной перед началом не поднимает шума', async () => {
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByText(/Действует с:/));
  });
  // 7 сентября — понедельник; накануне воскресенье, у пятидневки выходной.
  await act(async () => {
    fireEvent.press(view.getByLabelText(/^7 сентября,/));
  });

  expect(view.queryByText(/останется на графике/)).toBeNull();
});
