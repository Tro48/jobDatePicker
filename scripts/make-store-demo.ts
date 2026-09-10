import { readFileSync, writeFileSync } from 'node:fs';
import type { PersistedState } from '../src/data/store.ts';
import type { BackupFile } from '../src/data/backup.ts';
import { DEFAULT_SHIFT_TYPES } from '../src/domain/shifts.ts';
import { SCHEDULE_PRESETS } from '../src/domain/presets.ts';
import { LATEST_RELEASE_ID } from '../src/domain/releaseNotes.ts';
import type { DayNote, DayOverride, PaymentRecord, ScheduleTrack } from '../src/domain/types.ts';
import type { IsoDate } from '../src/domain/date.ts';

/**
 * Состояние для скриншотов карточки в магазине.
 *
 * Пустое приложение на витрине выглядит как пустое приложение: сетка без
 * ночных смен, сводка со строкой «выплат ещё не внесено». Живые данные для
 * съёмки нужны заведомо не настоящие — свои показывать нельзя, а придумывать
 * их руками в эмуляторе дольше, чем описать здесь.
 *
 * Файл получается обычной резервной копией и грузится тем же «Загрузить
 * настройки», что и всякая другая: отдельного отладочного входа в приложении
 * для этого не заводим.
 *
 * Запуск: npm run demo — кладёт docs/store/demo-backup.json (docs/* не в git).
 */

/**
 * Версия схемы и метка формата читаются из исходников, а не импортируются:
 * `src/data/store.ts` тянет zustand, mmkv и алиасы `@/…`, которых у голого
 * node нет. Промах регулярки — ошибка, а не молчаливая подстановка: файл с
 * чужой версией схемы приложение просто откажется принимать.
 */
function constantFrom(file: string, pattern: RegExp): string {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const found = source.match(pattern);
  if (!found) throw new Error(`не нашёл ${pattern} в ${file}`);
  return found[1];
}

const SCHEMA_VERSION = Number(
  constantFrom('../src/data/store.ts', /export const SCHEMA_VERSION = (\d+)/),
);
const BACKUP_FORMAT = constantFrom('../src/data/backup.ts', /BACKUP_FORMAT = '([^']+)'/);

/** День съёмки. От него отсчитывается всё остальное, чтобы кадры были свежими. */
const TODAY = '2026-09-10';

const preset = (id: string) => {
  const found = SCHEDULE_PRESETS.find((item) => item.id === id);
  if (!found) throw new Error(`нет пресета ${id}`);
  return found;
};

/** Смены, которые видно в календаре: день, ночь, отсыпной, выходной. */
const MIXED = preset('2-2-mixed');
const THREE = preset('3-3-day');

/**
 * Правки основной дорожки: отпуск в июле, больничный в августе и подработка в
 * выходной. Витрина обязана показывать, что и то и другое ставится периодом, а
 * не по одному дню.
 */
const overrides: Record<IsoDate, DayOverride> = {};
const addRange = (from: string, days: number, shiftTypeId: string): void => {
  const start = new Date(`${from}T00:00:00Z`);
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10) as IsoDate;
    overrides[date] = { date, shiftTypeId };
  }
};

addRange('2026-07-06', 14, 'vacation');
addRange('2026-08-17', 5, 'sick');
overrides['2026-09-05' as IsoDate] = { date: '2026-09-05' as IsoDate, shiftTypeId: 'extra' };
// Смена вышла длиннее плановой: в календаре это точка переработки, в сводке — часы.
overrides['2026-09-03' as IsoDate] = {
  date: '2026-09-03' as IsoDate,
  workedMinutesOverride: 14 * 60,
};

const main: ScheduleTrack = {
  id: 'track-main',
  name: 'Основная',
  own: true,
  schedules: [
    {
      startsOn: '2026-01-05' as IsoDate,
      presetId: MIXED.id,
      pattern: MIXED.pattern,
      anchorDate: '2026-01-05' as IsoDate,
    },
  ],
  overrides,
  payrollRules: [
    { kind: 'advance', dayOfMonth: 25, paidInMonthOffset: 0, weekendShift: 'before' },
    { kind: 'salary', dayOfMonth: 10, paidInMonthOffset: 1, weekendShift: 'before' },
  ],
};

