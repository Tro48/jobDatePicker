import { localDateTimeToMillis } from './date.ts';
import type { IsoDate } from './date.ts';
import { formatDayLong } from './format.ts';
import type { AlarmOccurrence } from './alarm.ts';
import type { DayNote } from './types.ts';

/**
 * Заметки к дням: хранение, группировка и напоминания.
 *
 * Заметка живёт сама по себе, а не внутри правки дня: она не меняет ни смену,
 * ни часы, зато их бывает несколько на один день и у каждой своё напоминание.
 * Всё, что про заметки знает приложение, собрано здесь — календарь, карточка
 * дня и планировщик звонков берут готовые функции, а не разбирают список сами.
 */

/**
 * Предел длины заметки.
 *
 * Не про экономию места: заметка уезжает в резервную копию и в код графика, а
 * текст без предела туда влезает ровно один раз — первый. Двух тысяч символов
 * хватает на страницу текста.
 */
export const MAX_NOTE_LENGTH = 2000;

/** Во сколько напоминать по умолчанию: утро того же дня. */
export const DEFAULT_REMIND_AT = '09:00';

/** «ЧЧ:ММ» и ничего больше: время без даты — дата у заметки уже есть. */
function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Текст заметки в том виде, в каком он уходит в хранилище. */
export function normalizeNoteText(text: string): string {
  return text.trim().slice(0, MAX_NOTE_LENGTH);
}

/**
 * Заметка из снимка хранилища или из резервной копии, или ничего.
 *
 * Проверяется по-настоящему, а не приводится типом: файл копии человек может
 * поправить руками, а заметка без даты сломала бы и календарь, и планировщик
 * напоминаний.
 */
export function sanitizeNote(raw: unknown): DayNote | null {
  if (raw === null || typeof raw !== 'object') return null;
  const value = raw as Partial<DayNote>;

  const text = typeof value.text === 'string' ? normalizeNoteText(value.text) : '';
  if (!isIsoDate(value.date) || typeof value.id !== 'string' || text.length === 0) return null;

  return {
    id: value.id,
    date: value.date,
    text,
    remindAt: isTime(value.remindAt) ? value.remindAt : null,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
  };
}

/** Заметки одного дня, в порядке появления. */
export function notesOn(notes: DayNote[], date: IsoDate): DayNote[] {
  return notes.filter((note) => note.date === date).sort(byCreatedAt);
}

function byCreatedAt(a: DayNote, b: DayNote): number {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/**
 * Заголовок заметки: первая непустая строка.
 *
 * Списку и клетке календаря нужна одна строка, а заметка бывает в десять. Резать
 * по длине здесь нечего — за длину отвечает numberOfLines у самого текста.
 */
export function noteTitle(note: DayNote): string {
  return (
    note.text
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? note.text
  );
}

/**
 * Заметки дня одной строкой — для озвучки клетки и подписи в карточке дня.
 * undefined, если заметок нет: вызывающему нечего показывать.
 */
export function noteLine(notes: DayNote[]): string | undefined {
  if (notes.length === 0) return undefined;
  return notes.map(noteTitle).join(' · ');
}

/**
 * Заметки по датам. Ключ — дата, значение — заметки этого дня по порядку.
 *
 * Одна карта на весь календарь: спрашивать список по каждой из сорока двух
 * клеток значит сорок два прохода по всем заметкам приложения.
 */
export function notesByDate(notes: DayNote[]): Map<IsoDate, DayNote[]> {
  const grouped = new Map<IsoDate, DayNote[]>();
  for (const note of notes) {
    const day = grouped.get(note.date);
    if (day) day.push(note);
    else grouped.set(note.date, [note]);
  }
  for (const day of grouped.values()) day.sort(byCreatedAt);
  return grouped;
}

/** День с его заметками — строка общего списка, сгруппированного по дням. */
export interface NoteDay {
  date: IsoDate;
  notes: DayNote[];
}

/**
 * Все заметки, сгруппированные по дням и упорядоченные по дате.
 *
 * Готовый список для экрана, который показывает заметки не одного дня, а
 * подряд: дни идут по возрастанию даты, заметки внутри дня — по порядку
 * появления.
 */
export function groupNotesByDay(notes: DayNote[]): NoteDay[] {
  return [...notesByDate(notes)]
    .map(([date, day]) => ({ date, notes: day }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Напоминания заметок, которым ещё предстоит зазвонить.
 *
 * Тот же вид, что и у срабатывания будильника: дальше по дороге в
 * AlarmManager они ничем не отличаются, и планировщик складывает их в один
 * список. Отличает их kind — по нему экран будильников не показывает у себя
 * чужие звонки, а карточка дня не пытается открыть заметку как будильник.
 *
 * Прошедшее время не ставится и никуда не переезжает: заметка привязана к
 * своему дню, и «перенести на завтра» за человека приложение не станет.
 */
export function noteReminders(notes: DayNote[], now: Date): AlarmOccurrence[] {
  const nowMillis = now.getTime();
  const found: AlarmOccurrence[] = [];

  for (const note of notes) {
    if (note.remindAt === null) continue;
    const triggerAtMillis = localDateTimeToMillis(note.date, note.remindAt);
    if (triggerAtMillis <= nowMillis) continue;

    found.push({
      // Заметка звонит один раз, поэтому ключ — она сама. Время в ключе не
      // нужно: второго срабатывания у неё не бывает.
      id: `note:${note.id}`,
      kind: 'note',
      alarmId: note.id,
      date: note.date,
      time: note.remindAt,
      triggerAtMillis,
      title: noteTitle(note),
      subtitle: `Заметка · ${formatDayLong(note.date).toLowerCase()}`,
      // Мелодия по умолчанию и без отсрочки: напоминание — не подъём на смену,
      // откладывать его некуда, а выбор мелодии заметке только мешает.
      soundUri: null,
      vibrate: true,
      snoozeMinutes: 0,
    });
  }

  return found;
}
