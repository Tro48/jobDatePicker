/**
 * Что палитра обязана выдерживать по контрасту.
 *
 * По этому списку падает сборка, если правка палитры в коде уронила контраст:
 * палитру из кода нельзя «поправить на глаз» и сломать доступность всем, кто
 * ничего не перекрашивал.
 *
 * Цветов, заданных человеком на телефоне, это не касается: там он видит
 * результат в образце и решает сам. Предупреждений в интерфейсе нет намеренно.
 *
 * Проверка описана цветами, а не именами слотов: цвет, заданный человеком,
 * сюда не попадает вовсе, а из палитры в коде каждая пара достаётся напрямую.
 */
import { TEXT_CONTRAST, contrastRatio } from './color.ts';
import { fadedShiftPair } from './palette.ts';
import type { Palette } from './palette.ts';

export interface PaletteCheck {
  /** Человеческое описание: «shift.day: подпись на заливке». */
  label: string;
  /** Нижний порог контраста. */
  minimum: number;
  foreground: (palette: Palette) => string;
  background: (palette: Palette) => string;
}

/**
 * Насколько заливка обязана отличаться от фона страницы, чтобы клетка вообще
 * читалась как клетка.
 *
 * Порог не из WCAG: там для нетекстовых элементов 3:1, но это про границы и
 * иконки, несущие смысл в одиночку. Смысл дня несёт буква-маркер, а заливка —
 * это форма, по которой глаз находит сетку. По 3:1 светлая тема превратилась
 * бы в набор кричащих плашек. 1.2:1 — это край, за которым заливка перестаёт
 * быть видна вовсе: с 1.05:1 выходные и дни соседних месяцев сливались с фоном
 * в обеих темах.
 */
export const FILL_VISIBLE = 1.2;

/** То же для панелей: карточка на странице должна быть видна как карточка. */
export const SURFACE_VISIBLE = 1.12;

/** Обычный текст по WCAG 2.1 AA. Порог общий с тем, по которому считается
 * цвет подписи на заданной человеком заливке. */
export const TEXT_MINIMUM = TEXT_CONTRAST;

/** Границы, значки и кольцо фокуса — нетекстовые элементы, у них порог ниже. */
export const NON_TEXT_MINIMUM = 3;

function check(
  label: string,
  minimum: number,
  foreground: (palette: Palette) => string,
  background: (palette: Palette) => string,
): PaletteCheck {
  return { label, minimum, foreground, background };
}

/** Отклонение от графика: цифра поверх заливки клетки. */
const DEVIATION_COLORS = [
  ['переработка', (p: Palette) => p.positive],
  ['недоработка', (p: Palette) => p.danger],
] as const;

/**
 * Полный список проверок палитры.
 *
 * Смены берутся из самой палитры: справочник цветов может подрасти, и проверка
 * обязана подрасти вместе с ним.
 */
