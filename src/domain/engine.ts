import {
  addDays,
  daysBetween,
  floorMod,
  parseTimeToMinutes,
  startOfWeek,
  weekday,
} from './date.ts';
import type { IsoDate, Weekday } from './date.ts';
import type { HolidayCalendar } from './holidays.ts';
import { withShiftStart } from './shifts.ts';
import type {
  ActiveSchedule,
  DayOverride,
  ResolvedDay,
  SchedulePattern,
  SchedulePeriod,
  SchedulePreset,
  ShiftType,
} from './types.ts';

/** Всё, что нужно движку, чтобы разложить любую дату. */
export interface ScheduleContext {
  /**
   * История графиков по возрастанию startsOn. Пустой список сюда не попадает:
   * дорожку без графика раскладывать нечем, и контекст для неё не собирают.
   */
  schedules: SchedulePeriod[];
  shiftTypes: Map<string, ShiftType>;
  /** Ручные правки по датам. */
  overrides: Map<IsoDate, DayOverride>;
  /**
   * Производственный календарь или null, если человек его отключил.
   *
   * Праздники правят только недельные графики: смена в праздник от календаря
   * не зависит — на неё выходят по своему графику, и 12 июня в 2/2 такой же
   * рабочий день, как любой другой.
   */
  holidays?: HolidayCalendar | null;
}

/**
 * Оплачиваемая длительность смены в минутах.
 * start === end означает ровно сутки; end < start — переход через полночь.
 */
export function shiftDurationMinutes(shiftType: ShiftType): number {
  if (shiftType.kind === 'rest' || !shiftType.time) return 0;
  const start = parseTimeToMinutes(shiftType.time.start);
  const end = parseTimeToMinutes(shiftType.time.end);
  const span = end > start ? end - start : end - start + 24 * 60;
  return Math.max(0, span - shiftType.time.unpaidBreakMinutes);
}

/**
 * Какой тип смены даёт сам график на эту дату, без учёта ручных правок.
 *
 * Новый вид графика добавляется новым вариантом SchedulePattern и одной веткой
 * здесь — остальной код на него не завязан.
 */
export function resolvePlannedShiftId(schedule: ActiveSchedule, date: IsoDate): string {
  const pattern: SchedulePattern = schedule.pattern;

  if (pattern.kind === 'cycle') {
    if (pattern.slots.length === 0) {
      throw new RangeError('Цикл графика не может быть пустым');
    }
    // floorMod, а не %, — иначе даты до первой смены дают отрицательный индекс.
    const offset = daysBetween(schedule.anchorDate, date);
    return pattern.slots[floorMod(offset, pattern.slots.length)];
  }

  if (pattern.weeks.length === 0) {
    throw new RangeError('Недельный график должен содержать хотя бы одну неделю');
  }
  // Недели чередуются от недели, в которую попала дата отсчёта.
  const weeksApart = Math.floor(
    daysBetween(startOfWeek(schedule.anchorDate), startOfWeek(date)) / 7,
  );
  const week = pattern.weeks[floorMod(weeksApart, pattern.weeks.length)];
  return week[weekday(date)];
}

/**
 * График, действовавший в этот день, или null, если он раньше первого периода.
 *
 * Периоды отсортированы по возрастанию, поэтому годится простой проход: их
 * единицы, а не тысячи — человек меняет работу считаное число раз.
 */
export function scheduleOn(schedules: SchedulePeriod[], date: IsoDate): SchedulePeriod | null {
  let found: SchedulePeriod | null = null;
  for (const period of schedules) {
    if (period.startsOn > date) break;
    found = period;
  }
  return found;
}

/**
 * С какого дня по этой дорожке вообще есть график.
 *
 * До него календарь не рисует смен, а сводка не считает часов: человек здесь
 * ещё не работал. null — графика нет ни одного.
 */
export function scheduleStartsOn(schedules: SchedulePeriod[]): IsoDate | null {
  return schedules[0]?.startsOn ?? null;
}

/**
 * Какие типы смен вообще встречаются в графике, по порядку появления.
 *
 * Нужно будильнику: когда в графике чередуются дневные и ночные, время
 * подъёма у них разное, и экран правки показывает столько полей времени,
 * сколько смен в графике, — спрашивать это у пользователя незачем.
 */
export function patternShiftTypeIds(pattern: SchedulePattern): string[] {
  return [...new Set(patternShiftTypeIdsWithRepeats(pattern))];
}