/** Чужой график: по нему считаются общие выходные, но не часы и не деньги. */
const partner: ScheduleTrack = {
  id: 'track-partner',
  name: 'Аня',
  own: false,
  schedules: [
    {
      startsOn: '2026-01-01' as IsoDate,
      presetId: THREE.id,
      pattern: THREE.pattern,
      anchorDate: '2026-01-02' as IsoDate,
    },
  ],
  overrides: {},
  payrollRules: [],
};

/**
 * Выплаты за полгода: аванс и зарплата каждый месяц плюс отпускные перед
 * отпуском. Суммы ровные и явно ненастоящие — это витрина, а не чей-то доход.
 */
const payments: PaymentRecord[] = [];
const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
months.forEach((period, index) => {
  const [year, month] = period.split('-');
  payments.push({
    id: `pay-adv-${period}`,
    trackId: main.id,
    kind: 'advance',
    period,
    receivedOn: `${year}-${month}-25` as IsoDate,
    amount: 24_000,
  });
  const paidMonth = String(Number(month) + 1).padStart(2, '0');
  payments.push({
    id: `pay-sal-${period}`,
    trackId: main.id,
    kind: 'salary',
    period,
    receivedOn: `${year}-${paidMonth}-10` as IsoDate,
    amount: 41_000 + index * 500,
  });
});
payments.push({
  id: 'pay-vacation-2026-07',
  trackId: main.id,
  kind: 'vacationPay',
  period: '2026-07',
  receivedOn: '2026-07-03' as IsoDate,
  amount: 38_500,
});

const notes: DayNote[] = [
  {
    id: 'note-1',
    date: '2026-09-11' as IsoDate,
    text: 'Забрать посылку на почте до 19:00',
    remindAt: '17:30',
    createdAt: Date.parse('2026-09-08T09:12:00Z'),
  },
  {
    id: 'note-2',
    date: '2026-09-14' as IsoDate,
    text: 'Отдать Сергею смену, он подменял 2 сентября',
    remindAt: null,
    createdAt: Date.parse('2026-09-09T20:40:00Z'),
  },
  {
    id: 'note-3',
    date: '2026-09-25' as IsoDate,
    text: 'Аванс — отложить на резину',
    remindAt: '10:00',
    createdAt: Date.parse('2026-09-01T06:05:00Z'),
  },
];

const state: PersistedState = {
  appearance: 'system',
  themes: [],
  shiftTypes: DEFAULT_SHIFT_TYPES,
  customSchedules: [],
  holidays: { enabled: true },
  support: { adsHidden: false, purchasedAt: null, donationDismissed: false },
  tracks: [main, partner],
  payroll: { currency: '₽', forecastFromLastClosedMonth: true },
  sharedDaysOff: { enabled: true },
  sharedGroups: [{ id: 'group-1', name: 'Мы с Аней', trackIds: [main.id, partner.id] }],
  alarms: [
    {
      id: 'alarm-shift',
      label: 'На смену',
      time: '06:30',
      enabled: true,
      // Ради этого будильника приложение и ставят: он звонит только в рабочие
      // дни графика, и перед ночной подъём свой.
      repeat: {
        kind: 'schedule',
        tracks: [{ trackId: main.id, times: { day12: '06:30', night12: '18:00' } }],
      },
      soundUri: null,
      vibrate: true,
      snoozeMinutes: 10,
    },
    {
      id: 'alarm-gym',
      label: 'Бассейн',
      time: '08:00',
      enabled: false,
      repeat: { kind: 'weekly', days: [2, 4] },
      soundUri: null,
      vibrate: false,
      snoozeMinutes: 5,
    },
  ],
  notes,
  payments,
  lastSeenReleaseId: LATEST_RELEASE_ID,
  buildCheck: { checkedAt: 0, build: null, dismissedRuntime: null },
};

const backup: BackupFile = {
  format: BACKUP_FORMAT as BackupFile['format'],
  schema: SCHEMA_VERSION,
  createdAt: `${TODAY}T07:00:00.000Z`,
  state,
};

const target = new URL('../docs/store/demo-backup.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(backup, null, 2)}\n`);
console.log(
  `docs/store/demo-backup.json: графиков ${state.tracks.length}, ` +
    `правок ${Object.keys(overrides).length}, выплат ${payments.length}, заметок ${notes.length}`,
);
