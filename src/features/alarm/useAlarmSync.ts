import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { planAlarms } from '@/domain/alarm.ts';
import type { PlannedAlarm } from '@/domain/alarm.ts';
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
  /** Что должно звонить по графику. Считается всегда, даже без нативной части. */
  planned: PlannedAlarm[];
  /** Сколько будильников реально поставлено в систему. */
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
 * Держит будильники в системе в согласии с графиком.
 *
 * Пересчёт запускается при любом изменении графика, правок дней и настроек
 * будильника, а также при каждом возвращении в приложение: будильники живут в
 * абсолютном времени, и после перевода часов или недели без запуска их надо
 * переставить. Набор всегда заменяется целиком — так нечему рассинхронизироваться.
 */
export function useAlarmSync(): AlarmSyncState {
  const context = useScheduleContext();
  const settings = useAppStore((state) => state.alarms);

  const [permissions, setPermissions] = useState<AlarmPermissions>(() =>
    isAlarmModuleAvailable ? getPermissions() : NO_PERMISSIONS,
  );
  const [scheduled, setScheduled] = useState(0);
  const [needsExactAlarmPermission, setNeedsExactAlarmPermission] = useState(false);

  const planned = useMemo(
    () => (context ? planAlarms(context, settings, new Date()) : []),
    [context, settings],
  );

  const sync = useCallback(async () => {
    if (!isAlarmModuleAvailable) return;
    setPermissions(getPermissions());

    if (planned.length === 0) {
      await cancelAllAlarms();
      setScheduled(0);
      setNeedsExactAlarmPermission(false);
      return;
    }

    try {
      const count = await scheduleAlarms(
        planned.map((alarm) => ({
          id: alarm.id,
          triggerAtMillis: alarm.triggerAtMillis,
          title: alarm.title,
          subtitle: alarm.subtitle,
          snoozeMinutes: settings.snoozeMinutes,
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
  }, [planned, settings.snoozeMinutes]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => subscription.remove();
  }, [sync]);

  return {
    planned,
    scheduled,
    permissions,
    available: isAlarmModuleAvailable,
    needsExactAlarmPermission,
  };
}
