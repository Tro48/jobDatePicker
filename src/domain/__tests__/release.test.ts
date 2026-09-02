import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewerBuild, parseReleaseManifest } from '../release.ts';
import { RELEASE_NOTES, unseenReleases } from '../releaseNotes.ts';

const valid = {
  runtimeVersion: 'a1b2c3',
  url: 'https://github.com/Tro48/jobDatePicker/releases/download/v0.1.7/smeny.apk',
  version: '0.1.7',
  builtAt: '2026-09-03T10:00:00Z',
  notes: 'Видно, сколько уже отработано',
};

test('список выпусков разбирается целиком', () => {
  assert.deepEqual(parseReleaseManifest(valid), valid);
});

test('ссылка не по https не принимается: её открывает Linking', () => {
  for (const url of [
    'http://example.com/a.apk',
    'intent://scan/#Intent;end',
    'file:///sdcard/a.apk',
    '',
  ]) {
    assert.equal(parseReleaseManifest({ ...valid, url }), null, url);
  }
});

test('без отпечатка и на мусоре — ничего', () => {
  assert.equal(parseReleaseManifest({ ...valid, runtimeVersion: '' }), null);
  assert.equal(parseReleaseManifest({ url: valid.url }), null);
  assert.equal(parseReleaseManifest(null), null);
  assert.equal(parseReleaseManifest('строка'), null);
});

test('необязательные поля пустыми строками не подставляются', () => {
  const parsed = parseReleaseManifest({ ...valid, version: '', builtAt: 42, notes: null });
  assert.ok(parsed);
  assert.equal(parsed.version, undefined);
  assert.equal(parsed.builtAt, undefined);
  assert.equal(parsed.notes, undefined);
});

test('новой считается сборка с другим отпечатком, а в отладочной — никакая', () => {
  const manifest = parseReleaseManifest(valid);
  assert.equal(isNewerBuild(manifest, 'старый'), true);
  assert.equal(isNewerBuild(manifest, 'a1b2c3'), false);
  // Отладочная сборка: отпечатка нет, сравнивать не с чем.
  assert.equal(isNewerBuild(manifest, null), false);
  assert.equal(isNewerBuild(null, 'a1b2c3'), false);
});

test('записи «что нового» идут от свежей к старой и не повторяются', () => {
  const ids = RELEASE_NOTES.map((note) => note.id);
  assert.deepEqual(ids, [...ids].sort().reverse());
  assert.equal(new Set(ids).size, ids.length);
  for (const note of RELEASE_NOTES) {
    assert.match(note.id, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(note.title.length > 0 && note.items.length > 0, note.id);
  }
});

test('без отметки показывается всё, с отметкой — только новее её', () => {
  const [latest] = RELEASE_NOTES;
  assert.deepEqual(unseenReleases(null), RELEASE_NOTES);
  assert.deepEqual(unseenReleases(latest.id), []);
  assert.deepEqual(unseenReleases('2000-01-01'), RELEASE_NOTES);
});
