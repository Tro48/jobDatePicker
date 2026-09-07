import { fireEvent, render } from '@testing-library/react-native';
import { MonthSwitcher } from './MonthSwitcher.tsx';
import { ThemeProvider } from '@/theme';

/**
 * Как со шапки попадают в другой месяц.
 *
 * Стрелки ходят по соседям, и до августа прошлого года ими идти тринадцать
 * нажатий. Название открывает окно, где месяц и год берут порознь, каждый своим
 * списком; проверяется, что наружу уходит именно собранный из них месяц и что
 * до нажатия «Открыть» экран никуда не двигается.
 *
 * Всё ищется по роли: «Сентябрь» при открытых списках есть и на поле, и в
 * самом списке, а нажатия ждут — fireEvent возвращает обещание, и без await
 * следующий тест рендерится пустым.
 */

async function renderSwitcher(period = '2026-09') {
  const onChange = jest.fn();
  const view = await render(
    <ThemeProvider>
      <MonthSwitcher period={period} onChange={onChange} />
    </ThemeProvider>,
  );
  return { view, onChange };
}

/** Выбрать значение в выпадающем списке: раскрыть поле и нажать строку. */
async function choose(
  view: Awaited<ReturnType<typeof renderSwitcher>>['view'],
  field: string,
  option: string,
) {
  await fireEvent.press(view.getByRole('button', { name: field }));
  await fireEvent.press(view.getByRole('radio', { name: option }));
}

test('стрелки двигают месяц на соседний', async () => {
  const { view, onChange } = await renderSwitcher();

  await fireEvent.press(view.getByRole('button', { name: 'Следующий месяц' }));
  expect(onChange).toHaveBeenCalledWith('2026-10');

  await fireEvent.press(view.getByRole('button', { name: 'Предыдущий месяц' }));
  expect(onChange).toHaveBeenCalledWith('2026-08');
});

test('название месяца — кнопка, открывающая выбор', async () => {
  const { view } = await renderSwitcher();

  const title = view.getByRole('button', { name: 'Сентябрь 2026' });
  expect(title).toBeCollapsed();

  await fireEvent.press(title);

  // Списки стоят открытым месяцем: править в них надо одно поле, а не оба.
  expect(view.getByRole('button', { name: 'Месяц: Сентябрь' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Год: 2026' })).toBeTruthy();
});

test('месяц и год собираются в один переезд', async () => {
  const { view, onChange } = await renderSwitcher();

  await fireEvent.press(view.getByRole('button', { name: 'Сентябрь 2026' }));
  await choose(view, 'Месяц: Сентябрь', 'Март');
  // Год не ограничен окном листания: 2028-й выбирается так же, как соседний.
  await choose(view, 'Год: 2026', '2028');

  // До «Открыть» экран стоит на месте: иначе по пути он пересчитал бы два
  // чужих месяца.
  expect(onChange).not.toHaveBeenCalled();

  await fireEvent.press(view.getByRole('button', { name: 'Открыть Март 2028' }));

  expect(onChange).toHaveBeenCalledWith('2028-03');
  expect(view.queryByRole('button', { name: 'Отмена' })).toBeNull();
});

test('отмена ничего не двигает', async () => {
  const { view, onChange } = await renderSwitcher();

  await fireEvent.press(view.getByRole('button', { name: 'Сентябрь 2026' }));
  await choose(view, 'Месяц: Сентябрь', 'Март');
  await fireEvent.press(view.getByRole('button', { name: 'Отмена' }));

  expect(onChange).not.toHaveBeenCalled();
  expect(view.queryByRole('button', { name: 'Месяц: Март' })).toBeNull();
});

test('дальше границ приложения месяц не уходит', async () => {
  const { view } = await renderSwitcher('1970-01');

  expect(view.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled();
  expect(view.getByRole('button', { name: 'Следующий месяц' })).not.toBeDisabled();
});