/** Все смены графика по порядку, с повторами: подсчёту нужен не набор, а список. */
function patternShiftTypeIdsWithRepeats(pattern: SchedulePattern): string[] {
  return pattern.kind === 'cycle'
    ? pattern.slots
    : pattern.weeks.flatMap((week) => [1, 2, 3, 4, 5, 6, 7].map((day) => week[day as Weekday]));
}

/**
 * Смена, которую даёт график на эту дату, вместе с поправкой на
 * производственный календарь.
 *
 * Отдельно от resolvePlannedShiftId, потому что поправка требует справочника
 * смен: понять, что праздник попал на рабочий день, можно только зная, рабочая
 * ли смена стоит в шаблоне.
 */
export function plannedShiftId(context: ScheduleContext, date: IsoDate): string | null {
  const schedule = scheduleOn(context.schedules, date);
  if (!schedule) return null;

  const planned = resolvePlannedShiftId(schedule, date);
  const holidays = context.holidays;

  if (!holidays || schedule.pattern.kind !== 'weekly') return planned;

  const type = context.shiftTypes.get(planned);
  if (!type) return planned;

  if (holidays.isNonWorking(date)) {
    if (type.kind !== 'work') return planned;
    return dominantShiftId(context, schedule.pattern, 'rest') ?? planned;
  }

  if (holidays.isWorkingWeekend(date)) {
    if (type.kind !== 'rest') return planned;
    return dominantShiftId(context, schedule.pattern, 'work') ?? planned;
  }

  return planned;
}

/**
 * Самая частая смена нужного вида в недельном шаблоне.
 *
 * Ею и заполняется день, который правит производственный календарь: у
 * пятидневки с сокращённой пятницей рабочая суббота по переносу должна выйти
 * восьмичасовой, а не семичасовой, — восьмичасовых дней в неделе четыре.
 */
