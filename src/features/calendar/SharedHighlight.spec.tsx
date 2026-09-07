import { act, render, screen, userEvent } from '@testing-library/react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { CalendarScreen } from './CalendarScreen.tsx';
import { AlarmSyncProvider } from '@/features/alarm/AlarmSyncProvider.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { ThemeProvider, typography } from '@/theme';

/**
 * Как календарь говорит, чьи выходные сейчас выделены.
 *
 * Ответ живёт в легенде под сеткой, рядом с обозначениями смен, и место под
 * него занято заранее. Своей строки над календарём у выделения нет: она
 * сдвигала вниз всё, что ниже, и экран прыгал на каждое нажатие в списке.
 * Поэтому проверяется не только текст, но и то, что от нажатия не двигается
 * ни верх экрана, ни блок под легендой.
 */

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockPush = () => {};
jest.mock('@/navigation/useGuardedPush.ts', () => ({ useGuardedPush: () => mockPush }));

function trackOf(
  id: string,
  name: string,
  own: boolean,
  anchorDate: IsoDate = '2026-09-01',
): ScheduleTrack {
  return {
    id,
    name,
    own,
    schedules: [
      {
        presetId: '2-2-day',
        pattern: SCHEDULE_PRESETS[0].pattern,
        anchorDate,
        startsOn: anchorDate,
      },
    ],
    overrides: {},
    payrollRules: DEFAULT_PAYMENT_RULES,
  };
}

function setTracks(tracks: ScheduleTrack[]) {
  useAppStore.setState({
    ...INITIAL_STATE,
    tracks,
    activeTrackId: tracks[0].id,
    sharedDaysOff: { enabled: true },
  });
}

beforeEach(() => {
  setTracks([trackOf('a', 'Основная', true), trackOf('b', 'Аня', false)]);
});

async function renderScreen() {
  const view = await render(
    <ThemeProvider>
      <AlarmSyncProvider>
        <CalendarScreen />
      </AlarmSyncProvider>
    </ThemeProvider>,
  );
  // Соседние месяцы пейджер дорисовывает следующим кадром.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  return view;
}

test('место под строку занято ещё до того, как что-то выделили', async () => {
  const { toJSON } = await renderScreen();

  expect(texts(toJSON()).some((text) => text.startsWith('общи'))).toBe(false);
  expect(reservedRows(toJSON())).toBe(1);
});

test('выделение объясняется в легенде, рядом с обозначениями смен', async () => {
  const { toJSON } = await renderScreen();

  await userEvent.press(screen.getByLabelText(/^Аня: /));

  const strings = texts(toJSON());
  const legend = strings.indexOf('дневная смена');
  const shared = strings.indexOf('общие выходные: Аня');

  expect(screen.getByLabelText('Выделены общие выходные: Аня')).toBeTruthy();
  // Обозначения смен остаются первыми: строка выделения приходит и уходит, и
  // двигать их она не должна.
  expect(legend).toBeGreaterThanOrEqual(0);
  expect(shared).toBeGreaterThan(legend);
});

test('выше сетки от нажатия не меняется ничего', async () => {
  const { toJSON } = await renderScreen();

  // «пн» — первый день в шапке сетки: всё до него и есть верх экрана.
  const above = (tree: Parameters<typeof texts>[0]) => {
    const strings = texts(tree);
    return strings.slice(0, strings.indexOf('пн'));
  };

  const before = above(toJSON());
  await userEvent.press(screen.getByLabelText(/^Аня: /));

  expect(above(toJSON())).toEqual(before);
});

test('месяц без совпадений: строка говорит, что их нет, и место остаётся занятым', async () => {
  // Тот же график, сдвинутый на половину цикла: выходные одного приходятся на
  // смены другого, и общих дней не бывает ни в одном месяце.
  setTracks([trackOf('a', 'Основная', true), trackOf('b', 'Аня', false, '2026-09-03')]);
  const { toJSON } = await renderScreen();

  await userEvent.press(screen.getByLabelText(/^Аня: /));

  expect(screen.getByText('общих выходных нет: Аня')).toBeTruthy();
  expect(screen.getByLabelText('Аня: общих выходных в этом месяце нет')).toBeTruthy();
  expect(reservedRows(toJSON())).toBe(1);
});

/**
 * Зарезервированная строка под легендой: живая область ростом ровно в одно
 * обозначение. Ищется по разметке — пустой она ничего не говорит ни текстом,
 * ни ролью, в этом и смысл.
 */
function reservedRows(tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null): number {
  if (tree === null) return 0;
  if (Array.isArray(tree)) return tree.reduce((sum, node) => sum + reservedRows(node), 0);

  const style = [tree.props?.style].flat(Infinity).filter(Boolean) as Record<string, unknown>[];
  const reserved =
    tree.type === 'View' &&
    tree.props?.accessibilityLiveRegion === 'polite' &&
    style.some((rule) => rule.minHeight === typography.badge.lineHeight + 4);

  const children = (tree.children ?? []) as ReactTestRendererJSON[];
  return (reserved ? 1 : 0) + children.reduce((sum, node) => sum + reservedRows(node), 0);
}

/** Весь текст экрана сверху вниз, в порядке разметки. */
function texts(tree: ReactTestRendererJSON | ReactTestRendererJSON[] | null): string[] {
  if (tree === null) return [];
  if (Array.isArray(tree)) return tree.flatMap(texts);

  return ((tree.children ?? []) as (ReactTestRendererJSON | string)[]).flatMap((child) =>
    typeof child === 'string' ? [child] : texts(child),
  );
}
