import { act, render } from '@testing-library/react-native';
import { WidgetSyncProvider } from './WidgetSyncProvider.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { ThemeProvider, darkPalette } from '@/theme';

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

  const last = mockWrite.mock.calls.at(-1)?.[0] as string;

  expect(mockWrite.mock.calls.length).toBeGreaterThan(beforeCalls);
  expect(last).toContain('Отпуск');
});

test('своя тема задаёт виджету сторону: он не следует за системой', async () => {
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

  await act(async () => {
    const themeId = useAppStore.getState().addTheme('Ночная', darkPalette);
    useAppStore.getState().setAppearance(`custom:${themeId}`);
  });

  // Тема одна и та же днём и ночью — виджету надо сказать, какой стороной
  // рисоваться, иначе он выберет по системе и возьмёт чужой цвет текста.
  const last = mockWrite.mock.calls.at(-1)?.[0] as string;
  expect(last).toContain('"appearance":"dark"');
  expect(last).toContain(darkPalette.shifts['shift.day'].surface);
});

test('свой цвет смены уезжает в виджет мимо палитры', async () => {
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

  await act(async () => {
    useAppStore.getState().updateShiftType('day12', { color: '#123456' });
  });

  // Цвет смены не зависит от темы: в снимке он стоит и на светлой стороне, и
  // на тёмной.
  const last = mockWrite.mock.calls.at(-1)?.[0] as string;
  expect(last.split('#123456').length - 1).toBeGreaterThanOrEqual(2);
});