function dominantShiftId(
  context: ScheduleContext,
  pattern: SchedulePattern,
  kind: 'work' | 'rest',
): string | null {
  const counts = new Map<string, number>();

  for (const id of patternShiftTypeIdsWithRepeats(pattern)) {
    if (context.shiftTypes.get(id)?.kind !== kind) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

/** Итоговый день календаря: график плюс ручная правка поверх него. */
export function resolveDay(context: ScheduleContext, date: IsoDate): ResolvedDay {
  const override = context.overrides.get(date);
  const plannedId = plannedShiftId(context, date);
  // День раньше первого графика: смены нет, и календарь рисует его базовым —
  // будни и выходные, без раскладки. Правка сильнее: вышел за коллегу накануне
  // первого выхода, и это факт, а не продолжение шаблона назад.
  const shiftTypeId = override?.shiftTypeId ?? plannedId ?? restStubId(context);
  const known = context.shiftTypes.get(shiftTypeId);

  if (!known) {
    throw new ReferenceError(`Неизвестный тип смены "${shiftTypeId}" на дату ${date}`);
  }

  // Своё начало смен этого периода: справочник у всех графиков общий, а
  // выходят по нему по-разному. Сдвигается только окно смены — длительность
  // та же, поэтому ни часы ниже, ни норма дня от этого не меняются.
  const shiftType = withShiftStart(
    known,
    scheduleOn(context.schedules, date)?.shiftStarts?.[shiftTypeId],
  );

  // Правка, которая ничего не меняет по существу, изменённым днём его не
  // делает. Заметок это больше не касается вовсе: они живут отдельно от правок
  // и точку в клетке не зажигают.
  const changed =
    override !== undefined &&
    (override.shiftTypeId !== undefined || override.workedMinutesOverride !== undefined);

  // Норма берётся у смены из графика, даже когда день переопределён. Тип
  // смены из графика может отсутствовать в справочнике только у сломанного
  // сохранённого графика — это ловит scheduleUsesKnownShifts при подъёме
  // состояния; ронять из-за этого клетку календаря незачем. До первого графика
  // нормы нет вовсе: сравнивать подработку не с чем.
  const plannedType = plannedId === null ? undefined : context.shiftTypes.get(plannedId);

  return {
    date,
    shiftType,
    source: changed ? 'override' : plannedId === null ? 'none' : 'schedule',
    workedMinutes: override?.workedMinutesOverride ?? shiftDurationMinutes(shiftType),
    plannedMinutes: plannedType ? shiftDurationMinutes(plannedType) : 0,
    // Название праздника едет вместе с днём: и клетка календаря, и карточка
    // дня, и озвучка берут его отсюда, а не спрашивают календарь заново.
    ...holidayNameOf(context, date),
  };
}

/**
 * Чем заполнить день, на который графика нет: выходным.
 *
 * Своей смены у такого дня быть не может, а ResolvedDay без смены пришлось бы
 * проверять на null в каждой клетке календаря и в каждом подсчёте. Берётся
 * выходной самого раннего графика, а если по нему не понять — любой выходной
 * из справочника: встроенный «Выходной» есть всегда.
 */
function restStubId(context: ScheduleContext): string {
  const first = context.schedules[0];
  const dominant = first ? dominantShiftId(context, first.pattern, 'rest') : null;
  if (dominant) return dominant;

  for (const [id, type] of context.shiftTypes) {
    if (type.kind === 'rest') return id;
  }
  throw new ReferenceError('В справочнике нет ни одной нерабочей смены');
}

/** Праздник этого дня, если производственный календарь включён. */
function holidayNameOf(context: ScheduleContext, date: IsoDate): { holiday?: string } {
  const name = context.holidays?.nameOf(date) ?? null;
  return name === null ? {} : { holiday: name };
}

/**
 * Оплачиваемые минуты с учётом надбавки за смену.
 *
 * Ночная с множителем 1,2 за двенадцать часов приносит столько же, сколько
 * дневная за четырнадцать с половиной. Приложение не начисляет зарплату, но
 * ставку базового часа выводит делением полученной суммы именно на эти
 * минуты — иначе месяц с одними ночными показывал бы ставку выше, чем месяц с
 * одними дневными, хотя платят по одной и той же.
 */
export function weightedMinutes(day: ResolvedDay): number {
  return day.workedMinutes * day.shiftType.rateMultiplier;
}

/**
 * Отсутствие по уважительной причине: отпуск и больничный. Часов в такой день
 * нет, но и нормы на него нет — рабочее время просто не планируется.
 *
 * Признак — multiDay: им помечены ровно те нерабочие смены, которые ставятся
 * периодом вместо графика. Обычный выходной и отсыпной так не ставятся.
 */
export function isExcusedAbsence(shiftType: ShiftType): boolean {
  return shiftType.kind === 'rest' && shiftType.multiDay === true;
}

/**
 * На сколько минут факт разошёлся с графиком: больше нуля — переработка,
 * меньше — недоработка.
 *
 * Сравнивается с тем, что на этот день давал график, а не с нормой смены,
 * которая в дне стоит: подработка в выходной — это плюс все её часы, а не
 * минус до штатной длительности подработки.
 *
 * Снятая смена даёт минус ровно так же, как лишняя — плюс. Иначе обмен днями
 * с коллегой (вышел 1-го вместо 3-го) считался бы переработкой на целую
 * смену: плюс за лишний день учитывался, минус за отданный — нет, хотя часов
 * за месяц столько же.
 *
 * Отклонения нет у отпуска и больничного: часов там действительно меньше, но
 * недоработкой это не является, а календарь на две недели отпуска заливался бы
 * красным.
 */
export function overtimeMinutes(day: ResolvedDay): number {
  if (isExcusedAbsence(day.shiftType)) return 0;
  return day.workedMinutes - day.plannedMinutes;
}

export function resolveRange(context: ScheduleContext, dates: IsoDate[]): ResolvedDay[] {
  return dates.map((date) => resolveDay(context, date));
}

/**
 * Идёт ли день в счёт часов и смен.
 *
 * Не идут дни раньше самого первого графика дорожки: человек тогда здесь не
 * работал, и месяц до устройства на работу иначе выдавал бы полную норму
 * часов, а вместе с ней и ставку за час, выведенную неизвестно из чего.
 *
 * Ручная правка сильнее: отмеченный руками день до начала — это факт, и
 * source у него 'override', а не 'none'.
 *
 * Календарь спрашивает то же самое по каждой клетке: день, который не идёт в
 * счёт, не должен выглядеть обычной сменой — иначе месяц с полной сеткой смен
 * и нулём в итоге читается как поломка.
 */
export function countedDay(day: ResolvedDay): boolean {
  return day.source !== 'none';
}

/**
 * Проверяет, что пресет ссылается только на существующие смены и покрывает все
 * семь дней недели.
 *
 * Вызывается тестами: справочник пресетов задан кодом, значит и проверять его
 * надо до выпуска, а не на телефоне. От уже сохранённого у пользователя
 * графика, чья смена исчезла из справочника, защищает scheduleUsesKnownShifts
 * при подъёме состояния.
 */
export function validatePreset(
  preset: SchedulePreset,
  shiftTypes: Map<string, ShiftType>,
): string[] {
  const errors: string[] = [];
  const pattern = preset.pattern;

  if (pattern.kind === 'cycle') {
    if (pattern.slots.length === 0) errors.push(`${preset.id}: пустой цикл`);
    pattern.slots.forEach((id, index) => {
      if (!shiftTypes.has(id))
        errors.push(`${preset.id}: слот ${index} ссылается на несуществующую смену "${id}"`);
    });
    return errors;
  }

  if (pattern.weeks.length === 0) errors.push(`${preset.id}: нет ни одной недели`);
  pattern.weeks.forEach((week, weekIndex) => {
    for (let day = 1; day <= 7; day += 1) {
      const id = week[day as 1 | 2 | 3 | 4 | 5 | 6 | 7];
      if (id === undefined) {
        errors.push(`${preset.id}: неделя ${weekIndex}, не задан день недели ${day}`);
      } else if (!shiftTypes.has(id)) {
        errors.push(
          `${preset.id}: неделя ${weekIndex}, день ${day} ссылается на несуществующую смену "${id}"`,
        );
      }
    }
  });
  return errors;
}

/**
 * Все ли смены сохранённого графика есть в справочнике.
 *
 * Паттерн копируется в хранилище при выборе графика, а справочник смен всегда
 * берётся из кода. Значит, выпуск, переименовавший id смены, приезжает по
 * воздуху и делает сохранённый график неразрешимым: resolveDay начинает падать
 * на каждой дате, а вместе с ним календарь, сводка и планировщик будильников.
 * Проверяется при подъёме состояния, до первого рендера.
 */
export function scheduleUsesKnownShifts(
  schedule: ActiveSchedule,
  shiftTypes: Map<string, ShiftType>,
): boolean {
  return patternShiftTypeIds(schedule.pattern).every((id) => shiftTypes.has(id));
}

/**
 * Все смены всей истории графиков, по порядку появления.
 *
 * Нужно будильнику «по графику»: время подъёма спрашивается по одному на смену,
 * и после перевода с пятидневки на 2/2 в списке должны быть смены обоих
 * графиков — иначе на новом графике будильник звонить перестанет.
 */
export function scheduleShiftTypeIds(schedules: SchedulePeriod[]): string[] {
  return [...new Set(schedules.flatMap((period) => patternShiftTypeIds(period.pattern)))];
}

/**
 * Смены, по которым ещё предстоит работать: действующий график плюс те, что
 * начнутся позже.
 *
 * Отдельно от scheduleShiftTypeIds, потому что будильник смотрит только вперёд.
 * Вся история ему даёт смены уже оставленных работ: человек, переведённый с
 * пятидневки на 2/2, получал четыре поля времени подъёма вместо одного — и три
 * из них для смен, которых в его календаре больше не будет никогда.
 *
 * Будущие периоды при этом нужны: если переход на другой график уже назначен,
 * время подъёма для его смен спросить надо заранее, иначе в день перехода
 * будильник замолчит.
 */
export function upcomingShiftTypeIds(schedules: SchedulePeriod[], from: IsoDate): string[] {
  const current = scheduleOn(schedules, from);
  const ahead = schedules.filter((period) => period.startsOn > from);

  return [
    ...new Set(
      (current ? [current, ...ahead] : ahead).flatMap((period) =>
        patternShiftTypeIds(period.pattern),
      ),
    ),
  ];
}

/** Непрерывный отрезок одинаковых ручных правок вокруг даты. */
export interface OverrideRun {
  start: IsoDate;
  end: IsoDate;
  length: number;
  /** Какой это день отрезка по счёту, начиная с 1. */
  position: number;
}

/**
 * Ищет отпуск или больничный целиком по одному дню из него.
 *
 * Нужно, чтобы карточка дня говорила «отпуск, 3-й день из 14», а не просто
 * «отпуск»: без этого непонятно, куда именно ты попал, и легко продлить отпуск
 * второй раз поверх уже проставленного.
 */
export function findOverrideRun(
  overrides: Map<IsoDate, DayOverride>,
  date: IsoDate,
): OverrideRun | null {
  const current = overrides.get(date);
  // Правка без смены — это одни часы, отпуском она не бывает. Без этой
  // проверки два соседних дня с правлеными часами склеились бы в «отрезок»
  // из двух undefined.
  if (!current?.shiftTypeId) return null;

  const sameType = (candidate: IsoDate): boolean =>
    overrides.get(candidate)?.shiftTypeId === current.shiftTypeId;

  let start = date;
  while (sameType(addDays(start, -1))) start = addDays(start, -1);

  let end = date;
  while (sameType(addDays(end, 1))) end = addDays(end, 1);

  return {
    start,
    end,
    length: daysBetween(start, end) + 1,
    position: daysBetween(start, date) + 1,
  };
}
