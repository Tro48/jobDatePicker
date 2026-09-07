import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DayCell, HOLIDAY_ICON, NOTE_ICON, PAYMENT_ICON } from './DayCell.tsx';
import { resolveDay } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '@/domain/shifts.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { RU_HOLIDAYS } from '@/domain/holidays.ts';
import { FOCUS_RING_WIDTH, lightPalette, ThemeProvider } from '@/theme';

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

/** График, который начнётся только в октябре: в сентябре смен ещё нет. */
function contextFromOctober(): ScheduleContext {
  const context = contextFor();
  return {
    ...context,
    schedules: [{ ...context.schedules[0], anchorDate: '2026-10-01', startsOn: '2026-10-01' }],
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
  isSelected?: boolean;
  note?: string;
  hasPayment?: boolean;
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
  isSelected = false,
  note,
  hasPayment = false,
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
        note={note}
        hasPayment={hasPayment}
        isSelected={isSelected}
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

/** Толщина рамок в дереве: у клетки она одна, и меняться от состояния не должна. */
function borderWidths(tree: unknown): number[] {
  const found: number[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as { props?: { style?: unknown }; children?: unknown };
    for (const style of [element.props?.style].flat()) {
      const width = (style as { borderWidth?: number } | undefined)?.borderWidth;
      if (width !== undefined) found.push(width);
    }
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

test('будний день без графика — базовый календарь: свой цвет, без буквы смены', async () => {
  // 1 сентября 2026 года — вторник, а график начинается только в октябре.
  const before = await renderCell({
    date: '2026-09-01',
    counted: false,
    context: contextFromOctober(),
  });

  const label = before.getByRole('button').props.accessibilityLabel;
  expect(label).toContain('будний день');
  expect(label).toContain('графика ещё нет');
  // Ни смены, ни «выходного» из заглушки: работы в этот день не было вовсе.
  expect(label).not.toContain('выходной');
  expect(label).not.toContain('отработан');

  // Цвет свой, базовый — не фон страницы и не цвет смены.
  const fills = backgroundColors(before.toJSON());
  expect(fills).toContain(lightPalette.baseWeekday.surface);
  expect(fills).not.toContain(lightPalette.background);
  // Содержимое клетки скрыто от озвучки — ищем с учётом скрытого.
  expect(before.queryByText('В', { includeHiddenElements: true })).toBeNull();
});

test('выходной без графика остаётся выходным: цвет и буква те же', async () => {
  // 5 сентября 2026 года — суббота.
  const weekend = await renderCell({
    date: '2026-09-05',
    counted: false,
    context: contextFromOctober(),
  });

  expect(weekend.getByRole('button').props.accessibilityLabel).toContain('выходной');
  expect(backgroundColors(weekend.toJSON())).toContain(lightPalette.shifts['shift.off'].surface);
  expect(weekend.getByText('В', { includeHiddenElements: true })).toBeTruthy();
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

test('день без графика рамкой не обводится: он свой, а не из чужого месяца', async () => {
  const before = await renderCell({
    date: '2026-09-01',
    counted: false,
    context: contextFromOctober(),
  });

  expect(borderColors(before.toJSON())).not.toContain(lightPalette.border);
});

test('заметка и выплата помечены каждая своим значком, а не одной точкой', async () => {
  const view = await renderCell({ note: 'Забрать посылку', hasPayment: true });
  const icons = iconNames(view.toJSON());

  expect(icons).toContain(NOTE_ICON);
  expect(icons).toContain(PAYMENT_ICON);
});

test('заметка и выплата озвучиваются словами: значок скринридеру не виден', async () => {
  await renderCell({ note: 'Забрать посылку', hasPayment: true });

  const label = screen.getByRole('button').props.accessibilityLabel as string;

  // Заметка читается своим текстом: «есть заметка» заставило бы открыть день,
  // чтобы узнать, о чём она.
  expect(label).toContain('Забрать посылку');
  expect(label).toContain('есть выплата');
});

test('без заметки и выплаты лишних значков в клетке нет', async () => {
  const view = await renderCell();
  const icons = iconNames(view.toJSON());

  expect(icons).not.toContain(NOTE_ICON);
  expect(icons).not.toContain(PAYMENT_ICON);
});

/**
 * Толщина рамки одна и та же в любом состоянии.
 *
 * Абсолютные координаты значков в углах считаются от внутреннего края рамки:
 * стоило ей потолстеть при выборе, и заметка с выплатой уезжали внутрь клетки
 * на каждое нажатие по дню.
 */
test('рамка обычной клетки той же толщины, что и у выбранной', async () => {
  const view = await renderCell({ note: 'Забрать посылку', hasPayment: true });

  expect(borderWidths(view.toJSON())).toEqual([FOCUS_RING_WIDTH]);
});

test('выбранная клетка рамкой не толстеет, а только меняет цвет', async () => {
  const view = await renderCell({ isSelected: true, note: 'Забрать посылку', hasPayment: true });

  expect(borderWidths(view.toJSON())).toEqual([FOCUS_RING_WIDTH]);
  expect(borderColors(view.toJSON())).toContain(lightPalette.accent);
});
