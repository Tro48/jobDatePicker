import { addDays, localDateTimeToMillis, toIsoDateLocal, weekday } from './date.ts';
import type { IsoDate, Weekday } from './date.ts';
import { resolveDay } from './engine.ts';
import type { ScheduleContext } from './engine.ts';
import { WEEKDAYS_SHORT, formatDayLong, formatDayShort } from './format.ts';

/**
 * Как повторяется будильник.
 *
 * «Каждый день» отдельным вариантом не заведено намеренно: это те же дни
 * недели, только все семь. Иначе один и тот же смысл пришлось бы поддерживать
 * в двух ветках планирования.
 */
export type AlarmRepeat =
  /** Один раз в конкретную дату. Дата хранится явно, чтобы было видно, что он уже отзвонил. */
  | { kind: 'once'; date: IsoDate }
  /** По дням недели. Пустой список — не звонит никогда, экран об этом предупреждает. */
  | { kind: 'weekly'; days: Weekday[] }
  /**
   * По графикам: звонит в каждый рабочий день отмеченных графиков.
   *
   * Список, а не один график: одним будильником удобно закрыть и основную
   * работу, и склад. Пустой список — не звонит никогда, экран об этом
   * предупреждает, ровно как при пустом наборе дней недели.
   *
   * times внутри графика — время подъёма для конкретного типа смены. Пусто,
   * если рабочая смена в графике одна: тогда звонит общее время будильника.
   * Ключи вложены в график намеренно: id смен у графиков общие, и плоская
   * запись «day12 в 06:30» перезаписывала бы подъём на другой работе.
   */
  | { kind: 'schedule'; tracks: AlarmTrack[] };

/** Один отмеченный график внутри будильника «по графику». */
export interface AlarmTrack {
  trackId: string;
  /** Время подъёма по типам смен этого графика. */
  times: Record<string, string>;
}

export interface Alarm {
  id: string;
  /** Название вроде «На смену». Пустое допустимо — тогда в списке просто время. */
  label: string;
  /** «ЧЧ:ММ». Общее время будильника; в графике его перекрывает repeat.times. */
  time: string;
  /** Выключенный будильник остаётся в списке со всеми настройками — это пауза. */
  enabled: boolean;
  repeat: AlarmRepeat;
  /** URI системной мелодии. null — сигнал будильника по умолчанию. */
  soundUri: string | null;
  vibrate: boolean;
  snoozeMinutes: number;
}

/** Отсрочки нет: на экране звонка не будет кнопки «Отложить». */
export const SNOOZE_OFF = 0;

/**
 * Новый будильник заводится без отсрочки. «Отложить» — не свойство будильника
 * по умолчанию, а осознанный выбор: кто ставит будильник на смену, обычно как
 * раз и не хочет кнопки, которая позволяет проспать ещё десять минут.
 */
export const DEFAULT_SNOOZE_MINUTES = SNOOZE_OFF;
export const MAX_SNOOZE_MINUTES = 60;

/**
 * Сколько срабатываний вперёд ставится для одного будильника.
 *
 * Больше одного потому, что перепланировать умеет только JS: пока приложение
 * не открыли, повторяющийся будильник живёт на этом запасе. Семь штук — это
 * неделя для ежедневного и две недели для графика 2/2.
 */
const OCCURRENCES_PER_ALARM = 7;

/** Общий потолок на все будильники разом: AlarmManager не резиновый. */
const MAX_SCHEDULED_ALARMS = 50;

/** Насколько далеко заглядывать вперёд в поисках подходящего дня. */
const PLANNING_HORIZON_DAYS = 120;

/** Один звонок будильника в конкретный день — то, что уходит в AlarmManager. */
export interface AlarmOccurrence {
  /**
   * Стабильный ключ: будильник, день и время. Повторный расчёт даёт тот же.
   *
   * Время в ключе не для красоты. Два графика могут дать смены в один день с
   * разным подъёмом — это два разных звонка, и без времени второй затирал бы
   * первый в AlarmManager. Совпало время у двух графиков — ключ совпадает, и
   * звонок остаётся один: будить дважды в одну минуту незачем.
   */
  id: string;
  alarmId: string;
  date: IsoDate;
  time: string;
  /** Момент срабатывания в миллисекундах эпохи. */
  triggerAtMillis: number;
  /** Заголовок на экране будильника. */
  title: string;
  /** Подпись под заголовком: день недели или смена, ради которой встаём. */
  subtitle: string;
  soundUri: string | null;
  vibrate: boolean;
  snoozeMinutes: number;
}

/** Заготовка нового будильника: разовый, на ближайшие семь утра. */
export function newAlarmDraft(now: Date): Omit<Alarm, 'id'> {
  const time = '07:00';
  return {
    label: '',
    time,
    enabled: true,
    repeat: { kind: 'once', date: nextDateForTime(time, now) },
    soundUri: null,
    vibrate: true,
    snoozeMinutes: DEFAULT_SNOOZE_MINUTES,
  };
}

/** Ближайший день, когда это время ещё впереди: сегодня или завтра. */
export function nextDateForTime(time: string, now: Date): IsoDate {
  const today = toIsoDateLocal(now);
  return localDateTimeToMillis(today, time) > now.getTime() ? today : addDays(today, 1);
}

