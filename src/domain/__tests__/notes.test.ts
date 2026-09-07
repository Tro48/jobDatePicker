import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NOTE_LENGTH,
  groupNotesByDay,
  noteLine,
  noteReminders,
  noteTitle,
  notesByDate,
  notesOn,
  normalizeNoteText,
  sanitizeNote,
} from '../notes.ts';
import { mergeOccurrences } from '../alarm.ts';
import type { DayNote } from '../types.ts';

function note(patch: Partial<DayNote> & Pick<DayNote, 'id' | 'date'>): DayNote {
  return { text: 'заметка', remindAt: null, createdAt: 0, ...patch };
}

test('заметки дня идут в порядке появления, а не в порядке хранения', () => {
  const notes = [
    note({ id: 'b', date: '2026-09-10', text: 'вторая', createdAt: 2 }),
    note({ id: 'a', date: '2026-09-10', text: 'первая', createdAt: 1 }),
    note({ id: 'c', date: '2026-09-11', text: 'другой день', createdAt: 3 }),
  ];

  assert.deepEqual(
    notesOn(notes, '2026-09-10').map((item) => item.text),
    ['первая', 'вторая'],
  );
  assert.deepEqual(notesOn(notes, '2026-09-12'), []);
});

test('заметки, переехавшие из старой схемы, не перемешиваются между собой', () => {
  // У всех перенесённых createdAt нулевой: когда их написали, снимок не хранил.
  // Порядок тогда держится на id, а не на случайности перебора.
  const notes = [
    note({ id: 'note-other-2026-09-10', date: '2026-09-10', text: 'вторая' }),
    note({ id: 'note-main-2026-09-10', date: '2026-09-10', text: 'первая' }),
  ];

  assert.deepEqual(
    notesOn(notes, '2026-09-10').map((item) => item.text),
    ['первая', 'вторая'],
  );
});

test('группировка по дням готова для общего списка заметок', () => {
  const notes = [
    note({ id: 'c', date: '2026-09-12', text: 'третья', createdAt: 3 }),
    note({ id: 'a', date: '2026-09-10', text: 'первая', createdAt: 1 }),
    note({ id: 'b', date: '2026-09-10', text: 'вторая', createdAt: 2 }),
  ];

  const days = groupNotesByDay(notes);

  assert.deepEqual(
    days.map((day) => day.date),
    ['2026-09-10', '2026-09-12'],
  );
  assert.deepEqual(
    days[0].notes.map((item) => item.text),
    ['первая', 'вторая'],
  );
  assert.equal(notesByDate(notes).get('2026-09-10')?.length, 2);
});

test('в клетку календаря и в озвучку идёт первая строка каждой заметки', () => {
  const long = note({ id: 'a', date: '2026-09-10', text: '  \nЗабрать посылку\nдо шести вечера' });

  assert.equal(noteTitle(long), 'Забрать посылку');
  assert.equal(
    noteLine([long, note({ id: 'b', date: '2026-09-10', text: 'позвонить' })]),
    'Забрать посылку · позвонить',
  );
  assert.equal(noteLine([]), undefined);
});

test('текст заметки чинится один раз: пробелы по краям и предел длины', () => {
  assert.equal(normalizeNoteText('  за Сергея  '), 'за Сергея');
  assert.equal(normalizeNoteText('я'.repeat(MAX_NOTE_LENGTH + 100)).length, MAX_NOTE_LENGTH);
});

test('битая заметка из копии не едет дальше, а целая переживает разбор', () => {
  assert.equal(sanitizeNote(null), null);
  assert.equal(sanitizeNote({ id: 'a', date: 'вчера', text: 'что-то' }), null);
  assert.equal(sanitizeNote({ id: 'a', date: '2026-09-10', text: '   ' }), null);
  // Время не «ЧЧ:ММ» — заметка остаётся, а напоминание отбрасывается: звонить
  // по мусору нельзя, а текст терять из-за него незачем.
  assert.deepEqual(sanitizeNote({ id: 'a', date: '2026-09-10', text: 'x', remindAt: '25:99' }), {
    id: 'a',
    date: '2026-09-10',
    text: 'x',
    remindAt: null,
    createdAt: 0,
  });
});

test('напоминание ставится только вперёд и только у заметки с временем', () => {
  const now = new Date('2026-09-10T12:00:00');
  const notes = [
    note({ id: 'past', date: '2026-09-10', remindAt: '08:00', text: 'уже было' }),
    note({ id: 'soon', date: '2026-09-10', remindAt: '18:00', text: 'Забрать посылку\nу соседа' }),
    note({ id: 'silent', date: '2026-09-10', text: 'без напоминания' }),
  ];

  const planned = noteReminders(notes, now);

  assert.equal(planned.length, 1);
  assert.equal(planned[0].alarmId, 'soon');
  assert.equal(planned[0].kind, 'note');
  // На экране звонка человек видит первую строку заметки, а не «Будильник».
  assert.equal(planned[0].title, 'Забрать посылку');
  assert.equal(planned[0].time, '18:00');
});

test('места в расписании делятся по времени, а не по виду звонка', () => {
  const now = new Date('2026-09-10T12:00:00');
  const reminders = noteReminders(
    [note({ id: 'soon', date: '2026-09-10', remindAt: '13:00' })],
    now,
  );
  const far = noteReminders([note({ id: 'far', date: '2026-09-20', remindAt: '13:00' })], now);

  // Потолок в одно место достаётся ближайшему звонку, кем бы он ни был
  // поставлен: иначе заметка на сегодня проиграла бы будильнику на будущей
  // неделе только потому, что будильники считаются первыми.
  assert.deepEqual(
    mergeOccurrences([far, reminders], 1).map((item) => item.alarmId),
    ['soon'],
  );
});
