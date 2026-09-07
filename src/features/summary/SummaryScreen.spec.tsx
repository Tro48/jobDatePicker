import { act, render, screen } from '@testing-library/react-native';
import { SummaryScreen } from './SummaryScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { ThemeProvider } from '@/theme';

/**
 * Чью работу считает сводка.
 *
 * График близкого человека заводят ради общих выходных: его смены видны в
 * календаре, а часы и деньги приложение по нему не знает — ни ставки, ни
 * выплат. Поэтому вкладка с чужим календарём сводку не переключает, и в самой
 * сводке такой вкладки нет.
 */

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = () => {};
jest.mock('@/navigation/useGuardedPush.ts', () => ({ useGuardedPush: () => mockPush }));

/**
 * Дорожка на встроенном графике. Отсчёт от 2020 года: сводка считает открытый
 * месяц, а он в тестах всегда сегодняшний — до первой смены графика числа были
 * бы пустыми в любом месяце.
 */
function trackOf(id: string, name: string, own: boolean, presetId: string): ScheduleTrack {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Нет пресета ${presetId}`);

  return {
    id,
    name,
    own,
    schedules: [
      { presetId, pattern: preset.pattern, anchorDate: '2020-01-01', startsOn: '2020-01-01' },
    ],
    overrides: {},
    payrollRules: DEFAULT_PAYMENT_RULES,
  };
}

function setTracks(tracks: ScheduleTrack[], activeTrackId: string) {
  useAppStore.setState({ ...INITIAL_STATE, tracks, activeTrackId });
}

async function renderScreen() {
  const view = await render(
    <ThemeProvider>
      <SummaryScreen />
    </ThemeProvider>,
  );
  // Соседние месяцы пейджер дорисовывает следующим кадром.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return view;
}

test('открыт чужой календарь, а сводка всё равно считает свою работу', async () => {
  setTracks(
    [trackOf('a', 'Основная', true, '2-2-day'), trackOf('b', 'Аня', false, '2-2-night')],
    'b',
  );

  await renderScreen();

  expect(screen.getByText('Дневная смена')).toBeTruthy();
  expect(screen.queryByText('Ночная смена')).toBeNull();
});

test('чужого графика нет во вкладках сводки', async () => {
  setTracks(
    [
      trackOf('a', 'Основная', true, '2-2-day'),
      trackOf('b', 'Склад', true, '5-2'),
      trackOf('c', 'Аня', false, '2-2-night'),
    ],
    'a',
  );

  await renderScreen();

  expect(screen.getByLabelText('Основная')).toBeTruthy();
  expect(screen.getByLabelText('Склад')).toBeTruthy();
  expect(screen.queryByLabelText('Аня')).toBeNull();
});

test('своих графиков нет — вместо чисел объяснение, почему', async () => {
  setTracks([trackOf('b', 'Аня', false, '2-2-night')], 'b');

  await renderScreen();

  expect(screen.getByText('Только по своим графикам')).toBeTruthy();
  expect(screen.queryByText('Ночная смена')).toBeNull();
});
