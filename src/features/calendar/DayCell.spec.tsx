import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DayCell, HOLIDAY_ICON } from './DayCell.tsx';
import { resolveDay } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '@/domain/shifts.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { RU_HOLIDAYS } from '@/domain/holidays.ts';
import { lightPalette, ThemeProvider } from '@/theme';

/**
 * Клетка календаря: что она говорит скринридеру и чем помечает расхождение с
 * графиком. Цвет точки проверяется числом, а не глазами, — это единственное
 * место, где переработка отличается от недоработки визуально.
 */

function contextFor(): ScheduleContext {
  return {
    schedules: [
      {
        presetId: '2-2-day',
        pattern: SCHEDULE_PRESETS.find((preset) => preset.id === '2-2-day')!.pattern,
        anchorDate: '2026-09-01',
        startsOn: '2026-09-01',
      },
    ],
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
  inMonth?: boolean;
  isToday?: boolean;
  isWorked?: boolean;
  counted?: boolean;
  highlighting?: boolean;
  dimmed?: boolean;
  sharedWith?: string;
  context?: ScheduleContext;
}

function renderCell({
  date = '2026-09-01',
  inMonth = true,
  isToday = false,
  isWorked = false,
  counted = true,
  highlighting = false,
  dimmed = false,
  sharedWith,
  context = contextFor(),
}: CellOptions = {}) {
  return render(
    withTheme(
      <DayCell
        day={resolveDay(context, date)}
        size={48}
        height={48}
        inMonth={inMonth}
        counted={counted}
        isToday={isToday}
        isWorked={isWorked}
        highlighting={highlighting}
        dimmed={dimmed}
        sharedWith={sharedWith}
        isSelected={false}
        onPress={() => {}}
      />,
    ),
  );
}

/** Имена значков в отрисованном дереве, по порядку. */
function iconNames(tree: unknown): string[] {
  const found: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as { type?: string; props?: { name?: string }; children?: unknown };
    if (element.type === 'Ionicons' && element.props?.name) found.push(element.props.name);
    walk(element.children);
  };

  walk(tree);
  return found;
}

/** Цвета рамок в дереве: у клетки она одна, и по ней видно, обведена ли она. */
function borderColors(tree: unknown): string[] {
  const found: string[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as { props?: { style?: unknown }; children?: unknown };
    for (const style of [element.props?.style].flat()) {
      const color = (style as { borderColor?: string } | undefined)?.borderColor;
      if (color) found.push(color);
    }
    walk(element.children);
  };

  walk(tree);
  return found;
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

test('снятая смена — красная точка и недоработка в озвучке', async () => {
  // 1 сентября по графику дневная смена; выходной поверх неё снимает 12 часов.
  const swapped = contextFor();
  swapped.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'off' });
  const cell = await renderCell({ context: swapped });

  expect(backgroundColors(cell.toJSON())).toContain(lightPalette.danger);
  expect(cell.getByRole('button').props.accessibilityLabel).toContain('недоработка 12 часов');
});

test('отпуск поверх смены точку не получает', async () => {
  const vacation = contextFor();
  vacation.overrides.set('2026-09-01', { date: '2026-09-01', shiftTypeId: 'vacation' });
  const cell = await renderCell({ context: vacation });
  const colors = backgroundColors(cell.toJSON());

  expect(colors).not.toContain(lightPalette.positive);
  expect(colors).not.toContain(lightPalette.danger);
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

test('выделенный день заливается своим цветом, а не сменным', async () => {
  // 3 сентября по графику 2/2 от 1 сентября — выходной.
  const plain = await renderCell({ date: '2026-09-03' });
  const plainFill = backgroundColors(plain.toJSON())[0];
  await plain.unmount();

  const marked = await renderCell({ date: '2026-09-03', highlighting: true });
  const markedFill = backgroundColors(marked.toJSON())[0];

  expect(plainFill).toBe(lightPalette.shifts['shift.off'].surface);
  expect(markedFill).toBe(lightPalette.highlight.surface);
});

test('невыделенный день гаснет, но своей заливки не теряет', async () => {
  const plain = await renderCell({ date: '2026-09-03' });
  const plainFill = backgroundColors(plain.toJSON())[0];
  await plain.unmount();

  const dim = await renderCell({ date: '2026-09-03', highlighting: true, dimmed: true });
  const dimFill = backgroundColors(dim.toJSON())[0];

  // Приглушение — это смешение с нейтральным, а не цвет выделения и не
  // прозрачность: подпись остаётся читаемой.
  expect(dimFill).not.toBe(plainFill);
  expect(dimFill).not.toBe(lightPalette.highlight.surface);
});

test('выделение говорится словами, а не только цветом', async () => {
  const marked = await renderCell({ date: '2026-09-03', highlighting: true });

  expect(marked.getByRole('button').props.accessibilityLabel).toContain('общий выходной');
});

test('выделенный день говорит, чей он: при двух чужих графиках иначе не понять', async () => {
  const marked = await renderCell({ date: '2026-09-03', highlighting: true, sharedWith: 'Аня' });

  expect(marked.getByRole('button').props.accessibilityLabel).toContain('общий выходной с: Аня');
});

test('праздник помечен значком и назван словами', async () => {
  const withHolidays = { ...contextFor(), holidays: RU_HOLIDAYS };
  const cell = await renderCell({ date: '2026-06-12', context: withHolidays });
  const plain = await renderCell({ date: '2026-06-11', context: withHolidays });

  expect(cell.getByRole('button').props.accessibilityLabel).toContain('день россии');
  expect(iconNames(cell.toJSON())).toEqual([HOLIDAY_ICON]);
  // Обычный день значка не получает: иначе метка перестаёт что-либо значить.
  expect(iconNames(plain.toJSON())).toEqual([]);
});

test('день до первой смены не залит и назван словами', async () => {
  const before = await renderCell({ date: '2026-09-01', counted: false });
  const after = await renderCell({ date: '2026-09-01' });

  const label = before.getByRole('button').props.accessibilityLabel;
  expect(label).toContain('до первой смены');
  // «Отработана» такая смена не бывает: её не было.
  expect(label).not.toContain('отработан');
  // Заливки нет: цвет клетки — фон страницы, а не цвет смены.
  expect(backgroundColors(before.toJSON())).toContain(lightPalette.background);
  expect(backgroundColors(after.toJSON())).not.toContain(lightPalette.background);
});

test('день соседнего месяца обведён рамкой: заливки у него нет', async () => {
  const outside = await renderCell({ date: '2026-09-01', inMonth: false });
  const inside = await renderCell({ date: '2026-09-01' });

  // Без рамки такая клетка — просто текст на фоне страницы: в тёмной теме она
  // сливалась с ним целиком.
  expect(borderColors(outside.toJSON())).toContain(lightPalette.border);
  // Залитой клетке рамка не нужна: её видно по заливке.
  expect(borderColors(inside.toJSON())).not.toContain(lightPalette.border);
});

test('день до первой смены тоже обведён: заливки у него нет по той же причине', async () => {
  const before = await renderCell({ date: '2026-09-01', counted: false });

  expect(borderColors(before.toJSON())).toContain(lightPalette.border);
});
