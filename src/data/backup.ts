import { INITIAL_STATE, SCHEMA_VERSION, migrateState } from './store.ts';
import type { AppState, PersistedSnapshot, PersistedState } from './store.ts';

/**
 * Резервная копия всего состояния.
 *
 * README называет своим риском то, что схема хранилища ещё может меняться, а
 * отзывы конкурентов — потерянные данные при смене телефона. Копия закрывает и
 * то и другое: файл уходит куда угодно — в мессенджер, на почту, в облако, — и
 * возвращается через ту же миграцию, что и обычное обновление приложения.
 *
 * Формат — обычный JSON, а не упаковка из share.ts: файл не надо снимать
 * камерой, зато его полезно уметь открыть глазами и понять, что внутри.
 */

/** Метка в файле: по ней чужой JSON отличается от нашего. */
export const BACKUP_FORMAT = 'jobdatepicker-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  /** Версия схемы хранилища, в которой файл сделан. */
  schema: number;
  /** Когда сделан, в ISO. Показывается перед восстановлением. */
  createdAt: string;
  state: PersistedState;
}

/** Что внутри файла — человеку, до того как он согласится всё заменить. */
export interface BackupSummary {
  createdAt: string;
  schema: number;
  tracks: number;
  shiftTypes: number;
  overrides: number;
  payments: number;
  alarms: number;
}

export type BackupParseResult =
  { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; error: string };

/** Снимок состояния ровно в том виде, в каком он лежит в хранилище. */
export function createBackup(state: AppState, now = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schema: SCHEMA_VERSION,
    createdAt: now.toISOString(),
    state: {
      appearance: state.appearance,
      shiftTypes: state.shiftTypes,
      customSchedules: state.customSchedules,
      holidays: state.holidays,
      support: state.support,
      tracks: state.tracks,
      payroll: state.payroll,
      sharedDaysOff: state.sharedDaysOff,
      sharedGroups: state.sharedGroups,
      alarms: state.alarms,
      payments: state.payments,
      lastSeenReleaseId: state.lastSeenReleaseId,
      buildCheck: state.buildCheck,
    },
  };
}

export function serializeBackup(state: AppState, now = new Date()): string {
  // С отступами: файл открывают и читают глазами чаще, чем кажется, а лишние
  // килобайты в мессенджере никого не разорят.
  return JSON.stringify(createBackup(state, now), null, 2);
}

/**
 * Разбор файла до того, как что-то заменено.
 *
 * Возвращает результат, а не бросает: отказ здесь — обычное дело (человек
 * выбрал не тот файл), и он должен превратиться в понятную строку на экране, а
 * не в аварийный экран приложения.
 */
export function parseBackup(text: string): BackupParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Это не файл с данными приложения — внутри не те данные.' };
  }

  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Это не файл с данными приложения — внутри не те данные.' };
  }

  const file = raw as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'Файл сделан не этим приложением.' };
  }

  const schema = typeof file.schema === 'number' ? file.schema : 0;
  if (schema > SCHEMA_VERSION) {
    // Разобрать снимок из будущего нечем: миграции вперёд не бывает, а
    // прочитать его наполовину хуже, чем отказаться.
    return {
      ok: false,
      error:
        'Копия сделана более новой версией приложения. Обнови приложение и попробуй ещё раз — данные в файле целы.',
    };
  }

  if (typeof file.state !== 'object' || file.state === null) {
    return { ok: false, error: 'В файле нет данных — похоже, он повреждён.' };
  }

  const backup: BackupFile = {
    format: BACKUP_FORMAT,
    schema,
    createdAt: typeof file.createdAt === 'string' ? file.createdAt : '',
    state: file.state,
  };

  return { ok: true, backup, summary: summarize(backup) };
}

function summarize(backup: BackupFile): BackupSummary {
  const state = backup.state as Partial<PersistedState>;
  const tracks = Array.isArray(state.tracks) ? state.tracks : [];

  return {
    createdAt: backup.createdAt,
    schema: backup.schema,
    tracks: tracks.length,
    shiftTypes: Array.isArray(state.shiftTypes) ? state.shiftTypes.length : 0,
    overrides: tracks.reduce(
      (total, track) => total + Object.keys(track.overrides ?? {}).length,
      0,
    ),
    payments: Array.isArray(state.payments) ? state.payments.length : 0,
    alarms: Array.isArray(state.alarms) ? state.alarms.length : 0,
  };
}

/**
 * Состояние из копии.
 *
 * Прогоняется через ту же migrateState, что и обычное обновление приложения:
 * копия с прошлой схемы обязана открыться так же, как открылось бы старое
 * хранилище. Отдельного пути для копий нет намеренно — он бы разошёлся с
 * основным на первой же новой версии схемы.
 */
export function stateFromBackup(backup: BackupFile): AppState {
  const migrated = migrateState(backup.state as PersistedSnapshot, backup.schema);
  // Взгляд не восстанавливается: активная дорожка — состояние экрана, а не
  // данные, и в копию она не попадает.
  return { ...migrated, activeTrackId: INITIAL_STATE.activeTrackId };
}
