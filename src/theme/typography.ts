/**
 * Размеры и отступы.
 *
 * Числа задаются в dp и НЕ фиксируют высоту текстовых блоков: системное
 * масштабирование шрифта (allowFontScaling) нигде не отключается, поэтому при
 * 200% текст должен переносить строку, а не обрезаться. Везде, где нужен
 * размер контейнера, используется minHeight, а не height.
 */
export const typography = {
  display: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Буква-маркер в клетке календаря. */
  badge: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
} as const;

export type TypographyVariant = keyof typeof typography;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/** Минимальный размер зоны нажатия по рекомендациям Android. */
export const MIN_TOUCH_TARGET = 48;

/** Толщина кольца фокуса и выделения выбранного элемента. */
export const FOCUS_RING_WIDTH = 2;