export function paletteChecks(palette: Palette): PaletteCheck[] {
  const checks: PaletteCheck[] = [
    check(
      'основной текст на фоне',
      TEXT_MINIMUM,
      (p) => p.text,
      (p) => p.background,
    ),
    check(
      'основной текст на панели',
      TEXT_MINIMUM,
      (p) => p.text,
      (p) => p.surface,
    ),
    check(
      'приглушённый текст на фоне',
      TEXT_MINIMUM,
      (p) => p.textMuted,
      (p) => p.background,
    ),
    check(
      'приглушённый текст на панели',
      TEXT_MINIMUM,
      (p) => p.textMuted,
      (p) => p.surface,
    ),
    check(
      'основной текст на поле ввода',
      TEXT_MINIMUM,
      (p) => p.text,
      (p) => p.surfaceElevated,
    ),
    check(
      'приглушённый текст на поле ввода',
      TEXT_MINIMUM,
      (p) => p.textMuted,
      (p) => p.surfaceElevated,
    ),
    check(
      'акцент на поле ввода',
      NON_TEXT_MINIMUM,
      (p) => p.accent,
      (p) => p.surfaceElevated,
    ),
    check(
      'граница элемента на фоне',
      NON_TEXT_MINIMUM,
      (p) => p.border,
      (p) => p.background,
    ),
    check(
      'акцент на фоне',
      TEXT_MINIMUM,
      (p) => p.accent,
      (p) => p.background,
    ),
    check(
      'текст на акценте',
      TEXT_MINIMUM,
      (p) => p.onAccent,
      (p) => p.accent,
    ),
    check(
      'кольцо фокуса на фоне',
      NON_TEXT_MINIMUM,
      (p) => p.focus,
      (p) => p.background,
    ),
    check(
      'кольцо фокуса на панели',
      NON_TEXT_MINIMUM,
      (p) => p.focus,
      (p) => p.surface,
    ),
    check(
      'цвет ошибки на фоне',
      TEXT_MINIMUM,
      (p) => p.danger,
      (p) => p.background,
    ),
    check(
      'цвет ошибки на панели',
      TEXT_MINIMUM,
      (p) => p.danger,
      (p) => p.surface,
    ),
    check(
      'переработка на фоне',
      TEXT_MINIMUM,
      (p) => p.positive,
      (p) => p.background,
    ),
    check(
      'переработка на панели',
      TEXT_MINIMUM,
      (p) => p.positive,
      (p) => p.surface,
    ),
    check(
      'панель на фоне',
      SURFACE_VISIBLE,
      (p) => p.surface,
      (p) => p.background,
    ),
  ];

  // Базовый календарь: месяц без графика — это тоже клетки с числами.
  // Выделенный общий выходной — та же обвязка: подпись, точка отклонения и
  // кольцо фокуса лежат и на нём.
  for (const [key, title] of [
    ['baseWeekday', 'будний день без графика'],
    ['highlight', 'выделенный день'],
  ] as const) {
    checks.push(
      check(
        `${title}: подпись на заливке`,
        TEXT_MINIMUM,
        (p) => p[key].on,
        (p) => p[key].surface,
      ),
      check(
        `${title}: заливка на фоне`,
        FILL_VISIBLE,
        (p) => p[key].surface,
        (p) => p.background,
      ),
      check(
        `${title}: кольцо фокуса на заливке`,
        NON_TEXT_MINIMUM,
        (p) => p.focus,
        (p) => p[key].surface,
      ),
    );
  }

  for (const [state, pick] of DEVIATION_COLORS) {
    checks.push(
      check(`выделенный день: ${state} на заливке`, TEXT_MINIMUM, pick, (p) => p.highlight.surface),
    );
  }

  for (const token of Object.keys(palette.shifts)) {
    const fill = (p: Palette) => p.shifts[token].surface;
    // Заливка отработанной смены — не «примерно та же»: цифра отклонения и
    // буква-маркер живут на ней, значит и порог она проходит отдельно.
    const faded = (p: Palette) => fadedShiftPair(p.shifts[token], p.surface).surface;
    checks.push(
      check(`${token}: заливка на фоне`, FILL_VISIBLE, fill, (p) => p.background),
      check(`${token}: подпись на заливке`, TEXT_MINIMUM, (p) => p.shifts[token].on, fill),
      check(`${token}: кольцо фокуса на заливке`, NON_TEXT_MINIMUM, (p) => p.focus, fill),
      check(
        `${token}: подпись на приглушённой заливке`,
        TEXT_MINIMUM,
        (p) => p.shifts[token].on,
        faded,
      ),
      check(
        `${token}: кольцо фокуса на приглушённой заливке`,
        NON_TEXT_MINIMUM,
        (p) => p.focus,
        faded,
      ),
    );

    for (const [state, pick] of DEVIATION_COLORS) {
      checks.push(
        check(`${token}: ${state} на заливке`, TEXT_MINIMUM, pick, fill),
        check(`${token}: ${state} на приглушённой заливке`, TEXT_MINIMUM, pick, faded),
      );
    }
  }

  return checks;
}

export interface CheckResult {
  check: PaletteCheck;
  ratio: number;
  passed: boolean;
}

export function runCheck(palette: Palette, item: PaletteCheck): CheckResult {
  const ratio = contrastRatio(item.foreground(palette), item.background(palette));
  return { check: item, ratio, passed: ratio >= item.minimum };
}
