import { formatMinutesAsTime, parseTimeToMinutes } from './date.ts';
import type { ScheduleTrack, ShiftType } from './types.ts';

/**
 * Базовый справочник смен.
 *
 * Пользователь правит его как хочет и добавляет свои смены, но эти десять
 * записей не удаляются никогда: на их id ссылаются встроенные графики, и
 * исчезнувшая смена делает сохранённый график неразрешимым.
 */
export const DEFAULT_SHIFT_TYPES: ShiftType[] = [
  {
    id: 'day12',
    builtinId: 'day12',
    name: 'Дневная смена',
    badge: 'Д',
    kind: 'work',
    colorToken: 'shift.day',
    time: { start: '08:00', end: '20:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'night12',
    builtinId: 'night12',
    name: 'Ночная смена',
    badge: 'Н',
    kind: 'work',
    colorToken: 'shift.night',
    time: { start: '20:00', end: '08:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'work8',
    builtinId: 'work8',
    name: 'Рабочий день',
    badge: 'Р',
    kind: 'work',
    colorToken: 'shift.regular',
    time: { start: '09:00', end: '18:00', unpaidBreakMinutes: 60 },
    rateMultiplier: 1,
  },
  {
    id: 'work7',
    builtinId: 'work7',
    name: 'Сокращённый день',
    badge: 'С',
    kind: 'work',
    colorToken: 'shift.short',
    time: { start: '09:00', end: '17:00', unpaidBreakMinutes: 60 },
    rateMultiplier: 1,
  },
  {
    id: 'day24',
    builtinId: 'day24',
    name: 'Суточная смена',
    badge: 'С24',
    kind: 'work',
    colorToken: 'shift.day24',
    // start === end трактуется движком как ровно 24 часа, а не как нулевая смена.
    time: { start: '08:00', end: '08:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'extra',
    builtinId: 'extra',
    name: 'Подработка',
    badge: 'П',
    kind: 'work',
    colorToken: 'shift.extra',
    time: { start: '09:00', end: '18:00', unpaidBreakMinutes: 0 },
    rateMultiplier: 1,
  },
  {
    id: 'off',
    builtinId: 'off',
    name: 'Выходной',
    badge: 'В',
    kind: 'rest',
    colorToken: 'shift.off',
    rateMultiplier: 0,
  },
  {
    id: 'sleep',
    builtinId: 'sleep',
    name: 'Отсыпной',
    badge: 'О',
    kind: 'rest',
    colorToken: 'shift.sleep',
    rateMultiplier: 0,
  },
  {
    id: 'vacation',
    builtinId: 'vacation',
    name: 'Отпуск',
    badge: 'От',
    kind: 'rest',
    colorToken: 'shift.vacation',
    rateMultiplier: 0,
    multiDay: true,
  },
  {
    id: 'sick',
    builtinId: 'sick',
    name: 'Больничный',
    badge: 'Б',
    kind: 'rest',
    colorToken: 'shift.sick',
    rateMultiplier: 0,
    multiDay: true,
  },
];

export function indexShiftTypes(types: ShiftType[]): Map<string, ShiftType> {
  return new Map(types.map((type) => [type.id, type]));
}

/**
 * Токены цветов смен, из которых выбирают в редакторе.
 *
 * Порядок важен и меняться не может: в упакованном виде цвет едет одним
 * байтом — индексом в этом списке. Переставить строки местами значит
 * перекрасить чужие смены при переносе на другой телефон.
 *
 * Список живёт в домене, а не в палитре, ровно поэтому: палитра отвечает за
 * то, как токен выглядит, а домен — за то, что этот токен вообще есть.
 */
export const SHIFT_COLOR_TOKENS = [
  'shift.day',
  'shift.night',
  'shift.day24',
  'shift.regular',
  'shift.short',
  'shift.extra',
  'shift.vacation',
  'shift.sick',
  'shift.sleep',
  'shift.off',
] as const;

/** Цвет по умолчанию: им заменяется токен, которого приложение не знает. */
export const FALLBACK_COLOR_TOKEN = 'shift.off';

/** Встроенную смену нельзя удалить, а вид и многодневность у неё заданы кодом. */
export function isBuiltinShiftType(type: ShiftType): boolean {
  return type.builtinId !== null;
}

/** Отсыпной после ночной смены. */
export const SLEEP_SHIFT_BUILTIN_ID = 'sleep';

/**
 * Отсыпной ли это.
 *
 * Формально день нерабочий, но полноценным выходным он не бывает: человек его
 * отсыпается после ночной. Смену можно переименовать и перекрасить — опознаём
 * по происхождению, а не по названию.
 */
export function isSleepShift(type: ShiftType): boolean {
  return type.builtinId === SLEEP_SHIFT_BUILTIN_ID;
}

/** Сутки в минутах: смена может переходить через полночь. */
const DAY_MINUTES = 24 * 60;

/**
 * Та же смена, начинающаяся в другое время.
 *
 * Двигается всё окно целиком: конец едет вместе с началом, перерыв остаётся
 * прежним. Значит, и оплачиваемая длительность прежняя — сдвиг начала это
 * подпись, а не другая смена, и часы за месяц от него не меняются.
 *
 * Нерабочая смена и смена без времени возвращаются как есть: двигать там
 * нечего.
 */
export function withShiftStart(type: ShiftType, start: string | undefined): ShiftType {
  if (start === undefined || type.kind !== 'work' || !type.time) return type;
  if (type.time.start === start) return type;

  const from = parseTimeToMinutes(type.time.start);
  const to = parseTimeToMinutes(type.time.end);
  // Ровно сутки, когда конец совпал с началом: так же считает и длительность.
  const span = to > from ? to - from : to - from + DAY_MINUTES;
  const end = formatMinutesAsTime((parseTimeToMinutes(start) + span) % DAY_MINUTES);

  return { ...type, time: { ...type.time, start, end } };
}

/**
 * Справочник со сдвинутым началом смен. Без сдвигов возвращается тот же
 * массив: одинаковость ссылок держит memo экранов, которые его получают.
 */
export function applyShiftStarts(
  types: ShiftType[],
  starts: Record<string, string> | undefined,
): ShiftType[] {
  if (!starts || Object.keys(starts).length === 0) return types;
  return types.map((type) => withShiftStart(type, starts[type.id]));
}

/**
 * Рабочие смены, сгруппированные по началу. Порядок — по времени суток: утро
 * идёт раньше вечера, и список не переставляется от правки справочника.
 *
 * Группа, а не смена поштучно, потому что вопрос всегда про время, а не про
 * названия: на 5/2 с сокращённой пятницей смен две, но начинаются обе в
 * девять, и спрашивать время дважды значит заставить набрать одно и то же. Там
 * же, где день чередуется с ночью, времени и правда два.
 */
export interface ShiftStartGroup {
  /** Начало смен группы, «ЧЧ:ММ». */
  start: string;
  shiftTypeIds: string[];
  /** Подпись поля: названия смен группы через точку. */
  label: string;
}

export function shiftStartGroups(types: ShiftType[]): ShiftStartGroup[] {
  const byStart = new Map<string, ShiftType[]>();

  for (const type of types) {
    if (type.kind !== 'work' || !type.time) continue;
    const group = byStart.get(type.time.start);
    if (group) group.push(type);
    else byStart.set(type.time.start, [type]);
  }

  return [...byStart.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([start, group]) => ({
      start,
      shiftTypeIds: group.map((type) => type.id),
      label: group.map((type) => type.name).join(' · '),
    }));
}

/** Длиннее в клетку календаря не влезает — она и так 46 dp. */
export const MAX_BADGE_LENGTH = 3;

export const MAX_SHIFT_NAME_LENGTH = 40;

/** Надбавка за смену. Верхняя граница отсекает опечатку вроде «×120». */
export const MAX_RATE_MULTIPLIER = 5;

/**
 * Смена из хранилища, приведённая к рабочему виду, или null, если чинить в ней
 * нечего.
 *
 * Нужна, потому что справочник теперь приезжает не только из кода: он лежит в
 * MMKV, а дальше приедет ещё и из резервной копии с чужого телефона. Одна
 * запись со временем «25:00» роняет resolveDay, а вместе с ним календарь,
 * сводку и планировщик будильников — то есть всё приложение сразу.
 */
export function sanitizeShiftType(raw: unknown): ShiftType | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<ShiftType>;

  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (typeof value.name !== 'string' || value.name.trim().length === 0) return null;
  if (value.kind !== 'work' && value.kind !== 'rest') return null;

  const time = value.kind === 'work' ? sanitizeShiftTime(value.time) : undefined;
  // Рабочая смена без пригодного времени — это ноль часов навсегда: лучше
  // выбросить запись, чем молча обнулить человеку месяц.
  if (value.kind === 'work' && !time) return null;

  const badge =
    typeof value.badge === 'string' ? value.badge.trim().slice(0, MAX_BADGE_LENGTH) : '';
  const multiplier = Number(value.rateMultiplier);

  // Необязательные поля дописываются, только когда они есть: смена уезжает в
  // резервную копию и в QR-код, и лишний ключ со значением undefined там
  // превращается либо в шум, либо в null.
  return {
    id: value.id,
    builtinId: typeof value.builtinId === 'string' ? value.builtinId : null,
    name: value.name.trim().slice(0, MAX_SHIFT_NAME_LENGTH),
    // Пустая буква оставила бы смысл дня на одной заливке: берём первую букву
    // названия, чтобы клетка оставалась читаемой без цвета.
    badge: badge.length > 0 ? badge : value.name.trim().slice(0, 1).toUpperCase(),
    kind: value.kind,
    colorToken: typeof value.colorToken === 'string' ? value.colorToken : FALLBACK_COLOR_TOKEN,
    ...(time ? { time } : {}),
    rateMultiplier:
      Number.isFinite(multiplier) && multiplier >= 0 && multiplier <= MAX_RATE_MULTIPLIER
        ? multiplier
        : 1,
    ...(value.multiDay === true ? { multiDay: true as const } : {}),
  };
}

function sanitizeShiftTime(time: ShiftType['time']): ShiftType['time'] {
  if (!time) return undefined;
  try {
    parseTimeToMinutes(time.start);
    parseTimeToMinutes(time.end);
  } catch {
    return undefined;
  }
  const rawBreak = Number(time.unpaidBreakMinutes);
  return {
    start: time.start,
    end: time.end,
    // Перерыв длиннее самой смены дал бы отрицательные часы: движок обрезает
    // их до нуля, но хранить такое значение всё равно незачем.
    unpaidBreakMinutes:
      Number.isFinite(rawBreak) && rawBreak >= 0 ? Math.min(Math.round(rawBreak), 12 * 60) : 0,
  };
}

/** Где смена используется. Пусто — удалять её безопасно. */
export interface ShiftTypeUsage {
  /** Названия дорожек, чей график ставит эту смену. Такую смену удалять нельзя. */
  schedules: string[];
  /** Сколько ручных правок на неё ссылаются. */
  overrides: number;
}

/**
 * Кто держится за тип смены.
 *
 * Удаление смены, на которой стоит чей-то график, оставило бы график
 * неразрешимым, и при следующем запуске он бы просто исчез. Поэтому экран
 * спрашивает об этом до удаления, а не разбирается после.
 */
export function shiftTypeUsage(tracks: ScheduleTrack[], id: string): ShiftTypeUsage {
  const schedules: string[] = [];
  let overrides = 0;

  for (const track of tracks) {
    // Вся история, а не только текущий график: смену, на которой стоит
    // прошлогодняя пятидневка, удалять так же нельзя — от неё зависят уже
    // прожитые месяцы.
    const used = track.schedules.some(({ pattern }) =>
      pattern.kind === 'cycle'
        ? pattern.slots.includes(id)
        : pattern.weeks.some((week) => Object.values(week).includes(id)),
    );
    if (used) schedules.push(track.name);

    for (const override of Object.values(track.overrides)) {
      if (override.shiftTypeId === id) overrides += 1;
    }
  }

  return { schedules, overrides };
}
