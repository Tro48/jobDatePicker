/**
 * Какие цвета человек может задать сам в своей теме.
 *
 * Тема — это полная палитра со своим именем: она снимается копией со светлой
 * или тёмной и дальше живёт сама. Слот здесь — адрес одного цвета в палитре, и
 * из этого списка собираются и экран правки темы, и запись цвета: добавить
 * цвет в палитру и забыть про экран так нельзя, это ловит тест.
 *
 * Слот заводится не на каждый цвет. Всё, что выводится из заданного, считается
 * само (см. paintSlot): цвет буквы на заливке, подпись на акценте и кольцо
 * фокуса. Спрашивать их отдельно значило бы удвоить список ради вопросов, на
 * которые есть один разумный ответ.
 */
import { markerOn, normalizeHex, readableOn } from './color.ts';
import { darkPalette, lightPalette } from './palette.ts';
import type { ColorPair, Palette } from './palette.ts';

export type SchemeName = 'light' | 'dark';

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

/**
 * Все настраиваемые цвета темы в порядке показа.
 *
 * Цветов смен здесь нет намеренно: смену красят в её собственном редакторе,
 * где рядом стоит и её буква, и время, и надбавка. Спрашивать «каким сделать
 * синий» в отрыве от смены, которая им покрашена, — это вопрос не о том.
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
 * Палитра с заданным цветом одного слота.
 *
 * Возвращает копию: палитра темы лежит в хранилище, и править её на месте
 * значило бы менять состояние мимо zustand — экраны об этом не узнают.
 *
 * Незнакомый слот и неправильный цвет молча ничего не меняют: первое бывает
 * после отката приложения на прошлую версию, второе — пока код набирают по
 * букве.
 */
export function paintSlot(palette: Palette, slotId: string, hex: string): Palette {
  const slot = SLOTS_BY_ID.get(slotId);
  const color = normalizeHex(hex);
  if (!slot || !color) return palette;

  const draft = clonePalette(palette);
  slot.write(draft, color);

  if (slotId === 'accent') {
    // Подпись на кнопке и кольцо фокуса — не самостоятельные цвета, а
    // следствия акцента: кольцо обязано быть заметно на том же фоне, что и он.
    draft.onAccent = readableOn(draft.accent);
    draft.focus = draft.accent;
  }

  return draft;
}

/** Палитра, с которой начинается новая тема. Копия, а не ссылка на код. */
export function paletteOf(base: SchemeName): Palette {
  return clonePalette(base === 'dark' ? darkPalette : lightPalette);
}

/**
 * Чистка палитры, прочитанной из хранилища или из файла копии.
 *
 * Цвет из чужого файла попадает прямо в стили: значение вроде
 * «red; position:absolute» ничего не сломает только потому, что здесь остаются
 * ровно шесть шестнадцатеричных цифр. Всё, чего в снимке не хватает или что
 * цветом не является, берётся из палитры-основы: тема с дырой вместо фона
 * уронила бы каждый экран.
 *
 * Читается форма палитры, а не список слотов, и ничего не выводится заново:
 * цвет буквы на заливке посчитан при записи, а в палитрах из кода он подобран
 * руками — пересчитать его здесь значило бы менять тему при каждом чтении.
 */
export function sanitizePalette(value: unknown, base: SchemeName = 'light'): Palette {
  const source = asObject(value);
  const clean = paletteOf(base);

  for (const [key, current] of Object.entries(clean)) {
    if (typeof current !== 'string') continue;
    const color = normalizeHex(String(source[key] ?? ''));
    if (color) clean[key as SoloKey] = color;
  }

  clean.highlight = cleanPair(source.highlight, clean.highlight);
  clean.baseWeekday = cleanPair(source.baseWeekday, clean.baseWeekday);

  const shifts = asObject(source.shifts);
  for (const token of Object.keys(clean.shifts)) {
    clean.shifts[token] = cleanPair(shifts[token], clean.shifts[token]);
  }

  return clean;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Пара «заливка + подпись»: каждый цвет по отдельности либо годен, либо из основы. */
function cleanPair(value: unknown, fallback: ColorPair): ColorPair {
  const source = asObject(value);
  return {
    surface: normalizeHex(String(source.surface ?? '')) ?? fallback.surface,
    on: normalizeHex(String(source.on ?? '')) ?? fallback.on,
  };
}
