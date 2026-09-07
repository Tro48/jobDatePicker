import { act, renderHook } from '@testing-library/react-native';
import { useMonthWindow } from './useMonthWindow.ts';
import { MONTH_RANGE } from '@/domain/months.ts';

/**
 * Что происходит с окном листания, когда в шапке выбирают далёкий месяц.
 *
 * Свайпом ходят по готовым 37 месяцам, а выбор месяца и года ими не ограничен:
 * за краем окна оно обязано пересобраться вокруг выбранного — иначе выбранный
 * месяц просто некуда открыть.
 */

test('окно открывается на сегодняшнем месяце', async () => {
  const { result } = await renderHook(() => useMonthWindow('2026-09-17'));

  expect(result.current.visible.period).toBe('2026-09');
  expect(result.current.index).toBe(MONTH_RANGE);
  expect(result.current.months).toHaveLength(MONTH_RANGE * 2 + 1);
});

test('месяц из окна открывается без пересборки', async () => {
  const { result } = await renderHook(() => useMonthWindow('2026-09-17'));
  const before = result.current.months;

  await act(async () => result.current.goTo('2026-12'));

  expect(result.current.visible.period).toBe('2026-12');
  expect(result.current.index).toBe(MONTH_RANGE + 3);
  // Тот же массив: пейджер не пересоздаётся и страницы не перерисовываются.
  expect(result.current.months).toBe(before);
  expect(result.current.key).toBe('2026-09');
});

test('месяц за краем окна пересобирает его вокруг себя', async () => {
  const { result } = await renderHook(() => useMonthWindow('2026-09-17'));

  await act(async () => result.current.goTo('2031-08'));

  expect(result.current.visible.period).toBe('2031-08');
  expect(result.current.index).toBe(MONTH_RANGE);
  expect(result.current.key).toBe('2031-08');
  // Соседи у выбранного месяца те же, что были у сегодняшнего.
  expect(result.current.months[0].period).toBe('2030-02');
  expect(result.current.months.at(-1)?.period).toBe('2033-02');
});