/** Что нужно знать про отмеченный график, чтобы поставить по нему звонок. */
export interface AlarmTrackContext {
  context: ScheduleContext;
  /** Имя графика: попадает в подпись на экране звонка, когда графиков больше одного. */
  name: string;
  /** Показывать ли имя. С одной работой оно только мешает. */
  named: boolean;
}

/**
 * Ближайшие срабатывания одного будильника.
 *
 * Чистая функция: получает графики и текущий момент, отдаёт готовые метки
 * времени. Нативный модуль про смены и повторы не знает ничего.
 *
 * count — запас на график, а не на будильник. Это горизонт, на котором
 * будильник живёт, пока приложение не открывали; при двух отмеченных графиках
 * звонков в день вдвое больше, и общий счёт вдвое укоротил бы этот запас.
 */
export function nextOccurrences(
  alarm: Alarm,
  tracks: Map<string, AlarmTrackContext>,
  now: Date,
  count = OCCURRENCES_PER_ALARM,
): AlarmOccurrence[] {
  if (!alarm.enabled || count <= 0) return [];

  const nowMillis = now.getTime();
  const today = toIsoDateLocal(now);
  const found: AlarmOccurrence[] = [];

  /** Уже занятые моменты: второй график с тем же временем звонка не добавляет. */
  const taken = new Map<string, AlarmOccurrence>();

  /**
   * Отдаёт true, если на этот момент теперь стоит звонок, — неважно, новый или
   * уже поставленный другим графиком. Совпадение тоже закрывает день: ставить
   * второй звонок на ту же минуту незачем, а считать день непокрытым и тянуться
   * дальше в будущее — тем более.
   */
  const push = (date: IsoDate, time: string, subtitle: string): boolean => {
    const triggerAtMillis = localDateTimeToMillis(date, time);
    // Прошедшее время не ставим никогда: AlarmManager отработал бы его
    // мгновенно и разбудил посреди дня.
    if (triggerAtMillis <= nowMillis) return false;

    const id = `${alarm.id}:${date}:${time}`;
    const already = taken.get(id);
    if (already) {
      // Два графика подняли в одну минуту — звонок один, но сказать он должен
      // про оба: иначе непонятно, на какую работу встаёшь.
      already.subtitle = `${already.subtitle} · ${subtitle}`;
      return true;
    }

    const occurrence: AlarmOccurrence = {
      id,
      alarmId: alarm.id,
      date,
      time,
      triggerAtMillis,
      title: alarm.label.trim() || 'Будильник',
      subtitle,
      soundUri: alarm.soundUri,
      vibrate: alarm.vibrate,
      snoozeMinutes: alarm.snoozeMinutes,
    };
    taken.set(id, occurrence);
    found.push(occurrence);
    return true;
  };

  if (alarm.repeat.kind === 'once') {
    push(alarm.repeat.date, alarm.time, formatDayLong(alarm.repeat.date));
    return found;
  }

  if (alarm.repeat.kind === 'weekly') {
    const days = alarm.repeat.days;
    if (days.length === 0) return [];
    for (let offset = 0; offset < PLANNING_HORIZON_DAYS && found.length < count; offset += 1) {
      const date = addDays(today, offset);
      if (days.includes(weekday(date))) push(date, alarm.time, formatDayLong(date));
    }
    return found;
  }

  // По графикам. Каждый отмеченный считается со своим запасом, а совпавшие по
  // времени звонки схлопывает push.
  for (const { trackId, times } of alarm.repeat.tracks) {
    const track = tracks.get(trackId);
    // График удалили или он ещё не выбран — будить по нему не по чему.
    if (!track) continue;

    let planned = 0;
    for (let offset = 0; offset < PLANNING_HORIZON_DAYS && planned < count; offset += 1) {
      const date = addDays(today, offset);
      const { shiftType } = resolveDay(track.context, date);

      // Выходной, отсыпной и отпуск — не рабочие дни, будить незачем.
      if (shiftType.kind !== 'work' || !shiftType.time) continue;

      const shift = `${shiftType.name}, начало в ${shiftType.time.start}`;
      // Счётчик двигают только покрытые дни: сегодняшний подъём, время
      // которого уже прошло, иначе съедал бы запас, ничего не поставив.
      const covered = push(
        date,
        times[shiftType.id] ?? alarm.time,
        track.named ? `${track.name} · ${shift}` : shift,
      );
      if (covered) planned += 1;
    }
  }

  return found;
}

/**
 * Всё, что должно зазвонить, в порядке времени.
 *
 * Набор всегда считается целиком и целиком же заменяет предыдущий: расписание
 * — производная от будильников и графика, и пересчитать его дешевле, чем
 * поддерживать в согласованном состоянии.
 */
export function planAlarms(
  alarms: Alarm[],
  tracks: Map<string, AlarmTrackContext>,
  now: Date,
  limit = MAX_SCHEDULED_ALARMS,
): AlarmOccurrence[] {
  return alarms
    .flatMap((alarm) => nextOccurrences(alarm, tracks, now))
    .sort((a, b) => a.triggerAtMillis - b.triggerAtMillis)
    .slice(0, limit);
}

