import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CalendarScreen } from './CalendarScreen.tsx';
import { AlarmSyncProvider } from '@/features/alarm/AlarmSyncProvider.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { ThemeProvider } from '@/theme';

/**
 * Цена перерисовки календаря.
 *
 * Клеток на экране больше сорока, а в памяти пейджера — три месяца сразу.
 * Ячейку списка VirtualizedList рисует через PureComponent, и любой колбэк,
 * пересозданный в родителе, перерисовывает все страницы разом. Один такой
 * inline-колбэк стоил экрану полной перерисовки сетки на каждое движение —
 * на листание месяца и на любое постороннее изменение состояния.
 *
 * Считаются рендеры самой клетки: это единственное число, по которому видно
 * разницу, и единственное, которое не даст вернуть колбэк обратно незаметно.
 */

const renders = { day: 0 };

jest.mock('./DayCell.tsx', () => {
  const react = jest.requireActual('react');
  const actual = jest.requireActual('./DayCell.tsx');
  return {
    DayCell: react.memo((props: never) => {
      renders.day += 1;
      return react.createElement(actual.DayCell, props);
    }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Переход стабилен и в приложении: useGuardedPush держит его в useCallback.
const mockPush = () => {};
jest.mock('@/navigation/useGuardedPush.ts', () => ({ useGuardedPush: () => mockPush }));

function trackOf(id: string, name: string): ScheduleTrack {
  return {
    id,
    name,
    own: true,
    schedule: {
      presetId: '2-2-day',
      pattern: SCHEDULE_PRESETS[0].pattern,
      anchorDate: '2026-09-01',
    },
    overrides: {},
    payrollRules: DEFAULT_PAYMENT_RULES,
  };
}

beforeEach(() => {
  useAppStore.setState({
    ...INITIAL_STATE,
    tracks: [trackOf('a', 'Основная'), trackOf('b', 'Склад')],
    activeTrackId: 'a',
  });
  renders.day = 0;
});

/**
 * Экран открывается и прогревается: соседние месяцы пейджер дорисовывает
 * следующим кадром, уже после того, как показан открытый. Считать рендеры
 * раньше этого момента бессмысленно — в приложении к первому нажатию прогрев
 * давно позади.
 */
async function renderScreen() {
  await render(
    <ThemeProvider>
      <AlarmSyncProvider>
        <CalendarScreen />
      </AlarmSyncProvider>
    </ThemeProvider>,
  );
  await settle();
  renders.day = 0;
}

/** Даёт отработать кадру и переходу, которыми пейджер догоняет соседние месяцы. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

test('листание месяца не перерисовывает уже нарисованные клетки', async () => {
  await renderScreen();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Следующий месяц'));
  });
  await settle();

  expect(renders.day).toBe(0);
});

test('постороннее изменение состояния не перерисовывает клетки', async () => {
  await renderScreen();

  await act(async () => {
    useAppStore.getState().setSharedDaysOff({ enabled: true });
  });
  await settle();

  expect(renders.day).toBe(0);
});

test('смена графика перерисовывает клетки: дни в них другие', async () => {
  await renderScreen();

  await act(async () => {
    useAppStore.getState().setActiveTrack('b');
  });
  await settle();

  expect(renders.day).toBeGreaterThan(0);
});
