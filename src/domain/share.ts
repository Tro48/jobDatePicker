import { deflateSync, inflateSync } from 'fflate';
import {
  ByteReadError,
  ByteReader,
  ByteWriter,
  decodeBase64Url,
  encodeBase64Url,
} from './bytes.ts';
import { fromEpochDay, toEpochDay } from './date.ts';
import type { IsoDate, Weekday } from './date.ts';
import { FALLBACK_COLOR_TOKEN, SHIFT_COLOR_TOKENS, sanitizeShiftType } from './shifts.ts';
import { PAYMENT_KINDS } from './payments.ts';
import { notesByDate } from './notes.ts';
import type {
  DayNote,
  DayOverride,
  PaymentKind,
  PaymentRecord,
  SchedulePattern,
  ShiftType,
} from './types.ts';

/**
 * Обмен графиком между телефонами: один формат на три входа.
 *
 * Порядок операций — упаковать, сжать, закодировать. Кодирование объём не
 * уменьшает, а увеличивает, поэтому оно идёт последним, и вся экономия
 * достаётся первым двум шагам.
 *
 * Один и тот же разбор обслуживает файл, свой сканер и ссылку из системной
 * камеры: три входа, одна чистая функция и один экран предпросмотра. Иначе
 * форматы разошлись бы уже на втором.
 *
 * fflate, а не своё сжатие: deflate в чистом JS, без нативной части, и в
 * обычном Node он тоже работает — значит, формат гоняется тестами целиком.
 */

/** Первый байт упакованных данных. Меняется при любом изменении раскладки. */
export const SHARE_FORMAT_VERSION = 1;

export const SHARE_URL_SCHEME = 'jobdatepicker://track';

/**
 * Предел полезных данных в QR-коде.
 *
 * Не предел ёмкости: в двоичном режиме при коррекции L туда влезает 2953
 * байта, но такой код — это 177 на 177 модулей, и снимается он с экрана одного
 * телефона камерой другого плохо. Целимся в предел читаемости — примерно
 * двадцатая версия кода, которая читается уверенно.
 *
 * Не влезло — приложение говорит об этом словами и предлагает файл, а не
 * рисует нечитаемый квадрат.
 */
export const QR_PAYLOAD_LIMIT = 1000;

/** Что уезжает на другой телефон. */
export interface SharedTrack {
  /** Имя дорожки: «Аня», «Склад». Признак «мои часы» не передаётся — его
   * выбирает принимающая сторона на экране предпросмотра. */
  name: string;
  /** Справочник смен целиком: без него раскладку нечем разложить. */
  shiftTypes: ShiftType[];
  pattern: SchedulePattern;
  anchorDate: IsoDate;
  /** Ручные правки. Заметки внутри них включаются отдельно. */
  overrides: SharedOverride[];
  /** Выплаты. Пусто, если их решили не отдавать. */
  payments: Array<Omit<PaymentRecord, 'id' | 'trackId'>>;
}

/**
 * Правка дня в коде графика.
 *
 * Заметки уезжают внутри неё одним текстом, хотя в приложении они давно живут
 * отдельно от правок: формат старше этого разделения, и ломать совместимость
 * ради него незачем. День с одними заметками едет правкой без смены и часов —
 * принимающая сторона разбирает её обратно в заметки.
 *
 * Напоминания не передаются: время звонка — дело телефона, на котором заметку
 * завели.
 */
export interface SharedOverride extends DayOverride {
  /** Заметки этого дня, склеенные переводом строки. */
  note?: string;
}

/** Что именно кладём в код или файл. */
export interface ShareOptions {
  /** Заметки к дням: произвольный текст, который может занять и десять килобайт. */
  notes: boolean;
  /** История выплат: это суммы зарплат, и фото QR легко переслать дальше. */
  payments: boolean;
}

export const DEFAULT_SHARE_OPTIONS: ShareOptions = { notes: false, payments: false };

/** Разобрать не удалось. kind отличает «нужна новая версия» от «код испорчен». */
export class ShareFormatError extends Error {
  /** Поле объявлено отдельно, а не параметром конструктора: доменные тесты
   * бегут в голом Node, а он такого сокращения не понимает. */
  readonly kind: 'version' | 'corrupt';

  constructor(kind: 'version' | 'corrupt', message: string) {
    super(message);
    this.name = 'ShareFormatError';
    this.kind = kind;
  }
}

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

const PATTERN_CYCLE = 0;
const PATTERN_WEEKLY = 1;

/**
 * Надбавка хранится одним байтом: 1,2 — это 24.
 *
 * Делением, а не умножением на 0,05: 24 × 0,05 в двоичной плавающей точке
 * даёт 1,2000000000000002, и надбавка, вернувшаяся с другого телефона,
 * переставала совпадать с исходной.
 */
