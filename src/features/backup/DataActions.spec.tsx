import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { DataActions } from './DataActions.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Кнопки в карточке «Данные».
 *
 * Кнопки здесь без подписей, поэтому и ищутся они по доступному имени: если
 * оно потеряется, значок останется молчащим квадратом для скринридера.
 *
 * Проверяется то, что ломается молча: один значок «Загрузить из файла»
 * обслуживает и резервную копию, и присланный график, и по чужому файлу он
 * обязан сказать словами, что не так, а не промолчать.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

const mockPick = jest.fn();
const mockShare = jest.fn();
const mockSave = jest.fn();
jest.mock('./files.ts', () => ({
  pickTextFile: (...args: unknown[]) => mockPick(...args),
  shareTextFile: (...args: unknown[]) => mockShare(...args),
  saveTextFile: (...args: unknown[]) => mockSave(...args),
  shareExistingFile: jest.fn(),
}));

// Системное окно подтверждения перехватывается шпионом, а не подменой модуля:
// jest-expo подставляет свой react-native, и подмена файла до него не доходит.
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

function renderActions() {
  return render(
    <ThemeProvider>
      <DataActions />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockPush.mockClear();
  mockPick.mockReset();
  mockShare.mockReset();
  mockSave.mockReset();
  mockAlert.mockClear();
});

test('«Сохранить копию» пишет файл на телефон, а не открывает «Поделиться»', async () => {
  mockSave.mockResolvedValue('saved');
  const view = await renderActions();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Сохранить копию'));
  });

  expect(mockSave).toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
  const [fileName, text, mime] = mockSave.mock.calls[0] as [string, string, string];
  expect(fileName).toMatch(/^smeny-kopiya-\d{4}-\d{2}-\d{2}\.json$/);
  expect(mime).toBe('application/json');
  expect(JSON.parse(text).format).toBe('jobdatepicker-backup');
  // Сказать, что файл записан, обязательно: проводник закрывается молча.
  expect(view.getByText(/Копия сохранена файлом/)).toBeTruthy();
});

test('закрытый проводник ошибкой не считается', async () => {
  mockSave.mockResolvedValue('canceled');
  const view = await renderActions();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Сохранить копию'));
  });

  expect(view.queryByText(/Не получилось/)).toBeNull();
  expect(view.queryByText(/Копия сохранена/)).toBeNull();
});

test('«Отправить копию» отдаёт тот же файл системному листу', async () => {
  mockShare.mockResolvedValue(true);
  const view = await renderActions();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Отправить копию'));
  });

  expect(mockShare).toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
  const [fileName, text, mime] = mockShare.mock.calls[0] as [string, string, string];
  expect(fileName).toMatch(/^smeny-kopiya-\d{4}-\d{2}-\d{2}\.json$/);
  expect(mime).toBe('application/json');
  expect(JSON.parse(text).format).toBe('jobdatepicker-backup');
});

test('присланный график открывает предпросмотр, а не заменяет данные молча', async () => {
  mockPick.mockResolvedValue({
    name: 'grafik.json',
    text: JSON.stringify({ format: 'jobdatepicker-track', v: 1, name: 'Аня', d: 'AQID' }),
  });
  const view = await renderActions();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Загрузить из файла'));
  });

  expect(mockPush).toHaveBeenCalledWith({ pathname: '/track', params: { d: 'AQID' } });
  expect(mockAlert).not.toHaveBeenCalled();
});

test('резервная копия спрашивает подтверждение до замены', async () => {
  const backup = {
    format: 'jobdatepicker-backup',
    schema: 1,
    createdAt: '2026-03-14T21:30:00.000Z',
    state: { tracks: [], payments: [], alarms: [] },
  };
  mockPick.mockResolvedValue({ name: 'kopiya.json', text: JSON.stringify(backup) });
  const view = await renderActions();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Загрузить из файла'));
  });

  expect(mockAlert).toHaveBeenCalled();
  const [title, message] = mockAlert.mock.calls[0] as [string, string];
  expect(title).toContain('Заменить все данные');
  // Что именно заменят — числами, до нажатия.
  expect(message).toContain('графиков 0');
  expect(message).toContain('Отменить это нельзя');
});

test('чужой файл объясняется словами, а не тишиной', async () => {
  mockPick.mockResolvedValue({ name: 'photo.json', text: '{"что-то":"чужое"}' });
  const view = await renderActions();

  await act(async () => {
    fireEvent.press(view.getByLabelText('Загрузить из файла'));
  });

  expect(view.getByText(/Файл сделан не этим приложением/)).toBeTruthy();
  expect(mockAlert).not.toHaveBeenCalled();
});
