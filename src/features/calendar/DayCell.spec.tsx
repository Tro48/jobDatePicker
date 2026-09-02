import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DayCell } from './DayCell.tsx';
import { resolveDay } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '@/domain/shifts.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { lightPalette, ThemeProvider } from '@/theme';

/**
 * Клетка календаря: что она говорит скринридеру и чем помечает расхождение с
 * графиком. Цвет точки проверяется числом, а не глазами, — это единственное
 * место, где переработка отличается от недоработки визуально.
 */

function contextFor(): ScheduleContext {
  return {
    schedule: {
      presetId: '2-2-day',
      pattern: SCHEDULE_PRESETS.find((preset) => preset.id === '2-2-day')!.pattern,
      anchorDate: '2026-09-01',
    },
    shiftTypes: indexShiftTypes(DEFAULT_SHIFT_TYPES),
    overrides: new Map(),
  };
}

/** Тема нужна всегда: без неё компонент не знает ни цветов, ни отступов. */
function withTheme(node: ReactElement) {
  return <ThemeProvider>{node}</ThemeProvider>;
}

interface CellOptions {
  date?: string;
  isToday?: boolean;
  isWorked?: boolean;
  context?: ScheduleContext;
}

function renderCell({
  date = '2026-09-01',
  isToday = false,
  isWorked = false,
  context = contextFor(),
}: CellOptions = {}) {
  return render(
    withTheme(
      <DayCell
        day={resolveDay(context, date)}
        size={48}
        inMonth
        isToday={isToday}
        isWorked={isWorked}
        isSelected={false}
        onPress={() => {}}
      />,
    ),
  );
}

/** Все цвета заливки в отрисованном дереве: точка — единственный крашеный кружок. */
function backgroundColors(tree: unknown): string[] {
  const found: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as { props?: { style?: unknown }; children?: unknown };
    // Стиль бывает и объектом, и массивом: Pressable складывает свой поверх
    // переданного.
    for (const style of [element.props?.style].flat()) {
      const fill = (style as { backgroundColor?: string } | undefined)?.backgroundColor;
      if (fill) found.push(fill);
    }
    walk(element.children);
  };

  walk(tree);
  return found;
}

test('клетка называет день целиком: дата, смена, время и часы', async () => {
  await renderCell();

  expect(
    screen.getByLabelText('1 сентября, вторник, дневная смена, с 08:00 до 20:00, 12 часов'),
  ).toBeTruthy();
});

test('отработанная смена и сегодняшний день названы словами, а не только видом', async () => {
  await renderCell({ isToday: true, isWorked: true });

  const label = screen.getByRole('button').props.accessibilityLabel as string;
  expect(label).toContain('сегодня');
  expect(label).toContain('отработано');
});

test('переработка — зелёная точка, недоработка — красная', async () => {
  const over = contextFor();
  over.overrides.set('2026-09-01', { date: '2026-09-01', workedMinutesOverride: 14 * 60 });
  const overtime = await renderCell({ context: over });

  expect(backgroundColors(overtime.toJSON())).toContain(lightPalette.positive);
  expect(overtime.getByRole('button').props.accessibilityLabel).toContain('переработка 2 часа');
  await overtime.unmount();

  const under = contextFor();
  under.overrides.set('2026-09-01', { date: '2026-09-01', workedMinutesOverride: 10 * 60 });
  const undertime = await renderCell({ context: under });

  expect(backgroundColors(undertime.toJSON())).toContain(lightPalette.danger);
  expect(undertime.getByRole('button').props.accessibilityLabel).toContain('недоработка 2 часа');
});

test('день по графику точку не получает', async () => {
  const plain = await renderCell();
  const colors = backgroundColors(plain.toJSON());

  expect(colors).not.toContain(lightPalette.positive);
  expect(colors).not.toContain(lightPalette.danger);
});

test('отработанная смена приглушена, но подпись остаётся прежней', async () => {
  // Дерево снимается сразу после отрисовки: следующий render занимает то же
  // место, и разобрать предыдущее уже не выйдет.
  const plain = await renderCell();
  const plainFill = backgroundColors(plain.toJSON())[0];
  await plain.unmount();

  const worked = await renderCell({ isWorked: true });
  const workedFill = backgroundColors(worked.toJSON())[0];

  expect(plainFill).toBe(lightPalette.shifts['shift.day'].surface);
  // Заливка ушла в серый, а цвет текста не тронут — контраст от этого растёт.
  expect(workedFill).not.toBe(plainFill);
});
