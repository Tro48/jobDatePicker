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
  /** Кольцо фокуса для навигации с клавиатуры и переключателей. */
  focus: string;
  danger: string;
  shifts: Record<string, ColorPair>;
}

export const lightPalette: Palette = {
  background: '#FFFFFF',
  surface: '#F4F5F7',
  surfaceElevated: '#FFFFFF',
  text: '#14161A',
  textMuted: '#5A6270',
  border: '#8A93A0',
  accent: '#1D4ED8',
  onAccent: '#FFFFFF',
  focus: '#1D4ED8',
  danger: '#B42318',
  shifts: {
    'shift.day': { surface: '#DBEAFE', on: '#1E3A8A' },
    'shift.night': { surface: '#EDE4FB', on: '#4C1D95' },
    'shift.day24': { surface: '#E0E7FF', on: '#312E81' },
    'shift.regular': { surface: '#DCFCE7', on: '#14532D' },
    'shift.short': { surface: '#CCFBF1', on: '#134E4A' },
    'shift.extra': { surface: '#FFEDD5', on: '#7C2D12' },
    'shift.vacation': { surface: '#FEF3C7', on: '#78350F' },
    'shift.sick': { surface: '#FEE2E2', on: '#7F1D1D' },
    'shift.sleep': { surface: '#E2E8F0', on: '#334155' },
    'shift.off': { surface: '#F8FAFC', on: '#475569' },
  },
};

export const darkPalette: Palette = {
  background: '#0F1115',
  surface: '#171A20',
  surfaceElevated: '#1E222A',
  text: '#E8EAED',
  textMuted: '#A0A8B4',
  border: '#69727F',
  accent: '#93B4FF',
  onAccent: '#0F1115',
  focus: '#93B4FF',
  danger: '#FF9A92',
  shifts: {
    'shift.day': { surface: '#1E3A5F', on: '#BFDBFE' },
    'shift.night': { surface: '#3B2A5C', on: '#DDD6FE' },
    'shift.day24': { surface: '#262C5C', on: '#C7D2FE' },
    'shift.regular': { surface: '#143D2A', on: '#BBF7D0' },
    'shift.short': { surface: '#0F3D38', on: '#99F6E4' },
    'shift.extra': { surface: '#4A2B12', on: '#FED7AA' },
    'shift.vacation': { surface: '#4A3410', on: '#FDE68A' },
    'shift.sick': { surface: '#4C1D1D', on: '#FECACA' },
    'shift.sleep': { surface: '#262B33', on: '#CBD5E1' },
    'shift.off': { surface: '#14171C', on: '#9AA3AF' },
  },
};

export const palettes = { light: lightPalette, dark: darkPalette };
