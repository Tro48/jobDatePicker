/**
 * Палитра приложения. Каждая смена — пара «фон + текст поверх него», а не один
 * цвет: только так можно гарантировать контраст подписи в клетке календаря в
 * обеих темах. Контраст проверяется скриптом scripts/check-contrast.ts.
 */
export interface ColorPair {
  /** Заливка клетки календаря. */
  surface: string;
  /** Цвет буквы-маркера и подписи поверх заливки. */
  on: string;
}

export interface Palette {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  /** Границы интерактивных элементов: клетки календаря, поля, кнопки. */
  border: string;
  accent: string;
  onAccent: string;
  /**
   * Переработка: цифра «+2» в клетке календаря. Читается поверх любой заливки
   * смены, а не только поверх фона, — поэтому отдельный токен, а не оттенок
   * акцента. Недоработка берёт danger: минус в углу клетки и есть сигнал
   * «недобрал», отдельного цвета для него заводить незачем.
   */
  positive: string;
  /** Кольцо фокуса для навигации с клавиатуры и переключателей. */
  focus: string;
  danger: string;
  /**
   * Заливка выделенного дня: так помечаются совпавшие выходные, когда в списке
   * под календарём выбран человек или группа. Отдельная пара, а не оттенок
   * акцента: акцент уже значит «выбрано» на рамке клетки, и залитая им клетка
   * читалась бы как выбранная мышью.
   *
   * Цвет заменяет заливку смены, а не ложится поверх: смысл дня при этом
   * остаётся на букве-маркере, а совпавшие выходные — всегда нерабочие дни.
   */
  highlight: ColorPair;
  /**
   * Будний день базового календаря: месяцы, на которые графика ещё нет.
   *
   * Своя пара, а не цвет смены: смены человек тогда не работал, и красить эти
   * дни «рабочим днём» значило бы приписать ему выходы, которых не было.
   * Выходные базового календаря берут обычный цвет выходного из справочника —
   * суббота остаётся субботой и без графика.
   *
   * Оттенок тёплый, а не серо-синий: от холодного выходного он отличается
   * тоном, а не яркостью, которой в этом углу палитры уже не осталось. Одного
   * тона мало — у выходного есть ещё и буква-маркер, а у буднего её нет.
   */
  baseWeekday: ColorPair;
  shifts: Record<string, ColorPair>;
}

export const lightPalette: Palette = {
  background: '#FFFFFF',
  surface: '#E9ECF1',
  surfaceElevated: '#FFFFFF',
  text: '#14161A',
  textMuted: '#4F5765',
  border: '#79828F',
  accent: '#1D4ED8',
  onAccent: '#FFFFFF',
  positive: '#14532D',
  focus: '#1D4ED8',
  danger: '#B42318',
  highlight: { surface: '#FBCFE8', on: '#831843' },
  baseWeekday: { surface: '#E9E3DA', on: '#3E3830' },
  shifts: {
    'shift.day': { surface: '#C3DAFD', on: '#1E3A8A' },
    'shift.night': { surface: '#DDD0F7', on: '#4C1D95' },
    'shift.day24': { surface: '#CBD6FC', on: '#312E81' },
    'shift.regular': { surface: '#B2ECC7', on: '#14532D' },
    'shift.short': { surface: '#A2E9D9', on: '#134E4A' },
    'shift.extra': { surface: '#FFD3A3', on: '#7C2D12' },
    'shift.vacation': { surface: '#FAE188', on: '#78350F' },
    'shift.sick': { surface: '#FCCBCB', on: '#7F1D1D' },
    'shift.sleep': { surface: '#D3DBE6', on: '#334155' },
    'shift.off': { surface: '#E4EAF2', on: '#475569' },
  },
};

export const darkPalette: Palette = {
  background: '#0F1115',
  surface: '#1B1F27',
  surfaceElevated: '#242A33',
  text: '#E8EAED',
  textMuted: '#A6AEBA',
  border: '#79838F',
  accent: '#93B4FF',
  onAccent: '#0F1115',
  positive: '#86EFAC',
  focus: '#93B4FF',
  danger: '#FF9A92',
  highlight: { surface: '#6D1E45', on: '#FBCFE8' },
  baseWeekday: { surface: '#2A2722', on: '#C3BCB1' },
  shifts: {
    'shift.day': { surface: '#1E3A5F', on: '#BFDBFE' },
    'shift.night': { surface: '#3B2A5C', on: '#DDD6FE' },
    'shift.day24': { surface: '#262C5C', on: '#C7D2FE' },
    'shift.regular': { surface: '#143D2A', on: '#BBF7D0' },
    'shift.short': { surface: '#0F3D38', on: '#99F6E4' },
    'shift.extra': { surface: '#4A2B12', on: '#FED7AA' },
    'shift.vacation': { surface: '#4A3410', on: '#FDE68A' },
    'shift.sick': { surface: '#4C1D1D', on: '#FECACA' },
    'shift.sleep': { surface: '#343B47', on: '#CBD5E1' },
    'shift.off': { surface: '#272D38', on: '#A9B2BE' },
  },
};

export const palettes = { light: lightPalette, dark: darkPalette };

/**
 * Как называется каждый цвет смены.
 *
 * Свободного выбора цвета в приложении нет намеренно: каждая пара «заливка +
 * подпись» проверена скриптом контраста в обеих темах, а цвет, выбранный
 * пипеткой, проверить нечем — и первая же смена «жёлтым по белому» стала бы
 * нечитаемой.
 *
 * Название — про оттенок, а не про смысл: одним и тем же синим человек может
 * пометить и дневную смену, и учёбу. Оно озвучивается скринридером, потому что
 * кружок цвета сам по себе не говорит ничего. Сам список токенов и их порядок
 * задаёт домен: индекс токена уезжает в QR-код.
 */
export const SHIFT_COLOR_NAMES: Readonly<Record<string, string>> = {
  'shift.day': 'Синий',
  'shift.night': 'Фиолетовый',
  'shift.day24': 'Индиго',
  'shift.regular': 'Зелёный',
  'shift.short': 'Бирюзовый',
  'shift.extra': 'Оранжевый',
  'shift.vacation': 'Жёлтый',
  'shift.sick': 'Красный',
  'shift.sleep': 'Серый',
  'shift.off': 'Светло-серый',
};

/**
 * Насколько заливка уже отработанной смены уходит в нейтральный серый.
 *
 * Приглушается только фон клетки, подпись остаётся исходной: прозрачность
 * всего элемента уронила бы контраст буквы ниже проверенного порога, а
 * смешение с серым его, наоборот, поднимает — заливка отходит от подписи, а
 * не приближается к ней.
 */
export const WORKED_FADE = 0.65;

/** Доля цвета `to` в цвете `from`: 0 — только from, 1 — только to. */
export function mixHex(from: string, to: string, amount: number): string {
  const channels = [0, 2, 4].map((offset) => {
    const a = parseInt(from.slice(1 + offset, 3 + offset), 16);
    const b = parseInt(to.slice(1 + offset, 3 + offset), 16);
    return Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`.toUpperCase();
}

/** Пара цветов для отработанной смены: заливка приглушена, подпись не тронута. */
export function fadedShiftPair(pair: ColorPair, neutral: string): ColorPair {
  return { surface: mixHex(pair.surface, neutral, WORKED_FADE), on: pair.on };
}