const RATE_STEPS_PER_UNIT = 20;

/** Перерыв хранится шагами по пять минут: 60 минут — это 12. */
const BREAK_STEP = 5;

/**
 * Что из дорожки вообще можно отдать.
 *
 * Смены берутся не все подряд, а только те, что реально встречаются в графике
 * и в правках: отдавать вместе с графиком весь чужой справочник незачем, а в
 * QR-коде каждый лишний байт виден.
 */
export function buildSharedTrack(
  source: {
    name: string;
    shiftTypes: ShiftType[];
    pattern: SchedulePattern;
    anchorDate: IsoDate;
    overrides: DayOverride[];
    /** Заметки всех дней: в код попадают только при включённой галочке. */
    notes: DayNote[];
    payments: Array<Omit<PaymentRecord, 'id' | 'trackId'>>;
  },
  options: ShareOptions = DEFAULT_SHARE_OPTIONS,
): SharedTrack {
  const used = new Set<string>(patternIds(source.pattern));
  for (const override of source.overrides) {
    if (override.shiftTypeId) used.add(override.shiftTypeId);
  }

  /** Правки по датам: заметки дописываются в ту же запись, что и смена дня. */
  const packed = new Map<IsoDate, SharedOverride>();

  for (const override of source.overrides) {
    // Правка на смену, которой в коде не будет, теряет смысл; правка без
    // смены едет, только если в ней есть часы.
    const usable =
      override.shiftTypeId === undefined
        ? override.workedMinutesOverride !== undefined
        : used.has(override.shiftTypeId);
    if (usable) packed.set(override.date, { ...override });
  }

  if (options.notes) {
    for (const [date, notes] of notesByDate(source.notes)) {
      const text = notes.map((note) => note.text).join('\n');
      packed.set(date, { ...(packed.get(date) ?? { date }), note: text });
    }
  }

  return {
    name: source.name,
    shiftTypes: source.shiftTypes.filter((type) => used.has(type.id)),
    pattern: source.pattern,
    anchorDate: source.anchorDate,
    overrides: [...packed.values()],
    payments: options.payments ? source.payments : [],
  };
}

function patternIds(pattern: SchedulePattern): string[] {
  return pattern.kind === 'cycle'
    ? pattern.slots
    : pattern.weeks.flatMap((week) => WEEKDAYS.map((day) => week[day]));
}

export function packTrack(share: SharedTrack): Uint8Array {
  const writer = new ByteWriter();
  const index = new Map(share.shiftTypes.map((type, position) => [type.id, position]));

  writer.text(share.name);

  writer.varint(share.shiftTypes.length);
  for (const type of share.shiftTypes) {
    const hasTime = type.kind === 'work' && type.time !== undefined;
    writer.u8(
      (type.kind === 'work' ? 1 : 0) | (type.multiDay === true ? 2 : 0) | (hasTime ? 4 : 0),
    );
    writer.text(type.name);
    writer.text(type.badge);
    writer.u8(colorIndex(type.colorToken));
    writer.u8(Math.round(type.rateMultiplier * RATE_STEPS_PER_UNIT));
    if (hasTime && type.time) {
      writer.u16(minutesOfDay(type.time.start));
      writer.u16(minutesOfDay(type.time.end));
      writer.u8(Math.round(type.time.unpaidBreakMinutes / BREAK_STEP));
    }
  }

  if (share.pattern.kind === 'cycle') {
    writer.u8(PATTERN_CYCLE);
    writer.varint(share.pattern.slots.length);
    for (const id of share.pattern.slots) writer.u8(index.get(id) ?? 0);
  } else {
    writer.u8(PATTERN_WEEKLY);
    writer.u8(share.pattern.weeks.length);
    for (const week of share.pattern.weeks) {
      for (const day of WEEKDAYS) writer.u8(index.get(week[day]) ?? 0);
    }
  }

  const anchorDay = toEpochDay(share.anchorDate);
  writer.varint(anchorDay);

  // Правки идут по возрастанию даты, и каждая хранит расстояние до предыдущей:
  // «2026-03-14» это десять байт строкой и один-два байта дельтой.
  const overrides = [...share.overrides].sort((a, b) => a.date.localeCompare(b.date));
  writer.varint(overrides.length);
  let previousDay = anchorDay;
  for (const override of overrides) {
    const day = toEpochDay(override.date);
    writer.signed(day - previousDay);
    previousDay = day;

    const note = override.note && override.note.length > 0 ? override.note : undefined;
    writer.u8(
      (override.shiftTypeId !== undefined ? 1 : 0) |
        (override.workedMinutesOverride !== undefined ? 2 : 0) |
        (note !== undefined ? 4 : 0),
    );
    if (override.shiftTypeId !== undefined) writer.u8(index.get(override.shiftTypeId) ?? 0);
    if (override.workedMinutesOverride !== undefined) writer.varint(override.workedMinutesOverride);
    if (note !== undefined) writer.text(note);
  }

  writer.varint(share.payments.length);
  for (const payment of share.payments) {
    writer.u8(Math.max(0, PAYMENT_KINDS.indexOf(payment.kind)));
    writer.text(payment.period);
    writer.signed(toEpochDay(payment.receivedOn) - anchorDay);
    writer.varint(Math.round(payment.amount));
    writer.text(payment.note ?? '');
  }

  return writer.bytes();
}

