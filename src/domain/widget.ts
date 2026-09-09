import { monthGridDates } from './date.ts';
import type { IsoDate } from './date.ts';
import { resolveDay } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import { formatMonthTitle, formatTimeRange } from './format.ts';
import type { ShiftType } from './types.ts';

/**
 * Снимок графика для виджета на главном экране.
 *
 * Виджет не ходит ни в MMKV, ни в JS: рисует его процесс лаунчера, когда
 * приложение выгружено из памяти, а движок графика живёт в JS-рантайме,
 * которого в этот момент нет. Поэтому приложение выкладывает наружу уже
 * посчитанный снимок, а виджет только раскладывает готовые буквы по клеткам.
 *
 * По той же причине снимок держит три месяца вперёд и не содержит ни слова
 * «сегодня»: между двумя запусками приложения проходят недели, и сегодняшний
 * день виджет находит сам — по часам телефона, среди дат снимка.
 */

/** Версия формата. Виджет обязан отказаться от снимка, который не понимает. */
export const WIDGET_SNAPSHOT_VERSION = 1;

/** Сколько месяцев выкладывается вперёд. */
export const WIDGET_MONTHS = 3;

/** Пара цветов смены: заливка клетки и подпись поверх неё. */
export interface WidgetColorPair {
  surface: string;
  on: string;
  /**
   * Заливка уже отработанной смены — та же, что в календаре приложения:
   * приглушённая смесью с фоном. Считается здесь, а не в виджете, чтобы
   * приглушение было одинаковым в обоих местах.
   */
  faded: string;
}

/** Смена в снимке. Дни ссылаются на неё индексом: названия повторяются десятки раз. */
export interface WidgetShift {
  /** Буква-маркер в клетке. */
  badge: string;
  /** Полное название — виджет ставит его строкой над сеткой. */
  name: string;
  /** Рабочая ли смена: виджет выделяет такие клетки. */
  work: boolean;
  /** «08:00 – 20:00» или пусто у нерабочих. */
  time: string;
  /**
   * Готовые цвета для обеих тем.
   *
   * Именно готовые, а не токен палитры: иначе палитру пришлось бы повторить на
   * Kotlin, и она разошлась бы с приложением на первой же правке цвета. Тему
   * виджет выбирает сам — какая сейчас в системе, знает только он.
   */
  light: WidgetColorPair;
  dark: WidgetColorPair;
}

/**
 * Откуда снимок берёт цвета смены. Передаётся снаружи: домен палитры не знает.
 *
 * Спрашивается по самой смене, а не по её токену: у смены может стоять свой
 * цвет, и тогда палитру для неё не смотрят вовсе.
 */
export type WidgetColorLookup = (shiftType: ShiftType) => {
  light: WidgetColorPair;
  dark: WidgetColorPair;
};

export interface WidgetDay {
  date: IsoDate;
  /** Индекс в shifts. −1 — день не разложился, клетка остаётся пустой. */
  shift: number;
  /** false — хвост соседнего месяца: рисуется приглушённо. */
  inMonth: boolean;
}

export interface WidgetMonth {
  /** «Сентябрь 2026» — заголовок сетки. */
  title: string;
  /** «YYYY-MM»: по нему виджет ищет месяц, в который попал сегодняшний день. */
  period: string;
  /** Полная сетка месяца: недели целиком, от понедельника. */
  days: WidgetDay[];
}

/** Тема оформления, выбранная в приложении. */
export type WidgetAppearance = 'system' | 'light' | 'dark';

export interface WidgetSnapshot {
  version: number;
  /**
   * Тема из настроек приложения, а не системная.
   *
   * Виджет обязан выглядеть так же, как приложение: человек, поставивший
   * тёмную тему при светлой системе, не должен получить светлый виджет рядом с
   * тёмным приложением. 'system' — следовать системе, это виджет умеет сам.
   */
  appearance: WidgetAppearance;
  /** Когда снимок сделан. Виджету не нужно — нужно, когда что-то пошло не так. */
  builtOn: IsoDate;
  /** Имя работы. Пусто — работа одна, и подписывать её незачем. */
  trackName: string;
  shifts: WidgetShift[];
  months: WidgetMonth[];
}

/** Снимок без графика: виджет покажет «график не выбран». */
export function emptyWidgetSnapshot(
  builtOn: IsoDate,
  appearance: WidgetAppearance = 'system',
): WidgetSnapshot {
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    appearance,
    builtOn,
    trackName: '',
    shifts: [],
    months: [],
  };
}

/**
 * Что виджет покажет ближайшие три месяца.
 *
 * Раскладывается по той же сетке, что и календарь в приложении: недели
 * целиком, хвосты соседних месяцев на месте. Иначе виджет и приложение
 * показывали бы один месяц по-разному, и это заметно с первого взгляда.
 */
export function buildWidgetSnapshot(
  context: ScheduleContext | null,
  options: {
    today: IsoDate;
    trackName?: string;
    appearance?: WidgetAppearance;
    colorsOf: WidgetColorLookup;
  },
): WidgetSnapshot {
  const { today, trackName = '', appearance = 'system', colorsOf } = options;
  if (!context) return emptyWidgetSnapshot(today, appearance);

  const shifts: WidgetShift[] = [];
  const indexOf = new Map<string, number>();

  const months: WidgetMonth[] = [];
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));

  for (let step = 0; step < WIDGET_MONTHS; step += 1) {
    const days = monthGridDates(year, month).map((cell) => {
      // Разложить может не получиться только у сломанного графика — его ловит
      // подъём состояния. Но ронять из-за одной клетки весь снимок нельзя:
      // без него виджет останется со вчерашним месяцем навсегда.
      try {
        const day = resolveDay(context, cell.date);
        const type = day.shiftType;
        let index = indexOf.get(type.id);

        if (index === undefined) {
          index = shifts.length;
          indexOf.set(type.id, index);
          shifts.push({
            badge: type.badge,
            name: type.name,
            work: type.kind === 'work',
            time: type.time ? formatTimeRange(type.time.start, type.time.end) : '',
            ...colorsOf(type),
          });
        }

        return { date: cell.date, shift: index, inMonth: cell.inMonth };
      } catch {
        return { date: cell.date, shift: -1, inMonth: cell.inMonth };
      }
    });

    months.push({
      title: formatMonthTitle(year, month),
      period: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
      days,
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    appearance,
    builtOn: today,
    trackName,
    shifts,
    months,
  };
}

/**
 * Одинаковы ли снимки по существу.
 *
 * Запись в SharedPreferences — это ещё и перерисовка всех виджетов на главном
 * экране, а снимок пересобирается на каждое изменение состояния, включая те,
 * до которых виджету дела нет: сумма выплаты, прочитанное «что нового», тема
 * оформления. Дата сборки из сравнения исключена намеренно — она меняется
 * каждый день, а содержимое при этом то же.
 */
export function sameWidgetSnapshot(a: WidgetSnapshot, b: WidgetSnapshot): boolean {
  return (
    a.version === b.version &&
    a.appearance === b.appearance &&
    a.trackName === b.trackName &&
    JSON.stringify(a.shifts) === JSON.stringify(b.shifts) &&
    JSON.stringify(a.months) === JSON.stringify(b.months)
  );
}
