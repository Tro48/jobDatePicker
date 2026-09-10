import { act, fireEvent, render } from '@testing-library/react-native';
import { decodeTrack, payloadFromFile } from '@/domain/share.ts';
import { SchedulePickerScreen } from './SchedulePickerScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Отдать график: два значка напротив заголовка «График».
 *
 * Проверяется то, что молча ломается при переносе кнопок в шапку: файл должен
 * уходить прямо отсюда, без промежуточного экрана, а с ним — только календарь.
 * Заметки и выплаты в файле означали бы, что чужому телефону уехала личная
 * переписка и суммы зарплат.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/navigation/useGuardedPush.ts', () => ({ useGuardedPush: () => mockPush }));

const mockShare = jest.fn();
jest.mock('@/features/backup/files.ts', () => ({
  shareTextFile: (...args: unknown[]) => mockShare(...args),
  saveTextFile: jest.fn(),
  pickTextFile: jest.fn(),
  shareExistingFile: jest.fn(),
}));

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

let trackId = '';

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockPush.mockClear();
  mockShare.mockReset();
  mockShare.mockResolvedValue(true);

  trackId = useAppStore.getState().addTrack({
    name: 'Основная',
    own: true,
    presetId: '5-2',
    anchorDate: '2026-01-05',
  });
  useAppStore.setState({ activeTrackId: trackId });
  // Заметка и выплата у этой работы есть: без них проверка «личное не уезжает»
  // ничего бы не проверяла.
  useAppStore.getState().addNote({ date: '2026-01-06', text: 'вышел за Сергея', remindAt: null });
  useAppStore.getState().addPayment({
    trackId,
    kind: 'salary',
    period: '2026-01',
    receivedOn: '2026-02-10',
    amount: 75_000,
  });
});

test('файл уходит прямо отсюда и несёт только график', async () => {
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Отправить график файлом'));
  });

  expect(mockShare).toHaveBeenCalled();
  const [fileName, text, mime] = mockShare.mock.calls[0] as [string, string, string];
  expect(fileName).toBe('grafik-основная.json');
  expect(mime).toBe('application/json');

  const payload = payloadFromFile(text);
  expect(payload).not.toBeNull();

  const sent = decodeTrack(payload as string);
  expect(sent.name).toBe('Основная');
  // Личного в файле нет ни в каком виде: ни выплат, ни заметки внутри правки.
  expect(sent.payments).toEqual([]);
  expect(sent.overrides.every((override) => override.note === undefined)).toBe(true);
  // Промежуточного экрана больше нет: лист открылся, никуда не уводя.
  expect(mockPush).not.toHaveBeenCalled();
});

test('второй значок уводит на экран с кодом', async () => {
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Показать QR-код графика'));
  });

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/settings/share',
    params: { track: trackId },
  });
  expect(mockShare).not.toHaveBeenCalled();
});

test('нечем поделиться — сказано словами, а не тишиной', async () => {
  mockShare.mockResolvedValue(false);
  const view = await renderPicker();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Отправить график файлом'));
  });

  expect(view.getByText(/нечем поделиться файлом/)).toBeTruthy();
});
