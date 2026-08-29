import { requireOptionalNativeModule } from 'expo';

/** Будильник в том виде, в каком его принимает нативный модуль. */
export interface NativeAlarm {
  id: string;
  /** Момент срабатывания в миллисекундах эпохи. */
  triggerAtMillis: number;
  title: string;
  subtitle: string;
  snoozeMinutes: number;
}

interface ShiftAlarmNativeModule {
  canScheduleExactAlarms(): boolean;
  canUseFullScreenIntent(): boolean;
  areNotificationsEnabled(): boolean;
  openExactAlarmSettings(): void;
  openFullScreenIntentSettings(): void;
  openNotificationSettings(): void;
  schedule(alarms: NativeAlarm[]): Promise<number>;
  cancelAll(): Promise<void>;
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

/** Заменяет весь набор будильников. Возвращает, сколько поставлено. */
export async function scheduleAlarms(alarms: NativeAlarm[]): Promise<number> {
  if (!native) return 0;
  return native.schedule(alarms);
}

export async function cancelAllAlarms(): Promise<void> {
  await native?.cancelAll();
}
