import test from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_FAILURE_TEXT, classifyUpdateError } from '../updateError.ts';

test('сетевые ошибки expo-updates опознаются по тексту', () => {
  const network = [
    new Error('Network request failed'),
    new Error('java.net.UnknownHostException: Unable to resolve host "u.expo.dev"'),
    new Error('The request timed out.'),
    new Error('Could not connect to the server.'),
  ];

  for (const error of network) {
    assert.equal(classifyUpdateError(error), 'network', error.message);
  }
});

test('всё остальное — общая причина, включая не-ошибки', () => {
  assert.equal(classifyUpdateError(new Error('Manifest verification failed')), 'unknown');
  assert.equal(classifyUpdateError('строка вместо ошибки'), 'unknown');
  assert.equal(classifyUpdateError(undefined), 'unknown');
});

test('человеку показывается русский текст без технических подробностей', () => {
  for (const text of Object.values(UPDATE_FAILURE_TEXT)) {
    assert.match(text, /^[А-ЯЁ]/);
    assert.doesNotMatch(text, /[a-z]{3}/i);
  }
});
