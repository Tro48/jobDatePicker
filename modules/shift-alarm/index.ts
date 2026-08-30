import { requireOptionalNativeModule } from 'expo';

/** Будильник в том виде, в каком его принимает нативный модуль. */
export interface NativeAlarm {
  id: string;
  /** Момент срабатывания в миллисекундах эпохи. */
  triggerAtMillis: number;
  title: string;
  subtitle: string;
  snoozeMinutes: number;
  /** URI системной мелодии. null — сигнал будильника по умолчанию. */
  soundUri: string | null;
  vibrate: boolean;
}

/** Системная мелодия из списка Android. */
export interface Ringtone {
  uri: string;
  title: string;
}

interface ShiftAlarmNativeModule {
  canScheduleExactAlarms(): boolean;
  canUseFullScreenIntent(): boolean;
  areNotificationsEnabled(): boolean;
  openExactAlarmSettings(): void;
  openFullScreenIntentSettings(): void;
  openNotificationSettings(): void;
  requestNotifications(): Promise<boolean>;
  schedule(alarms: NativeAlarm[]): Promise<number>;
  cancelAll(): Promise<void>;
  listRingtones(): Promise<Ringtone[]>;
  previewRingtone(uri: string | null): Promise<void>;
  stopRingtonePreview(): Promise<void>;
}

/**
 * Модуль требует dev build. Через requireOptional, а не requireNativeModule:
 * в старой сборке без нативной части приложение должно работать и честно
 * говорить, что будильник недоступен, а не падать на старте.
 */
const native = requireOptionalNativeModule<ShiftAlarmNativeModule>('ShiftAlarm');

/** Есть ли нативная часть в этой сборке. */
export const isAlarmModuleAvailable = native !== null;

/** Код ошибки нативного schedule, когда система не даёт ставить точные будильники. */
export const EXACT_ALARM_PERMISSION_ERROR = 'ERR_EXACT_ALARM_PERMISSION';

export interface AlarmPermissions {
  /** Точные будильники: без них расписание не ставится вообще. */
  exactAlarms: boolean;
  /** Полноэкранный intent: без него будильник покажется шторкой. */
  fullScreenIntent: boolean;
  /** Уведомления: без них не видно, что звонок идёт. */
  notifications: boolean;
}

export function getPermissions(): AlarmPermissions {
  if (!native) {
    return { exactAlarms: false, fullScreenIntent: false, notifications: false };
  }
  return {
    exactAlarms: native.canScheduleExactAlarms(),
    fullScreenIntent: native.canUseFullScreenIntent(),
    notifications: native.areNotificationsEnabled(),
  };
}

export function openExactAlarmSettings(): void {
  native?.openExactAlarmSettings();
}

export function openFullScreenIntentSettings(): void {
  native?.openFullScreenIntentSettings();
}

export function openNotificationSettings(): void {
  native?.openNotificationSettings();
}

/**
 * Спросить разрешение на уведомления системным диалогом.
 *
 * Возвращает, выдано ли оно в итоге. false приходит и когда человек отказал, и
 * когда система больше не спрашивает — тогда остаётся только ссылка в
 * настройки телефона.
 */
export async function requestNotifications(): Promise<boolean> {
  if (!native) return false;
  return native.requestNotifications();
}

/** Заменяет весь набор будильников. Возвращает, сколько поставлено. */
export async function scheduleAlarms(alarms: NativeAlarm[]): Promise<number> {
  if (!native) return 0;
  return native.schedule(alarms);
}

export async function cancelAllAlarms(): Promise<void> {
  await native?.cancelAll();
}

/** Мелодии будильника, установленные в системе. Пустой список — модуля нет. */
export async function listRingtones(): Promise<Ringtone[]> {
  if (!native) return [];
  return native.listRingtones();
}

/** Проиграть мелодию при выборе. null — сигнал по умолчанию. */
export async function previewRingtone(uri: string | null): Promise<void> {
  await native?.previewRingtone(uri);
}

export async function stopRingtonePreview(): Promise<void> {
  await native?.stopRingtonePreview();
}
