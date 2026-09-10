import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QR_PAYLOAD_LIMIT,
  ShareFormatError,
  buildSharedTrack,
  decodeTrack,
  encodeTrack,
  fitsInQr,
  packTrack,
  payloadFromUrl,
  trackShareUrl,
  unpackTrack,
} from '../share.ts';
import type { SharedOverride, SharedTrack } from '../share.ts';
import { decodeBase64Url, decodeUtf8, encodeBase64Url, encodeUtf8 } from '../bytes.ts';
import { DEFAULT_SHIFT_TYPES } from '../shifts.ts';
import { SCHEDULE_PRESETS } from '../presets.ts';
import { addDays } from '../date.ts';
import { shiftDurationMinutes } from '../engine.ts';

const evening = {
  id: 'evening',
  builtinId: null,
  name: 'Вечерняя смена',
  badge: 'Веч',
  kind: 'work',
  colorToken: 'shift.extra',
  time: { start: '16:00', end: '00:00', unpaidBreakMinutes: 30 },
  rateMultiplier: 1.2,
} as const;

const dayShift = DEFAULT_SHIFT_TYPES.find((type) => type.id === 'day12')!;
const off = DEFAULT_SHIFT_TYPES.find((type) => type.id === 'off')!;

function shareOf(
  overrides: SharedOverride[] = [],
  payments: SharedTrack['payments'] = [],
): SharedTrack {
  return {
    name: 'Аня',
    shiftTypes: [dayShift, off, evening],
    pattern: { kind: 'cycle', slots: [dayShift.id, dayShift.id, off.id, off.id] },
    anchorDate: '2026-09-01',
    overrides,
    payments,
  };
}

test('байты: текст, числа и base64 ходят туда-обратно', () => {
  for (const value of ['', 'Аня', 'Вечерняя смена ×1,2', 'ok', '🙂 смена']) {
    assert.equal(decodeUtf8(encodeUtf8(value)), value);
  }

  for (const bytes of [[], [0], [255, 0, 128], [1, 2, 3, 4, 5, 6, 7]]) {
    const source = Uint8Array.from(bytes);
    assert.deepEqual(decodeBase64Url(encodeBase64Url(source)), source);
  }
});

test('график ходит туда-обратно без потерь', () => {
  const share = shareOf([
    { date: '2026-09-10', shiftTypeId: 'evening' },
    { date: '2026-09-14', workedMinutesOverride: 600 },
    { date: '2026-09-20', shiftTypeId: 'off' },
  ]);

  const back = unpackTrack(packTrack(share));

  assert.equal(back.name, 'Аня');
  assert.equal(back.anchorDate, '2026-09-01');
  assert.equal(back.shiftTypes.length, 3);
  assert.equal(back.overrides.length, 3);
  // Смены получают новые id: на принимающем телефоне «evening» может быть занят.
  assert.equal(back.shiftTypes[2].name, 'Вечерняя смена');
  assert.equal(back.shiftTypes[2].rateMultiplier, 1.2);
  assert.equal(shiftDurationMinutes(back.shiftTypes[2]), 7 * 60 + 30);
  // Правка ссылается на смену по её новому id, а не по старому.
  assert.equal(back.overrides[0].shiftTypeId, back.shiftTypes[2].id);
  assert.equal(back.overrides[1].workedMinutesOverride, 600);
});

test('недельный график ходит туда-обратно, включая вторую неделю', () => {
  const weekly = SCHEDULE_PRESETS.find((preset) => preset.id === '5-2')!;
  const share: SharedTrack = {
    ...shareOf(),
    shiftTypes: DEFAULT_SHIFT_TYPES,
    pattern: {
      kind: 'weekly',
      weeks: [
        weekly.pattern.kind === 'weekly' ? weekly.pattern.weeks[0] : ({} as never),
        weekly.pattern.kind === 'weekly' ? weekly.pattern.weeks[0] : ({} as never),
      ],
    },
  };

  const back = unpackTrack(packTrack(share));
  assert.equal(back.pattern.kind, 'weekly');
  assert.equal(back.pattern.kind === 'weekly' ? back.pattern.weeks.length : 0, 2);
});

