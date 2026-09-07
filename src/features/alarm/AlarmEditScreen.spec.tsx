import { act, fireEvent, render } from '@testing-library/react-native';
import { AlarmEditScreen } from './AlarmEditScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import type { Alarm } from '@/domain/alarm.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { ThemeProvider } from '@/theme';

/**
 * Сколько времён подъёма спрашивает будильник «по графику».
 *
 * Вопрос у него один — во сколько вставать, — поэтому считаются не типы смен,
 * а время их начала. На 5/2 с сокращённой пятницей обе смены начинаются в
 * девять: подъём один, и общего времени будильника хватает. Там, где день
 * чередуется с ночью, времени два.
 */

// Приставка mock — единственный способ дать фабрике jest.mock доступ к внешней
// переменной: остальное она запрещает как неинициализированное.
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'a1' }),
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function trackWith(presetId: string): ScheduleTrack {
  const preset = SCHEDULE_PRESETS.find((item) => item.id === presetId)!;
  return {
    id: 't1',
    name: 'Основная',
    own: true,
    schedules: [
      { presetId, pattern: preset.pattern, anchorDate: '2026-01-01', startsOn: '2026-01-01' },
    ],
    overrides: {},
    payrollRules: DEFAULT_PAYMENT_RULES,
  };
}

const alarm: Alarm = {
  id: 'a1',
  label: 'На смену',
  time: '07:00',
  enabled: true,
  repeat: { kind: 'schedule', tracks: [{ trackId: 't1', times: {} }] },
  soundUri: null,
  vibrate: true,
  snoozeMinutes: 0,
};

function renderFor(presetId: string) {
  useAppStore.setState({
    ...INITIAL_STATE,
    tracks: [trackWith(presetId)],
    activeTrackId: 't1',
    alarms: [alarm],
  });
  return render(
    <ThemeProvider>
      <AlarmEditScreen />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockBack.mockClear();
});

test('5/2 с сокращённой пятницей: одно время на весь график', async () => {
  const view = await renderFor('5-2-short-friday');

  expect(view.getByText('Время')).toBeTruthy();
  // Сокращённая пятница начинается тогда же, когда обычный день, — отдельного
  // поля у неё быть не должно.
  expect(view.queryByText(/Сокращённый день/)).toBeNull();
  expect(view.queryByText(/Рабочий день/)).toBeNull();
  expect(view.queryByText(/чередуются дневные и ночные/)).toBeNull();
});

test('5/2: в хранилище не уезжает ни одного времени по сменам', async () => {
  const view = await renderFor('5-2-short-friday');

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  const saved = useAppStore.getState().alarms[0];
  expect(saved.repeat.kind === 'schedule' && saved.repeat.tracks[0].times).toEqual({});
});

test('день с ночью: два поля времени, по одному на начало смены', async () => {
  const view = await renderFor('dnso');

  expect(view.getByText('Дневная смена')).toBeTruthy();
  expect(view.getByText('Ночная смена')).toBeTruthy();
  // Отсыпной — не смена: вставать по нему некуда.
  expect(view.queryByText('Отсыпной')).toBeNull();
});

test('день с ночью: сохраняются оба подъёма, по часу до начала', async () => {
  const view = await renderFor('dnso');

  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  const saved = useAppStore.getState().alarms[0];
  expect(saved.repeat.kind === 'schedule' && saved.repeat.tracks[0].times).toEqual({
    day12: '07:00',
    night12: '19:00',
  });
});