export function unpackTrack(bytes: Uint8Array): SharedTrack {
  const reader = new ByteReader(bytes);

  const name = reader.text();

  const typeCount = reader.varint();
  if (typeCount === 0 || typeCount > 200) {
    throw new ShareFormatError('corrupt', 'В коде нет ни одной смены');
  }

  const shiftTypes: ShiftType[] = [];
  for (let position = 0; position < typeCount; position += 1) {
    const flags = reader.u8();
    const kind = (flags & 1) === 1 ? 'work' : 'rest';
    const raw = {
      // Свой id, а не пришедший: на принимающем телефоне уже могут быть смены
      // с такими же идентификаторами, и подменять их чужими нельзя.
      id: `shared-${position}-${Date.now().toString(36)}`,
      builtinId: null,
      kind,
      name: reader.text(),
      badge: reader.text(),
      colorToken: SHIFT_COLOR_TOKENS[reader.u8()] ?? FALLBACK_COLOR_TOKEN,
      rateMultiplier: reader.u8() / RATE_STEPS_PER_UNIT,
      ...((flags & 4) === 4
        ? {
            time: {
              start: timeOfMinutes(reader.u16()),
              end: timeOfMinutes(reader.u16()),
              unpaidBreakMinutes: reader.u8() * BREAK_STEP,
            },
          }
        : {}),
      ...((flags & 2) === 2 ? { multiDay: true } : {}),
    };

    const clean = sanitizeShiftType(raw);
    if (!clean) throw new ShareFormatError('corrupt', 'В коде испорчено описание смены');
    shiftTypes.push(clean);
  }

  const idOf = (position: number): string => {
    const type = shiftTypes[position];
    if (!type) throw new ShareFormatError('corrupt', 'В коде ссылка на несуществующую смену');
    return type.id;
  };

  const patternKind = reader.u8();
  let pattern: SchedulePattern;

  if (patternKind === PATTERN_CYCLE) {
    const length = reader.varint();
    if (length === 0 || length > 366) throw new ShareFormatError('corrupt', 'Неверная длина цикла');
    pattern = { kind: 'cycle', slots: Array.from({ length }, () => idOf(reader.u8())) };
  } else if (patternKind === PATTERN_WEEKLY) {
    const weekCount = reader.u8();
    if (weekCount === 0 || weekCount > 8) {
      throw new ShareFormatError('corrupt', 'Неверное число недель');
    }
    pattern = {
      kind: 'weekly',
      weeks: Array.from({ length: weekCount }, () => {
        const week = {} as Record<Weekday, string>;
        for (const day of WEEKDAYS) week[day] = idOf(reader.u8());
        return week;
      }),
    };
  } else {
    throw new ShareFormatError('corrupt', 'Неизвестный вид графика');
  }

  const anchorDay = reader.varint();
  const anchorDate = fromEpochDay(anchorDay);

  const overrideCount = reader.varint();
  if (overrideCount > 20_000) throw new ShareFormatError('corrupt', 'Слишком много правок');

  const overrides: SharedOverride[] = [];
  let previousDay = anchorDay;
  for (let position = 0; position < overrideCount; position += 1) {
    const day = previousDay + reader.signed();
    previousDay = day;
    const flags = reader.u8();

    overrides.push({
      date: fromEpochDay(day),
      ...((flags & 1) === 1 ? { shiftTypeId: idOf(reader.u8()) } : {}),
      ...((flags & 2) === 2 ? { workedMinutesOverride: reader.varint() } : {}),
      ...((flags & 4) === 4 ? { note: reader.text() } : {}),
    });
  }

  const paymentCount = reader.varint();
  if (paymentCount > 5_000) throw new ShareFormatError('corrupt', 'Слишком много выплат');

  const payments: SharedTrack['payments'] = [];
  for (let position = 0; position < paymentCount; position += 1) {
    const kind: PaymentKind = PAYMENT_KINDS[reader.u8()] ?? 'salary';
    const period = reader.text();
    const receivedOn = fromEpochDay(anchorDay + reader.signed());
    const amount = reader.varint();
    const note = reader.text();
    payments.push({ kind, period, receivedOn, amount, ...(note.length > 0 ? { note } : {}) });
  }

  // Хвост означает, что формат разошёлся с данными: лучше отказать, чем
  // показать человеку половину чужого графика как целый.
  if (!reader.done) throw new ShareFormatError('corrupt', 'В коде лишние данные');

  return { name, shiftTypes, pattern, anchorDate, overrides, payments };
}

