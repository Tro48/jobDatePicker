/**
 * Какие цвета человек может задать сам и как они ложатся поверх палитры.
 *
 * Хранится не готовая палитра, а поправки к ней: словарь «слот → цвет».
 * Так правка одного акцента не замораживает остальные семнадцать цветов в том
 * виде, в каком они были в момент правки, — новая версия приложения донесёт до
 * человека и обновлённый фон, и новую смену, которой на его телефоне ещё нет.
 *
 * Слот — это адрес цвета в палитре, а не сам цвет. Из одного списка слотов
 * собираются и экран правки, и применение поправок, и проверки контраста:
 * добавить цвет в палитру и забыть про экран так нельзя.
 *
 * Слот заводится не на каждый цвет палитры. Всё, что выводится из заданного,
 * считается само (см. deriveColors): цвет буквы на заливке, подпись на акценте
 * и кольцо фокуса. Спрашивать их отдельно значило бы утроить список ради
 * вопросов, на которые есть один разумный ответ.
 */
import { markerOn, normalizeHex, readableOn } from './color.ts';
import { SHIFT_COLOR_NAMES, lightPalette } from './palette.ts';
import type { ColorPair, Palette } from './palette.ts';

export type SchemeName = 'light' | 'dark';

/** Поправки к одной теме: «id слота → #RRGGBB». */
export type PaletteOverrides = Record<string, string>;

/** Свои цвета для обеих тем сразу. Тёмная и светлая правятся независимо. */
export type ThemeColorOverrides = Record<SchemeName, PaletteOverrides>;

export const EMPTY_THEME_COLORS: ThemeColorOverrides = { light: {}, dark: {} };

/** Разделы экрана правки. Порядок здесь — порядок карточек на экране. */
export const COLOR_GROUPS = [
  {
    id: 'base',
    title: 'Основа',
    hint: 'Фон, панели и текст. Их видно на каждом экране.',
  },
  {
    id: 'accent',
    title: 'Акценты и состояния',
    hint: 'Чем помечены нажатия, фокус, переработка и ошибки.',
  },
  {
    id: 'days',
    title: 'Особые дни',
    hint: 'Выделенные общие выходные и дни месяцев, на которые графика ещё нет.',
  },
  {
    id: 'shifts',
    title: 'Цвета смен',
    hint: 'Заливка клетки календаря и буква-маркер поверх неё — по паре на оттенок.',
  },
] as const;

export type ColorGroupId = (typeof COLOR_GROUPS)[number]['id'];

export interface ColorSlot {
  /** Адрес цвета: «accent», «highlight.surface», «shift.day.on». */
  id: string;
  /** Как цвет называется человеку и озвучке. */
  name: string;
  /** Зачем этот цвет: без объяснения «Поверхность» ничего не значит. */
  hint: string;
  group: ColorGroupId;
  read: (palette: Palette) => string;
  /** Кладёт цвет в палитру на месте. Копию делает вызывающий. */
  write: (palette: Palette, hex: string) => void;
}

/** Простой цвет палитры — строковое поле верхнего уровня. */
type SoloKey = {
  [K in keyof Palette]: Palette[K] extends string ? K : never;
}[keyof Palette];

function soloSlot(key: SoloKey, group: ColorGroupId, name: string, hint: string): ColorSlot {
  return {
    id: key,
    name,
    hint,
    group,
    read: (palette) => palette[key],
    write: (palette, hex) => {
      palette[key] = hex;
    },
  };
}

/** Пара цветов палитры: заливка и то, что читается поверх неё. */
type PairKey = {
  [K in keyof Palette]: Palette[K] extends ColorPair ? K : never;
}[keyof Palette];

/**
 * Заливка пары. Второй цвет пары — то, что читается поверх неё, — не
 * спрашивается: он считается от заливки.
 */
function pairSlot(key: PairKey, group: ColorGroupId, name: string, hint: string): ColorSlot {
  return {
    id: `${key}.surface`,
    name,
    hint: `${hint} Число и буква поверх заливки подбираются сами.`,
    group,
    read: (palette) => palette[key].surface,
    write: (palette, hex) => {
      palette[key] = { surface: hex, on: markerOn(hex) };
    },
  };
}

function shiftSlot(token: string): ColorSlot {
  const name = SHIFT_COLOR_NAMES[token] ?? token;

  return {
    id: `${token}.surface`,
    name,
    hint: `Чем залита клетка календаря у смен этого оттенка. Буква-маркер поверх заливки подбирается сама.`,
    group: 'shifts',
    read: (palette) => palette.shifts[token].surface,
    write: (palette, hex) => {
      palette.shifts[token] = { surface: hex, on: markerOn(hex) };
    },
  };
}

