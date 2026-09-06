import { act, render } from '@testing-library/react-native';
import { WidgetSyncProvider } from './WidgetSyncProvider.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider } from '@/theme';

/**
 * Снимок для виджета обязан переписываться на каждую правку дня.
 *
 * Виджет рисует лаунчер по выложенному снимку: пока снимок старый, отпуск,
 * поставленный в календаре, на главном экране не появится вовсе.
 */

const mockWrite = jest.fn();
jest.mock('@modules/shift-widget', () => ({
  isWidgetModuleAvailable: true,
  writeWidgetSnapshot: (...args: unknown[]) => mockWrite(...args),
}));

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE);
  mockWrite.mockClear();
});

test('отпуск, поставленный в календаре, попадает в снимок виджета', async () => {
  const id = useAppStore.getState().addTrack({
    name: 'Основная',
    own: true,
    presetId: '2-2-day',
    anchorDate: '2026-09-01',
  });
  useAppStore.setState({ activeTrackId: id });

  await act(async () => {
    render(
      <ThemeProvider>
        <WidgetSyncProvider>{null}</WidgetSyncProvider>
      </ThemeProvider>,
    );
  });

  const beforeCalls = mockWrite.mock.calls.length;
  expect(beforeCalls).toBeGreaterThan(0);

  await act(async () => {
    useAppStore.getState().setOverrideRange('2026-09-10', 7, 'vacation');
  });

  console.log('ЗАПИСЕЙ ДО ПРАВКИ:', beforeCalls, '| ПОСЛЕ:', mockWrite.mock.calls.length);
  const last = mockWrite.mock.calls.at(-1)?.[0] as string;
  console.log('ОТПУСК В ПОСЛЕДНЕМ СНИМКЕ:', last?.includes('Отпуск'));

  expect(mockWrite.mock.calls.length).toBeGreaterThan(beforeCalls);
  expect(last).toContain('Отпуск');
});
