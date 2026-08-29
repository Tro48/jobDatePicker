import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { expiredOnceAlarmIds, planAlarms } from '@/domain/alarm.ts';
import type { AlarmOccurrence } from '@/domain/alarm.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import {
  EXACT_ALARM_PERMISSION_ERROR,
  cancelAllAlarms,
  getPermissions,
  isAlarmModuleAvailable,
  scheduleAlarms,
} from '@modules/shift-alarm';
import type { AlarmPermissions } from '@modules/shift-alarm';

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
}

const NO_PERMISSIONS: AlarmPermissions = {
  exactAlarms: false,
  fullScreenIntent: false,
  notifications: false,
};

/**
 * Держит будильники в системе в согласии со списком и графиком.
 *
 * Пересчёт идёт при любом изменении будильников, графика и правок дней, а
 * также при каждом возвращении в приложение: срабатывания живут в абсолютном
 * времени, и после перевода часов или недели без запуска их надо переставить.
 * Набор всегда заменяется целиком — рассинхронизироваться нечему.
 */
export function useAlarmSync(): AlarmSyncState {
  const context = useScheduleContext();
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
    () => planAlarms(alarms, context, new Date(plannedAt)),
    [alarms, context, plannedAt],
  );

  const sync = useCallback(async () => {
    if (!isAlarmModuleAvailable) return;
    setPermissions(getPermissions());

    if (occurrences.length === 0) {
      await cancelAllAlarms();
      setScheduled(0);
      setNeedsExactAlarmPermission(false);
      return;
    }

    try {
      const count = await scheduleAlarms(
        occurrences.map((occurrence) => ({
          id: occurrence.id,
          triggerAtMillis: occurrence.triggerAtMillis,
          title: occurrence.title,
          subtitle: occurrence.subtitle,
          snoozeMinutes: occurrence.snoozeMinutes,
          soundUri: occurrence.soundUri,
          vibrate: occurrence.vibrate,
        })),
      );
      setScheduled(count);
      setNeedsExactAlarmPermission(false);
    } catch (error) {
      // Единственная ожидаемая ошибка: у приложения отобрали точные будильники.
      // Остальное — настоящая поломка, её глушить нельзя.
      if ((error as { code?: string }).code !== EXACT_ALARM_PERMISSION_ERROR) throw error;
      setScheduled(0);
      setNeedsExactAlarmPermission(true);
    }
  }, [occurrences]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setPlannedAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  return {
    occurrences,
    scheduled,
    permissions,
    available: isAlarmModuleAvailable,
    needsExactAlarmPermission,
  };
}