/** Упаковать, сжать, закодировать. Результат — строка для ссылки или файла. */
export function encodeTrack(share: SharedTrack): string {
  const packed = packTrack(share);
  const deflated = deflateSync(packed, { level: 9 });

  const out = new Uint8Array(deflated.length + 1);
  // Версия лежит снаружи сжатого куска: старое приложение обязано прочитать её
  // раньше, чем возьмётся распаковывать незнакомый формат.
  out[0] = SHARE_FORMAT_VERSION;
  out.set(deflated, 1);

  return encodeBase64Url(out);
}

export function decodeTrack(text: string): SharedTrack {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64Url(text.trim());
  } catch {
    throw new ShareFormatError('corrupt', 'Это не похоже на график из приложения');
  }

  if (bytes.length < 2) throw new ShareFormatError('corrupt', 'Данные оборваны');

  const version = bytes[0];
  if (version !== SHARE_FORMAT_VERSION) {
    throw new ShareFormatError(
      'version',
      'График записан новой версией приложения. Обнови приложение и попробуй снова.',
    );
  }

  let packed: Uint8Array;
  try {
    packed = inflateSync(bytes.subarray(1));
  } catch {
    throw new ShareFormatError('corrupt', 'Код прочитан не полностью — попробуй ещё раз');
  }

  try {
    return unpackTrack(packed);
  } catch (error) {
    if (error instanceof ShareFormatError) throw error;
    if (error instanceof ByteReadError) throw new ShareFormatError('corrupt', error.message);
    throw new ShareFormatError('corrupt', 'График не разобрать');
  }
}

/** Ссылка для QR-кода. Её же отдаёт системная камера Android приложению. */
export function trackShareUrl(share: SharedTrack): string {
  return `${SHARE_URL_SCHEME}?v=${SHARE_FORMAT_VERSION}&d=${encodeTrack(share)}`;
}

/**
 * Полезные данные из ссылки. null — ссылка не наша: сканер не должен ругаться
 * на чужой QR-код, он должен продолжать искать свой.
 */
export function payloadFromUrl(url: string): string | null {
  const match = /[?&]d=([A-Za-z0-9\-_]+)/.exec(url);
  if (!match) return null;
  return url.includes('track') ? match[1] : null;
}

/**
 * Файл с одним графиком.
 *
 * Внутри та же строка, что и в QR-коде, — разбор один на все входы. Обёртка
 * нужна ради двух вещей: по метке видно, что файл наш, а по имени понятно, что
 * в нём, ещё до открытия приложения.
 */
export const TRACK_FILE_FORMAT = 'jobdatepicker-track';

export interface TrackFile {
  format: typeof TRACK_FILE_FORMAT;
  v: number;
  name: string;
  createdAt: string;
  /** Полезные данные — ровно то же, что уезжает в QR-коде. */
  d: string;
}

export function serializeTrackFile(share: SharedTrack, now = new Date()): string {
  const file: TrackFile = {
    format: TRACK_FILE_FORMAT,
    v: SHARE_FORMAT_VERSION,
    name: share.name,
    createdAt: now.toISOString(),
    d: encodeTrack(share),
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Данные из файла с графиком. null — файл не про график: это может быть
 * резервная копия, и разбирать её будет другой разбор.
 */
export function payloadFromFile(text: string): string | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null) return null;
    const file = raw as Partial<TrackFile>;
    return file.format === TRACK_FILE_FORMAT && typeof file.d === 'string' ? file.d : null;
  } catch {
    return null;
  }
}

/** Влезет ли в код, который реально снимется камерой. */
export function fitsInQr(payload: string): boolean {
  return payload.length <= QR_PAYLOAD_LIMIT;
}

function colorIndex(token: string): number {
  const index = SHIFT_COLOR_TOKENS.indexOf(token as (typeof SHIFT_COLOR_TOKENS)[number]);
  return index < 0 ? SHIFT_COLOR_TOKENS.indexOf(FALLBACK_COLOR_TOKEN) : index;
}

function minutesOfDay(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function timeOfMinutes(total: number): string {
  const safe = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