test('ссылка разбирается обратно в тот же график', () => {
  const share = shareOf([{ date: '2026-10-01', shiftTypeId: 'off' }]);
  const url = trackShareUrl(share);

  assert.ok(url.startsWith('jobdatepicker://track?v=1&d='));

  const payload = payloadFromUrl(url);
  assert.ok(payload !== null);
  assert.equal(decodeTrack(payload).name, 'Аня');
});

test('чужой QR-код сканер не считает своим', () => {
  assert.equal(payloadFromUrl('https://example.com/?d=abc'), null);
  assert.equal(payloadFromUrl('просто текст'), null);
});

test('неизвестная версия формата — это «обнови приложение», а не половина графика', () => {
  const payload = encodeTrack(shareOf());
  const bytes = decodeBase64Url(payload);
  bytes[0] = 9;

  assert.throws(
    () => decodeTrack(encodeBase64Url(bytes)),
    (error: unknown) => error instanceof ShareFormatError && error.kind === 'version',
  );
});

test('обрезанный и битый код отвергаются целиком', () => {
  const payload = encodeTrack(shareOf());

  assert.throws(() => decodeTrack(payload.slice(0, payload.length - 12)), ShareFormatError);
  assert.throws(() => decodeTrack('не-код'), ShareFormatError);
  assert.throws(() => decodeTrack(''), ShareFormatError);
});

test('обычный график с полусотней правок влезает в QR-код', () => {
  const overrides = Array.from({ length: 50 }, (_, index) => ({
    date: addDays('2026-09-01', index * 3),
    shiftTypeId: index % 2 === 0 ? 'evening' : 'off',
  }));

  const payload = encodeTrack(shareOf(overrides));
  assert.ok(fitsInQr(payload), `вышло ${payload.length} символов при пределе ${QR_PAYLOAD_LIMIT}`);
});

test('заметки и выплаты в код не попадают вовсе', () => {
  const built = buildSharedTrack({
    name: 'Аня',
    shiftTypes: [dayShift, off, evening],
    pattern: { kind: 'cycle', slots: [dayShift.id, off.id] },
    anchorDate: '2026-09-01',
    overrides: [{ date: '2026-09-10', shiftTypeId: 'evening' }],
  });

  assert.equal(built.payments.length, 0);
  // Уезжает только правка со сменой: заметок в коде графика больше нет.
  assert.equal(built.overrides.length, 1);
  assert.equal(built.overrides[0].note, undefined);
});

// Свои коды заметок и выплат больше не несут, но пришедший со старой версии
// обязан разобраться целиком: формат не менялся, менялось только то, что кладём.
test('заметки и выплаты из старого кода доезжают целиком', () => {
  const share = shareOf(
    [{ date: '2026-09-10', shiftTypeId: 'evening', note: 'подмена за Сергея' }],
    [{ kind: 'salary', period: '2026-09', receivedOn: '2026-10-10', amount: 75_000 }],
  );

  const back = decodeTrack(encodeTrack(share));

  assert.equal(back.overrides[0].note, 'подмена за Сергея');
  assert.equal(back.payments.length, 1);
  assert.equal(back.payments[0].amount, 75_000);
  assert.equal(back.payments[0].receivedOn, '2026-10-10');
});

test('слишком много правок — это отказ и переход на файл, а не нечитаемый квадрат', () => {
  // Пятьсот правок с заметками: столько в код не уложить никаким сжатием.
  const overrides = Array.from({ length: 500 }, (_, index) => ({
    date: addDays('2026-01-01', index),
    shiftTypeId: index % 2 === 0 ? 'evening' : 'off',
    note: `смена номер ${index}, вышел вместо коллеги`,
  }));

  const payload = encodeTrack(shareOf(overrides));
  assert.equal(fitsInQr(payload), false);
  // При этом сам формат остаётся рабочим: файлом это уедет.
  assert.equal(decodeTrack(payload).overrides.length, 500);
});
