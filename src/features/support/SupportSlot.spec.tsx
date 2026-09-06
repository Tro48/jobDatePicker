import { act, fireEvent, render } from '@testing-library/react-native';
import { SupportSlot } from './SupportSlot.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Слот поддержки. Проверяется главное обещание: карточку можно убрать
 * навсегда, и рекламы в сборке нет.
 */

function renderSlot() {
  return render(
    <ThemeProvider>
      <SupportSlot />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
});

test('по умолчанию видна карточка без рекламы, а не реклама', async () => {
  const view = await renderSlot();

  expect(view.getByText('Без рекламы и без подписки')).toBeTruthy();
  expect(view.queryByLabelText('Реклама')).toBeNull();
});

test('«не показывать» убирает карточку и не возвращает её', async () => {
  const view = await renderSlot();

  await act(async () => {
    fireEvent.press(view.getByText('Не показывать'));
  });

  expect(useAppStore.getState().support.donationDismissed).toBe(true);
  expect(view.queryByText('Без рекламы и без подписки')).toBeNull();

  // Перерисовка с нуля — карточка не возвращается: отказ записан в хранилище.
  const again = await renderSlot();
  expect(again.queryByText('Без рекламы и без подписки')).toBeNull();
});

test('купившему отключение рекламы слот не показывается вовсе', async () => {
  useAppStore.setState({
    support: { adsHidden: true, purchasedAt: Date.now(), donationDismissed: false },
  });

  const view = await renderSlot();

  expect(view.queryByText('Без рекламы и без подписки')).toBeNull();
});