/**
 * Момент разового будильника уже прошёл.
 *
 * Нужно в двух местах: форма правки предупреждает об этом сразу, а список
 * будильников гасит такие записи при ближайшем пересчёте.
 */
export function isPastOnce(alarm: Pick<Alarm, 'time' | 'repeat'>, now: Date): boolean {
  if (alarm.repeat.kind !== 'once') return false;
  return localDateTimeToMillis(alarm.repeat.date, alarm.time) <= now.getTime();
}

/**
 * Разовые будильники, чей момент уже прошёл.
 *
 * Такой будильник отзвонил и должен погаснуть сам, как в системных часах.
 * Отследить это может только JS, поэтому проверка идёт при каждом открытии.
 */
export function expiredOnceAlarmIds(alarms: Alarm[], now: Date): string[] {
  return alarms.filter((alarm) => alarm.enabled && isPastOnce(alarm, now)).map((alarm) => alarm.id);
}

/**
 * Запуск будильника заново.
 *
 * Отзвонивший разовый будильник не выбрасывается: нажал «запустить» — он встаёт
 * на ближайший день, когда это время ещё впереди. Дату потом видно на экране
 * правки и можно поменять. Остальные режимы возвращать некуда, они повторяются
 * сами.
 */
export function restartOnce(alarm: Alarm, now: Date): Alarm {
  if (!isPastOnce(alarm, now)) return alarm;
  return { ...alarm, repeat: { kind: 'once', date: nextDateForTime(alarm.time, now) } };
}

/** Может ли будильник вообще зазвонить: без единого дня недели или графика — не может. */
export function hasAnyTrigger(alarm: Alarm): boolean {
  if (alarm.repeat.kind === 'weekly') return alarm.repeat.days.length > 0;
  if (alarm.repeat.kind === 'schedule') return alarm.repeat.tracks.length > 0;
  return true;
}

const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

/** Дни недели по порядку, без повторов: [3, 1, 1] → [1, 3]. */
export function sortWeekdays(days: Weekday[]): Weekday[] {
  return WEEKDAY_ORDER.filter((day) => days.includes(day));
}

/**
 * Время в списке: у графика с разными сменами их несколько — «06:30 · 18:30».
 *
 * Пустой repeat.times означает «звонит по общему времени»: так экран правки
 * пишет его, когда в графике всего одна смена.
 */
export function describeTime(alarm: Alarm): string {
  if (alarm.repeat.kind !== 'schedule') return alarm.time;
  const times = [
    ...new Set(alarm.repeat.tracks.flatMap((track) => Object.values(track.times))),
  ].sort();
  return times.length > 0 ? times.join(' · ') : alarm.time;
}

/**
 * Повтор человеческим текстом: «Каждый день», «Пн, Ср, Пт», «Рабочие дни».
 *
 * trackNames — все графики приложения, id к имени. Имена подставляются, только
 * когда графиков больше одного: тому, у кого работа одна, «Основная» в карточке
 * будильника ничего не сообщает.
 */
export function describeRepeat(alarm: Alarm, trackNames: Map<string, string>): string {
  if (alarm.repeat.kind === 'once') {
    return `Один раз, ${formatDayShort(alarm.repeat.date)}`;
  }

  if (alarm.repeat.kind === 'weekly') {
    const days = sortWeekdays(alarm.repeat.days);
    if (days.length === 0) return 'Ни один день не выбран';
    if (days.length === 7) return 'Каждый день';
    if (days.length === 5 && days.every((day) => day <= 5)) return 'По будням';
    if (days.length === 2 && days.every((day) => day >= 6)) return 'По выходным';
    return days.map((day) => capitalize(WEEKDAYS_SHORT[day - 1])).join(', ');
  }

  const names = alarm.repeat.tracks
    .map((track) => trackNames.get(track.trackId))
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return 'Ни один график не выбран';
  return trackNames.size > 1 ? `${names.join(', ')} · рабочие дни` : 'Рабочие дни по графику';
}

/** Отсрочка в разумных пределах: ноль — её нет, больше часа — это уже не отсрочка. */
export function clampSnoozeMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return SNOOZE_OFF;
  return Math.max(SNOOZE_OFF, Math.min(Math.round(minutes), MAX_SNOOZE_MINUTES));
}

/**
 * Минуты отсрочки из поля ввода.
 *
 * Разбор живёт здесь, а не в экране: поле хранит ровно то, что набрали, —
 * пустое остаётся пустым и ничего в себя не подставляет, — а к числу текст
 * приводится один раз, при сохранении. Пусто и мусор — это «без отсрочки».
 */
export function parseSnoozeMinutes(text: string): number {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? SNOOZE_OFF : clampSnoozeMinutes(Number(digits));
}

/** Показывать ли кнопку «Отложить»: при нулевой отсрочке откладывать некуда. */
export function hasSnooze(alarm: Pick<Alarm, 'snoozeMinutes'>): boolean {
  return alarm.snoozeMinutes > SNOOZE_OFF;
}
