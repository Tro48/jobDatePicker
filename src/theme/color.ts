/**
 * Цвет как значение: разбор строки, перевод в HSV и обратно, контраст по
 * WCAG 2.1.
 *
 * Отдельный модуль без React и без палитры: этими же функциями пользуются и
 * экран выбора цвета, и скрипт проверки контраста в CI. Считать контраст в
 * двух местах разными формулами нельзя — тогда предупреждение на экране и
 * падение сборки перестанут совпадать.
 */

/** Что принимается за цвет: «#A1B2C3», «a1b2c3», «#ABC» и то же с пробелами. */
const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Приведение набранного к «#RRGGBB» в верхнем регистре или null, если это не
 * цвет.
 *
 * Возвращает null, а не бросает: строку набирают по букве, и половина набора —
 * обычное состояние поля, а не ошибка.
 */
export function normalizeHex(input: string): string | null {
  const match = HEX_PATTERN.exec(input.trim());
  if (!match) return null;

  const digits = match[1];
  // Короткая запись разворачивается в полную: «#ABC» — это «#AABBCC».
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;

  return `#${full.toUpperCase()}`;
}

export function isHex(input: string): boolean {
  return normalizeHex(input) !== null;
}

/** Красный, зелёный и синий каналы 0..255. Цвет обязан быть нормализованным. */
export function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function channelLuminance(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Порог WCAG 2.1 AA для обычного текста. */
export const TEXT_CONTRAST = 4.5;

/** Контраст пары цветов по WCAG 2.1: от 1 (одинаковые) до 21 (чёрный с белым). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Цвет в тоне, насыщенности и яркости.
 *
 * Именно HSV, а не HSL: ползунки «насыщенность» и «яркость» в HSV независимы —
 * поднимая яркость, человек не теряет набранный цвет, — а в HSL светлота на
 * краях диапазона вымывает тон в белый и чёрный, и ползунок насыщенности там
 * перестаёт что-либо менять.
 */
export interface Hsv {
  /** Тон, 0..360. */
  h: number;
  /** Насыщенность, 0..100. */
  s: number;
  /** Яркость, 0..100. */
  v: number;
}

/**
 * Значения дробные и не округляются: округление здесь теряет цвет. У #1D4ED8
 * тон 224.3°, и целые 224° — это уже #1C4ED9. Округлять можно только то, что
 * показывается человеку, — этим и занимается экран.
 */

export function hexToHsv(hex: string): Hsv {
  const [red, green, blue] = channels(hex).map((value) => value / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const span = max - min;

  // Серый: тона у него нет вовсе, и любой выбранный был бы выдумкой. Ноль —
  // не «красный», а «тон не важен»: ползунок тона всё равно ничего не меняет,
  // пока насыщенность нулевая.
  let hue = 0;
  if (span > 0) {
    if (max === red) hue = ((green - blue) / span) % 6;
    else if (max === green) hue = (blue - red) / span + 2;
    else hue = (red - green) / span + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return {
    h: hue,
    s: (max === 0 ? 0 : span / max) * 100,
    v: max * 100,
  };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;

  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const shift = value - chroma;

  const sector = Math.floor(hue / 60) % 6;
  const [red, green, blue] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ] as const
  )[sector];

  const hex = [red, green, blue]
    .map((channel) =>
      Math.round((channel + shift) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

  return `#${hex.toUpperCase()}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Чёрный или белый — тот, что читается на этом фоне лучше.
 *
 * Нужен там, где цвет текста нельзя взять из палитры, потому что палитру
 * только что мог испортить сам человек: кнопка сброса оформления обязана
 * остаться видимой на любом заданном фоне, иначе выхода из неудачной темы не
 * будет.
 */
export function readableOn(background: string): string {
  return contrastRatio('#000000', background) >= contrastRatio('#FFFFFF', background)
    ? '#000000'
    : '#FFFFFF';
}

/**
 * Цвет надписи поверх этой заливки — в её же тоне.
 *
 * Нужен, чтобы цвет буквы-маркера в клетке календаря не приходилось задавать
 * руками: человек выбирает заливку смены, а что на ней будет видно, считается
 * само. Отдельный вопрос «а теперь выберите цвет буквы» — это ещё одно поле в
 * списке и ещё один способ получить нечитаемую клетку.
 *
 * Сначала берётся сильно затемнённый или высветленный тон самой заливки: так
 * подпись остаётся частью цвета, а не выглядит наклейкой. Если тон контраста
 * не даёт — у серединных серых его взять неоткуда, — подпись становится
 * чёрной или белой, чем бы ни пришлось пожертвовать в красоте.
 */
export function markerOn(background: string): string {
  const dark = mixHex(background, '#000000', 0.78);
  const light = mixHex(background, '#FFFFFF', 0.88);
  const tinted = contrastRatio(dark, background) >= contrastRatio(light, background) ? dark : light;

  return contrastRatio(tinted, background) >= TEXT_CONTRAST ? tinted : readableOn(background);
}

/** Доля цвета `to` в цвете `from`: 0 — только from, 1 — только to. */
export function mixHex(from: string, to: string, amount: number): string {
  const source = channels(from);
  const target = channels(to);
  const mixed = source.map((value, index) =>
    Math.round(value + (target[index] - value) * amount)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${mixed.join('')}`.toUpperCase();
}
