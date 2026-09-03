import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { expiredOnceAlarmIds, planAlarms } from '@/domain/alarm.ts';
import type { AlarmOccurrence } from '@/domain/alarm.ts';
import { useAlarmTracks } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import {
  EXACT_ALARM_PERMISSION_ERROR,
  cancelAllAlarms,
  getPermissions,
  isAlarmModuleAvailable,
  scheduleAlarms,
} from '@modules/shift-alarm';
import type { AlarmPermissions, NativeAlarm } from '@modules/shift-alarm';

export interface AlarmSyncState {
  /** Что должно зазвонить. Считается всегда, даже без нативной части. */
  occurrences: AlarmOccurrence[];
  /** Сколько срабатываний реально поставлено в систему. */
  scheduled: number;
  permissions: AlarmPermissions;
  /** Нативный модуль есть в этой сборке. */
  available: boolean;
  /** Система не даёт ставить точные будильники — расписание не поставлено. */
  needsExactAlarmPermission: boolean;
  /** Перечитать разрешения — после системного диалога или возврата из настроек. */
  refreshPermissions: () => void;
}

const NO_PERMISSIONS: AlarmPermissions = {
  exactAlarms: false,
  fullScreenIntent: false,
  notifications: false,
};

/**
 * Одинаковы ли разрешения по значению.
 *
 * Нативный модуль отдаёт каждый раз новый объект, а состояние с новым объектом
 * — это перерисовка. Провайдер синхронизации стоит в корне навигации, и такая
 * перерисовка проходит по всему приложению: календарь, сводка, шторки. Сверка
 * по значению оставляет её только там, где разрешения правда изменились.
 */
function samePermissions(a: AlarmPermissions, b: AlarmPermissions): boolean {
  return (
    a.exactAlarms === b.exactAlarms &&
    a.fullScreenIntent === b.fullScreenIntent &&
    a.notifications === b.notifications
  );
}

/**
 * Держит будильники в системе в согласии со списком и графиком.
 *
 * Пересчёт идёт при любом изменении будильников, графиков и правок дней, а
 * также при каждом возвращении в приложение: срабатывания живут в абсолютном
 * времени, и после перевода часов или недели без запуска их надо переставить.
 * Набор всегда заменяется целиком — рассинхронизироваться нечему.
 */
export function useAlarmSync(): AlarmSyncState {
  const tracks = useAlarmTracks();
  const alarms = useAppStore((state) => state.alarms);
  const disableAlarms = useAppStore((state) => state.disableAlarms);

  const [permissions, setPermissions] = useState<AlarmPermissions>(() =>
    isAlarmModuleAvailable ? getPermissions() : NO_PERMISSIONS,
  );
  const [scheduled, setScheduled] = useState(0);
  const [needsExactAlarmPermission, setNeedsExactAlarmPermission] = useState(false);
  // Метка «когда считали»: без неё расписание, посчитанное при запуске,
  // так и осталось бы вчерашним после недели в фоне.
  const [plannedAt, setPlannedAt] = useState(() => Date.now());

  // Разовый будильник гаснет сам, отзвонив. Отследить это может только JS,
  // поэтому проверка идёт при каждом пересчёте.
  useEffect(() => {
    disableAlarms(expiredOnceAlarmIds(alarms, new Date(plannedAt)));
  }, [alarms, plannedAt, disableAlarms]);

  const occurrences = useMemo(
    () => planAlarms(alarms, tracks, new Date(plannedAt)),
    [alarms, tracks, plannedAt],
  );

  /** Ровно то, что уйдёт в систему. Считается отдельно — по нему же сверяемся. */
  const request = useMemo<NativeAlarm[]>(
    () =>
      occurrences.map((occurrence) => ({
        id: occurrence.id,
        triggerAtMillis: occurrence.triggerAtMillis,
        title: occurrence.title,
        subtitle: occurrence.subtitle,
        snoozeMinutes: occurrence.snoozeMinutes,
        soundUri: occurrence.soundUri,
        vibrate: occurrence.vibrate,
      })),
    [occurrences],
  );

  /**
   * Что именно уже стоит в системе.
   *
   * Расписание пересчитывается на каждое изменение правок дня — а правка дня
   * меняется на каждую букву заметки. Содержимое при этом почти всегда то же
   * самое, и без сверки телефон заново снимал бы и ставил все пятьдесят
   * будильников на символ. Разрешение входит в ключ, чтобы после его возврата
   * расписание встало, не дожидаясь изменения самого набора.
   */
  const applied = useRef<string | null>(null);

  /** Кладёт разрешения в состояние, только если они правда другие. */
  const applyPermissions = useCallback((next: AlarmPermissions) => {
    setPermissions((previous) => (samePermissions(previous, next) ? previous : next));
  }, []);

  const sync = useCallback(async () => {
    if (!isAlarmModuleAvailable) return;

    const current = getPermissions();
    applyPermissions(current);

    const key = `${current.exactAlarms}:${JSON.stringify(request)}`;
    if (applied.current === key) return;

    if (request.length === 0) {
      await cancelAllAlarms();
      setScheduled(0);
      setNeedsExactAlarmPermission(false);
      applied.current = key;
      return;
    }

    try {
      const count = await scheduleAlarms(request);
      setScheduled(count);
      setNeedsExactAlarmPermission(false);
      // Метка ставится только после успеха: иначе неудачная постановка
      // считалась бы применённой и повторить её было бы нечем.
      applied.current = key;
    } catch (error) {
      // Единственная ожидаемая ошибка: у приложения отобрали точные будильники.
      // Остальное — настоящая поломка, её глушить нельзя.
      if ((error as { code?: string }).code !== EXACT_ALARM_PERMISSION_ERROR) throw error;
      setScheduled(0);
      setNeedsExactAlarmPermission(true);
    }
  }, [request, applyPermissions]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setPlannedAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  const refreshPermissions = useCallback(() => {
    if (isAlarmModuleAvailable) applyPermissions(getPermissions());
  }, [applyPermissions]);

  // Значение уходит в контекст: новый объект на каждый рендер перерисовывал бы
  // всех, кто его читает, — полоску разрешений на календаре в том числе.
  return useMemo(
    () => ({
      occurrences,
      scheduled,
      permissions,
      available: isAlarmModuleAvailable,
      needsExactAlarmPermission,
      refreshPermissions,
    }),
    [occurrences, scheduled, permissions, needsExactAlarmPermission, refreshPermissions],
  );
}
