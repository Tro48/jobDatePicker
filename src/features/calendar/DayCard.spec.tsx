import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DayCard } from './DayCard.tsx';
import { PAYMENT_ICON } from './DayCell.tsx';
import { resolveDay } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { DEFAULT_SHIFT_TYPES, indexShiftTypes } from '@/domain/shifts.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import type { DayNote, PaymentRecord } from '@/domain/types.ts';
import { ThemeProvider } from '@/theme';

/**
 * Карточка выбранного дня.
 *
 * Она отвечает на главный вопрос к приложению, поэтому проверяется то, что
 * человек с неё считывает: смена и часы, значки заметки и выплаты и одна
 * склеенная строка для скринридера.
 */

function contextFor(startsOn: string): ScheduleContext {
  return {
    schedules: [
      {
        presetId: '2-2-day',
        pattern: SCHEDULE_PRESETS.find((preset) => preset.id === '2-2-day')!.pattern,
        anchorDate: startsOn,
        startsOn,
      },
    ],
    shiftTypes: indexShiftTypes(DEFAULT_SHIFT_TYPES),
    overrides: new Map(),
  };
}

const note: DayNote = {
  id: 'n1',
  date: '2026-09-01',
  text: 'Забрать посылку\nу соседа',
  remindAt: null,
  createdAt: 1,
};

const payment: PaymentRecord = {
  id: 'p1',
  trackId: 't1',
  kind: 'salary',
  period: '2026-08',
  receivedOn: '2026-09-01',
  amount: 75_000,
};

function withTheme(node: ReactElement) {
  return <ThemeProvider>{node}</ThemeProvider>;
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

/**
 * Сколько текстовых строк в колонке карточки: из них и складывается её высота.
 *
 * Считается только сама колонка — та, что скрыта от озвучки, потому что
 * карточку скринридер читает одной строкой. Счётчик на кнопке заметок в высоту
 * не идёт: он стоит в углу значка.
 */
function textLines(tree: unknown): number {
  let found = 0;

  const countTexts = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(countTexts);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as { type?: string; children?: unknown };
    if (element.type === 'Text') found += 1;
    countTexts(element.children);
  };

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;

    const element = node as {
      props?: { importantForAccessibility?: string };
      children?: unknown;
    };
    if (element.props?.importantForAccessibility === 'no-hide-descendants') {
      countTexts(element.children);
      return;
    }
    walk(element.children);
  };

  walk(tree);
  return found;
}

function renderCard({
  startsOn = '2026-09-01',
  notes = [] as DayNote[],
  payments = [] as PaymentRecord[],
  isToday = false,
} = {}) {
  return render(
    withTheme(
      <DayCard
        day={resolveDay(contextFor(startsOn), '2026-09-01')}
        isToday={isToday}
        notes={notes}
        payments={payments}
        currency="₽"
        onEdit={() => {}}
        onNotes={() => {}}
      />,
    ),
  );
}

test('карточка называет день целиком: смена, часы и выплата', async () => {
  const view = await renderCard({ notes: [note], payments: [payment], isToday: true });
  const label = view.getByLabelText(/^Сегодня,/).props.accessibilityLabel as string;

  expect(label).toContain('дневная смена');
  expect(label).toContain('есть выплата');
  expect(label).toContain('75');
  // Текста заметки в карточке нет ни на экране, ни в озвучке: он бывает в
  // десять строк. Про заметки говорит кнопка, которая их открывает.
  expect(label).not.toContain('Забрать посылку');
});

test('выплата помечена тем же значком, что и в клетке', async () => {
  const view = await renderCard({ payments: [payment] });

  expect(iconNames(view.toJSON())).toContain(PAYMENT_ICON);
});

test('у дня раньше первого графика смены нет, а не «выходной»', async () => {
  const view = await renderCard({ startsOn: '2026-10-01' });
  const label = view.getByLabelText(/графика ещё нет/).props.accessibilityLabel as string;

  // Заглушка-выходной из справочника в карточку не попадает: назвать вторник
  // выходным значило бы соврать.
  expect(label).not.toContain('выходной');
});

test('без заметок кнопка зовёт завести первую', async () => {
  const view = await renderCard();

  expect(view.getByLabelText('Добавить заметку')).toBeTruthy();
});

test('с заметками кнопка называет их число и показывает счётчик', async () => {
  const view = await renderCard({ notes: [note, { ...note, id: 'n2' }] });

  expect(view.getByLabelText('Заметки: 2')).toBeTruthy();
  // Счётчик на кнопке — то же число, что и в её имени: значок с цифрой
  // скринридеру не виден, а имя без числа сказало бы меньше, чем видит зрячий.
  expect(view.getByText('2')).toBeTruthy();
});

/**
 * Высота карточки постоянная.
 *
 * Карточка стоит прямо над сеткой, а выбор дня меняется нажатием: разное число
 * строк двигало бы календарь вверх-вниз на каждое нажатие по дню. Проверяется
 * числом строк — единственным, из чего её высота и складывается.
 */
const CARD_LINES = 4;

test('у дня без заметок и выплат строки всё равно отведены', async () => {
  const view = await renderCard();

  expect(textLines(view.toJSON())).toBe(CARD_LINES);
});

test('у дня, где есть всё сразу, строк столько же', async () => {
  const view = await renderCard({ notes: [note], payments: [payment], isToday: true });

  expect(textLines(view.toJSON())).toBe(CARD_LINES);
});

test('у дня раньше первого графика строк столько же', async () => {
  const view = await renderCard({ startsOn: '2026-10-01' });

  expect(textLines(view.toJSON())).toBe(CARD_LINES);
});
