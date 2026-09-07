import { act, fireEvent, render } from '@testing-library/react-native';
import { DayNotesScreen } from './DayNotesScreen.tsx';
import { NoteEditScreen } from './NoteEditScreen.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Заметки дня: список и правка.
 *
 * Проверяется путь целиком — завёл, увидел в списке, поправил, удалил, — потому
 * что именно на нём заметка из формы превращается в запись хранилища, и
 * разойтись эти два представления могут незаметно.
 */

// Приставка mock — единственный способ дать фабрике jest.mock доступ к внешней
// переменной: остальное она запрещает как неинициализированное.
const mockBack = jest.fn();
const mockParams: { id?: string; date?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  useAppStore.setState({ ...INITIAL_STATE });
  mockParams.id = undefined;
  mockParams.date = '2026-09-10';
});

async function renderNotes() {
  return await render(
    <ThemeProvider>
      <DayNotesScreen />
    </ThemeProvider>,
  );
}

async function renderEditor(id: string) {
  mockParams.id = id;
  return await render(
    <ThemeProvider>
      <NoteEditScreen />
    </ThemeProvider>,
  );
}

/** Заводит заметку так же, как это делает экран правки. */
function addNote(text: string): string {
  const id = useAppStore.getState().addNote({ date: '2026-09-10', text, remindAt: null });
  if (id === null) throw new Error('заметка не завелась');
  return id;
}

test('заметка из формы доезжает до хранилища', async () => {
  const view = await renderEditor('new');

  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Текст заметки'), 'Забрать посылку');
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  const notes = useAppStore.getState().notes;
  expect(notes).toHaveLength(1);
  expect(notes[0].date).toBe('2026-09-10');
  expect(notes[0].remindAt).toBeNull();
  expect(mockBack).toHaveBeenCalled();
});

test('заведённая заметка видна в списке своего дня', async () => {
  addNote('Забрать посылку');
  addNote('Позвонить в отдел кадров');

  const list = await renderNotes();

  // Заметки ищутся по доступному имени строки: сам текст скрыт от озвучки —
  // строку целиком читает её кнопка, вместе с временем напоминания.
  expect(list.getByLabelText('Забрать посылку')).toBeTruthy();
  expect(list.getByLabelText('Позвонить в отдел кадров')).toBeTruthy();
});

test('заметка другого дня в этот список не попадает', async () => {
  useAppStore.getState().addNote({ date: '2026-09-11', text: 'чужой день', remindAt: null });

  const list = await renderNotes();

  expect(list.queryByLabelText('чужой день')).toBeNull();
});

test('пустая заметка не сохраняется: открывать в списке было бы нечего', async () => {
  const view = await renderEditor('new');

  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Текст заметки'), '   ');
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(useAppStore.getState().notes).toEqual([]);
  expect(mockBack).not.toHaveBeenCalled();
});

test('напоминание включается вместе с временем и уходит в заметку', async () => {
  const view = await renderEditor('new');

  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Текст заметки'), 'Позвонить в отдел кадров');
  });
  await act(async () => {
    fireEvent(view.getByLabelText('Напомнить в этот день'), 'valueChange', true);
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(useAppStore.getState().notes[0].remindAt).toBe('09:00');
});

test('заметка правится по своей записи, а не по дню', async () => {
  const id = addNote('первый вариант');
  addNote('вторая заметка того же дня');

  const view = await renderEditor(id);
  await act(async () => {
    fireEvent.changeText(view.getByLabelText('Текст заметки'), 'второй вариант');
  });
  await act(async () => {
    fireEvent.press(view.getByText('Сохранить'));
  });

  expect(useAppStore.getState().notes.map((note) => note.text)).toEqual([
    'второй вариант',
    'вторая заметка того же дня',
  ]);
});

test('заметка удаляется со своего экрана', async () => {
  const id = addNote('первый вариант');

  const view = await renderEditor(id);
  await act(async () => {
    fireEvent.press(view.getByText('Удалить заметку'));
  });

  expect(useAppStore.getState().notes).toEqual([]);
  expect(mockBack).toHaveBeenCalled();
});

test('день без заметок объясняет, зачем они, а не показывает пустоту', async () => {
  const view = await renderNotes();

  expect(view.getByText('Заметок нет')).toBeTruthy();
});