/**
 * Все настраиваемые цвета в порядке показа.
 *
 * Список смен берётся из самой палитры, а не переписывается руками: цвет,
 * добавленный в палитру, обязан появиться на экране правки сам.
 */
export const COLOR_SLOTS: readonly ColorSlot[] = [
  soloSlot('background', 'base', 'Фон', 'Подложка всех экранов и календарной сетки.'),
  soloSlot('surface', 'base', 'Панель', 'Карточки на экранах: настройки, сводка, легенда.'),
  soloSlot(
    'surfaceElevated',
    'base',
    'Поле ввода',
    'Поля, выпадающие списки и обычные кнопки поверх панели.',
  ),
  soloSlot('text', 'base', 'Текст', 'Основной текст на всех экранах.'),
  soloSlot('textMuted', 'base', 'Текст пояснений', 'Подписи, подсказки и второстепенные строки.'),
  soloSlot('border', 'base', 'Границы', 'Рамки клеток календаря, полей и кнопок.'),
  soloSlot(
    'accent',
    'accent',
    'Акцент',
    'Главная кнопка, выбранный день, активная вкладка. По нему же рисуется кольцо фокуса, а подпись на кнопке подбирается сама.',
  ),
  soloSlot('positive', 'accent', 'Переработка', 'Плюс к часам в клетке дня и в сводке.'),
  soloSlot(
    'danger',
    'accent',
    'Ошибка и недоработка',
    'Минус к часам, удаление, сообщения об ошибке.',
  ),
  pairSlot(
    'highlight',
    'days',
    'Общий выходной',
    'Так помечен день, когда свободны все выбранные люди.',
  ),
  pairSlot(
    'baseWeekday',
    'days',
    'День без графика',
    'Будний день месяца, на который график ещё не заведён.',
  ),
  ...Object.keys(lightPalette.shifts).map(shiftSlot),
];

const SLOTS_BY_ID = new Map(COLOR_SLOTS.map((slot) => [slot.id, slot]));

export function findColorSlot(id: string): ColorSlot | null {
  return SLOTS_BY_ID.get(id) ?? null;
}

export function slotsOfGroup(group: ColorGroupId): ColorSlot[] {
  return COLOR_SLOTS.filter((slot) => slot.group === group);
}

/** Копия палитры, которую можно править, не задевая исходную. */
function clonePalette(palette: Palette): Palette {
  return { ...palette, shifts: { ...palette.shifts } };
}

/**
 * Палитра с поправками человека.
 *
 * Пустой набор поправок возвращает ту же палитру, а не её копию: тема
 * пересобирается на каждое изменение хранилища, и лишний объект заставил бы
 * перерисоваться всё приложение.
 *
 * Неизвестные слоты молча пропускаются: после отката на прошлую версию
 * приложения в хранилище остаются поправки к цветам, которых в нём ещё нет.
 */
export function applyOverrides(base: Palette, overrides: PaletteOverrides): Palette {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return base;

  const draft = clonePalette(base);
  let touched = false;

  for (const [id, hex] of entries) {
    const slot = SLOTS_BY_ID.get(id);
    const color = normalizeHex(hex);
    if (!slot || !color) continue;
    slot.write(draft, color);
    touched = true;
  }

  if (!touched) return base;

  deriveColors(draft, overrides);
  return draft;
}

/**
 * Цвета, которые считаются от заданных.
 *
 * Считаются только там, где человек что-то задал: нетронутая палитра остаётся
 * ровно такой, как в коде, — её пары подобраны руками и проверены скриптом
 * контраста, и заменять их расчётом было бы шагом назад.
 */
function deriveColors(draft: Palette, overrides: PaletteOverrides): void {
  if (overrides.accent !== undefined) {
    // Подпись на кнопке и кольцо фокуса — не самостоятельные цвета, а
    // следствия акцента: кольцо обязано быть заметно на том же фоне, что и он.
    draft.onAccent = readableOn(draft.accent);
    draft.focus = draft.accent;
  }
}

/**
 * Чистка того, что прочитано из хранилища или из файла копии.
 *
 * Цвет из чужого файла попадает прямо в стили: значение вроде
 * «red; position:absolute» ничего не сломает только потому, что здесь остаются
 * ровно шесть шестнадцатеричных цифр.
 */
export function sanitizeOverrides(value: unknown): PaletteOverrides {
  if (typeof value !== 'object' || value === null) return {};

  const clean: PaletteOverrides = {};
  for (const [id, hex] of Object.entries(value)) {
    if (typeof hex !== 'string' || !SLOTS_BY_ID.has(id)) continue;
    const color = normalizeHex(hex);
    if (color) clean[id] = color;
  }
  return clean;
}

export function sanitizeThemeColors(value: unknown): ThemeColorOverrides {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    light: sanitizeOverrides(source.light),
    dark: sanitizeOverrides(source.dark),
  };
}
