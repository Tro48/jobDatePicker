import { addDays, weekday } from './date.ts';
import type { IsoDate } from './date.ts';

/**
 * Производственный календарь РФ.
 *
 * Чистые данные и чистый расчёт: ни хранилища, ни сети. Список праздников
 * задан статьёй 112 ТК РФ и не меняется годами, а перенос выходного, попавшего
 * на субботу или воскресенье, там же и описан — значит, считается, а не
 * переписывается руками каждый декабрь.
 *
 * Чего расчёт не знает — уточнений из ежегодного постановления Правительства:
 * длинных майских, рабочих суббот и того, куда именно уехали выходные из
 * новогодних каникул. Статья 112 отдаёт эти два дня на усмотрение
 * Правительства, вывести их неоткуда. Они дописываются в DECREE_CORRECTIONS
 * по мере выхода постановлений и уезжают к пользователю по воздуху, без
 * сборки.
 */

export interface HolidayCalendar {
  /** Название праздника или перенесённого выходного; null — обычный день. */
  nameOf: (date: IsoDate) => string | null;
  /** Официально нерабочий день: праздник или перенесённый на него выходной. */
  isNonWorking: (date: IsoDate) => boolean;
  /** Суббота, ставшая рабочей по переносу. */
  isWorkingWeekend: (date: IsoDate) => boolean;
}

/** Нерабочие праздничные дни по статье 112 ТК РФ. Месяц и день — постоянные. */
const FIXED_HOLIDAYS: ReadonlyArray<{ month: number; day: number; name: string }> = [
  { month: 1, day: 1, name: 'Новогодние каникулы' },
  { month: 1, day: 2, name: 'Новогодние каникулы' },
  { month: 1, day: 3, name: 'Новогодние каникулы' },
  { month: 1, day: 4, name: 'Новогодние каникулы' },
  { month: 1, day: 5, name: 'Новогодние каникулы' },
  { month: 1, day: 6, name: 'Новогодние каникулы' },
  { month: 1, day: 7, name: 'Рождество Христово' },
  { month: 1, day: 8, name: 'Новогодние каникулы' },
  { month: 2, day: 23, name: 'День защитника Отечества' },
  { month: 3, day: 8, name: 'Международный женский день' },
  { month: 5, day: 1, name: 'Праздник Весны и Труда' },
  { month: 5, day: 9, name: 'День Победы' },
  { month: 6, day: 12, name: 'День России' },
  { month: 11, day: 4, name: 'День народного единства' },
];

/**
 * Уточнения из постановления Правительства на конкретный год.
 *
 * Пусто до тех пор, пока постановление не вышло: выдуманная дата хуже
 * отсутствующей — человек поверит календарю и не выйдет на работу. Всё, что
 * считается по закону, считается и без этой таблицы.
 */
interface DecreeCorrection {
  /** Нерабочие дни сверх посчитанных: длинные майские и уехавшие из января. */
  daysOff?: ReadonlyArray<{ date: IsoDate; name: string }>;
  /** Субботы, ставшие рабочими: выходной с них перенесён на другой день. */
  workingWeekends?: readonly IsoDate[];
}

const DECREE_CORRECTIONS: Readonly<Record<number, DecreeCorrection>> = {};

/** Суббота и воскресенье. Пятидневка отдыхает по ним всегда. */
function isWeekend(date: IsoDate): boolean {
  return weekday(date) >= 6;
}

function isoOf(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Все нерабочие дни года: сами праздники плюс выходные, перенесённые с
 * праздников, попавших на субботу или воскресенье.
 *
 * Январские праздники в переносе не участвуют: статья 112 выводит их из общего
 * правила и отдаёт Правительству, поэтому они приезжают только из
 * DECREE_CORRECTIONS.
 */
function buildYear(year: number): Map<IsoDate, string> {
  const days = new Map<IsoDate, string>();

  for (const holiday of FIXED_HOLIDAYS) {
    days.set(isoOf(year, holiday.month, holiday.day), holiday.name);
  }

  for (const holiday of FIXED_HOLIDAYS) {
    if (holiday.month === 1) continue;
    const date = isoOf(year, holiday.month, holiday.day);
    if (!isWeekend(date)) continue;

    // Выходной уезжает на ближайший день, который ещё не занят ни выходными,
    // ни другим праздником: 9 мая в субботу и 10-е в воскресенье дают
    // нерабочий понедельник, а не второй выходной поверх воскресенья.
    let moved = addDays(date, 1);
    while (isWeekend(moved) || days.has(moved)) moved = addDays(moved, 1);
    days.set(moved, `Перенос выходного с ${holiday.day} ${MONTHS_GENITIVE[holiday.month - 1]}`);
  }

  for (const extra of DECREE_CORRECTIONS[year]?.daysOff ?? []) {
    days.set(extra.date, extra.name);
  }

  return days;
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/**
 * Год считается один раз и запоминается: календарь спрашивают на каждую клетку
 * сетки, а это сорок с лишним вопросов на один месяц и три месяца в пейджере.
 */
const cache = new Map<number, Map<IsoDate, string>>();

function yearOf(date: IsoDate): Map<IsoDate, string> {
  const year = Number(date.slice(0, 4));
  const cached = cache.get(year);
  if (cached) return cached;

  const built = buildYear(year);
  cache.set(year, built);
  return built;
}

export const RU_HOLIDAYS: HolidayCalendar = {
  nameOf: (date) => {
    const name = yearOf(date).get(date);
    if (name) return name;
    return workingWeekends(date).includes(date) ? 'Рабочая суббота по переносу' : null;
  },
  isNonWorking: (date) => yearOf(date).has(date),
  isWorkingWeekend: (date) => workingWeekends(date).includes(date),
};

function workingWeekends(date: IsoDate): readonly IsoDate[] {
  return DECREE_CORRECTIONS[Number(date.slice(0, 4))]?.workingWeekends ?? [];
}
