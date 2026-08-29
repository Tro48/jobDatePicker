/**
 * Календарная дата без времени и часового пояса.
 *
 * Всё внутри домена считается в «гражданских датах» (YYYY-MM-DD) и целых
 * «эпохальных днях». Это сознательный отказ от Date для арифметики: сложение
 * суток через миллисекунды ломается на переходах летнего времени, а график
 * 2/2 обязан оставаться 2/2 в ночь перевода часов.
 */
export type IsoDate = string;

/** Пн=1 … Вс=7 (ISO-8601). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const MS_PER_DAY = 86_400_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string): asserts value is IsoDate {
  if (!ISO_DATE_RE.test(value)) {
    throw new TypeError(`Ожидалась дата в формате YYYY-MM-DD, получено: ${value}`);
  }
}

/** Число суток от 1970-01-01. Отрицательное для более ранних дат. */
export function toEpochDay(date: IsoDate): number {
  assertIsoDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

export function fromEpochDay(epochDay: number): IsoDate {
  const date = new Date(epochDay * MS_PER_DAY);
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(date) + days);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** 1970-01-01 — четверг, отсюда сдвиг на 3. */
export function weekday(date: IsoDate): Weekday {
  return (floorMod(toEpochDay(date) + 3, 7) + 1) as Weekday;
}

export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -(weekday(date) - 1));
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Все даты месяца по порядку. month — 1..12. */
export function monthDays(year: number, month: number): IsoDate[] {
  const total = daysInMonth(year, month);
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`;
  return Array.from({ length: total }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

/**
 * Остаток, всегда неотрицательный.
 * Нужен, чтобы график разворачивался и назад во времени от даты первой смены.
 */
export function floorMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** "HH:MM" → минуты от полуночи. */
export function parseTimeToMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new TypeError(`Ожидалось время в формате HH:MM, получено: ${time}`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new RangeError(`Недопустимое время: ${time}`);
  return hours * 60 + minutes;
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const normalized = floorMod(Math.round(totalMinutes), 24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Дата из объекта Date по ЛОКАЛЬНОМУ времени.
 *
 * toISOString здесь непригоден: он отдаёт UTC, и вечером 17-го числа в Москве
 * вернул бы 17-е, а в Иркутске уже 18-е. Календарь должен показывать тот день,
 * который на часах у пользователя.
 */
export function toIsoDateLocal(date: Date): IsoDate {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Сегодняшняя дата по часам телефона. */
export function todayIso(): IsoDate {
  return toIsoDateLocal(new Date());
}

/**
 * Момент местного времени в миллисекундах эпохи: дата плюс «ЧЧ:ММ».
 *
 * Считается конструктором Date по местному времени, а не сложением
 * миллисекунд: в ночь перевода часов сутки не равны 24 часам, и арифметика по
 * эпохе увела бы будильник на час.
 */
export function localDateTimeToMillis(date: IsoDate, time: string): number {
  assertIsoDate(date);
  const minutes = parseTimeToMinutes(time);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(year, month - 1, day, Math.floor(minutes / 60), minutes % 60, 0, 0).getTime();
}

/** Клетка месячной сетки: дата и принадлежность просматриваемому месяцу. */
export interface GridDay {
  date: IsoDate;
  /** false — день соседнего месяца, показывается как контекст. */
  inMonth: boolean;
}

/** Строк в сетке всегда шесть: иначе высота прыгает при листании месяцев. */
export const GRID_ROWS = 6;

/**
 * Полная сетка месяца: 42 дня подряд от понедельника той недели, в которую
 * попало первое число. Хвосты соседних месяцев показываются, а не заменяются
 * пустотой, — так устроен привычный календарь, и по нему видно, как смены
 * переходят через границу месяца.
 */
export function monthGridDates(year: number, month: number): GridDay[] {
  const first: IsoDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const start = startOfWeek(first);
  const prefix = first.slice(0, 7);

  return Array.from({ length: GRID_ROWS * 7 }, (_, index) => {
    const date = addDays(start, index);
    return { date, inMonth: date.slice(0, 7) === prefix };
  });
}
