import { fireEvent, render } from '@testing-library/react-native';
import { TrackTabs } from './TrackTabs.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import { ThemeProvider } from '@/theme';

/**
 * Вкладки графиков: что они говорят скринридеру и переключают ли они взгляд.
 *
 * Выбранная вкладка обязана отличаться не только цветом — это проверяется
 * через accessibilityState, по которому TalkBack и произносит «выбрано».
 */

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

const tracks = [trackOf('a', 'Основная'), trackOf('b', 'Склад')];

beforeEach(() => {
  useAppStore.setState({ ...INITIAL_STATE, tracks, activeTrackId: 'a' });
});

/**
 * Вкладки всегда рисуются в теме: без неё компонент не знает ни цветов, ни
 * отступов. render здесь ждут: под React 19 он возвращает обещание, и без
 * await из него не достать ни одного запроса.
 */
function renderTabs(props: Partial<React.ComponentProps<typeof TrackTabs>> = {}) {
  return render(
    <ThemeProvider>
      <TrackTabs tracks={tracks} activeTrackId="a" {...props} />
    </ThemeProvider>,
  );
}

test('активная вкладка помечена состоянием, а не одним цветом', async () => {
  const view = await renderTabs();

  expect(view.getByLabelText('Основная')).toBeSelected();
  expect(view.getByLabelText('Склад')).not.toBeSelected();
});

test('вкладки объявлены рядом вкладок, а не набором кнопок', async () => {
  const view = await renderTabs();

  expect(view.getByLabelText('Графики').props.accessibilityRole).toBe('tablist');
  expect(view.getByLabelText('Склад').props.accessibilityRole).toBe('tab');
});

test('нажатие переводит взгляд на другой график', async () => {
  const view = await renderTabs();

  fireEvent.press(view.getByLabelText('Склад'));

  expect(useAppStore.getState().activeTrackId).toBe('b');
});

test('с одним графиком вкладок нет, а завести второй всё равно можно', async () => {
  const onAdd = jest.fn();
  const view = await renderTabs({ tracks: [tracks[0]], onAdd });

  // Переключать нечего, и имя единственной работы человек не выбирал.
  expect(view.queryByLabelText('Основная')).toBeNull();

  fireEvent.press(view.getByLabelText('Добавить график'));
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test('кнопка «плюс» не выдаёт себя за вкладку', async () => {
  const view = await renderTabs({ onAdd: () => {} });

  expect(view.getByLabelText('Добавить график').props.accessibilityRole).toBe('button');
});

test('без обработчика кнопки «плюс» нет вовсе', async () => {
  const view = await renderTabs();

  expect(view.queryByLabelText('Добавить график')).toBeNull();
});

test('правки графика в ряду переключателей нет: она внизу страницы', async () => {
  const view = await renderTabs({ onAdd: () => {} });

  expect(view.queryByLabelText('Изменить график')).toBeNull();
});
