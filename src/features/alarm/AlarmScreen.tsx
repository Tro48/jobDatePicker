import { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { formatTimeUntil } from '@/domain/format.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
  requestNotifications,
} from '@modules/shift-alarm';
import { AppText, Button, Card, Fab, Screen, useNow } from '@/ui';
import { useTheme } from '@/theme';
import { AlarmRow } from './AlarmRow.tsx';
import { useAlarmSyncState } from './AlarmSyncProvider.tsx';

/** Запас снизу под круглой кнопкой: последняя карточка не должна уезжать под неё. */
const FAB_CLEARANCE = 96;

export function AlarmScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
  const alarms = useAppStore((state) => state.alarms);
  const tracks = useAppStore((state) => state.tracks);
  const setAlarmEnabled = useAppStore((state) => state.setAlarmEnabled);
  const removeAlarm = useAppStore((state) => state.removeAlarm);

  const { occurrences, permissions, available, needsExactAlarmPermission, refreshPermissions } =
    useAlarmSyncState();

  // Имена графиков для карточек: по какому именно звонит этот будильник.
  const trackNames = useMemo(
    () => new Map(tracks.map((track) => [track.id, track.name])),
    [tracks],
  );
  // Раз в минуту: строка «звонок через …» иначе замирает на значении, которое
  // посчиталось при первом рендере экрана.
  const now = useNow();

  const askNotifications = useCallback(() => {
    void requestNotifications().then(refreshPermissions);
  }, [refreshPermissions]);

  /** Ближайшее срабатывание каждого будильника — то, что показывает карточка. */
  const nextByAlarm = useMemo(() => {
    const map = new Map<string, (typeof occurrences)[number]>();
    for (const occurrence of occurrences) {
      if (!map.has(occurrence.alarmId)) map.set(occurrence.alarmId, occurrence);
    }
    return map;
  }, [occurrences]);

  // Под заголовком — время до ближайшего звонка, а не описание возможностей.
  const soonest = occurrences[0];
  const subtitle = soonest
    ? `Звонок через ${formatTimeUntil(Math.round((soonest.triggerAtMillis - now) / 60_000))}`
    : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Будильник" subtitle={subtitle}>
        {!available ? (
          // Модуль нативный: в старой сборке его просто нет, и врать про
          // поставленные будильники нельзя.
          <Card title="Нужна новая сборка">
            <AppText variant="body" tone="muted">
              Будильник работает через нативный модуль. В установленной сборке его ещё нет — список
              ниже сохраняется, но звонить некому.
            </AppText>
          </Card>
        ) : null}

        {available && needsExactAlarmPermission ? (
          <Card title="Точные будильники запрещены">
            <AppText variant="body">
              Android не даёт приложению ставить точные будильники, поэтому расписание не
              поставлено. Без этого разрешения будильник опоздает на десятки минут.
            </AppText>
            <Button title="Разрешить" variant="primary" onPress={openExactAlarmSettings} />
          </Card>
        ) : null}

        {available && !permissions.notifications ? (
          <Card title="Уведомления выключены">
            <AppText variant="body">
              Звонок идёт через уведомление. Пока они запрещены, экран будильника может не
              показаться.
            </AppText>
            {/* Сначала системный диалог: с Android 13 разрешение не выдано по
                умолчанию, и гонять человека в настройки телефона за тем, о чём
                система готова спросить сама, незачем. */}
            <Button title="Разрешить" variant="primary" onPress={askNotifications} />
            <AppText variant="caption" tone="muted">
              Если диалог не появился, Android больше не спрашивает — тогда разрешение включается
              только в настройках телефона.
            </AppText>
            <Button title="Настройки уведомлений" onPress={openNotificationSettings} />
          </Card>
        ) : null}

        {available && !permissions.fullScreenIntent ? (
          <Card title="Экран поверх блокировки запрещён">
            <AppText variant="body">
              Будильник зазвонит, но покажется шторкой сверху, а не своим экраном на весь телефон.
            </AppText>
            <Button title="Разрешить" onPress={openFullScreenIntentSettings} />
          </Card>
        ) : null}

        {alarms.length === 0 ? (
          <Card title="Будильников нет">
            <AppText variant="body" tone="muted">
              Обычный будильник ставится на время и дни недели, а режим «по графику» звонит в
              рабочие дни — с отдельным временем подъёма для дневных и ночных смен.
            </AppText>
          </Card>
        ) : (
          <View accessibilityRole="list" style={{ gap: theme.spacing.md }}>
            {alarms.map((alarm) => (
              <AlarmRow
                key={alarm.id}
                alarm={alarm}
                next={nextByAlarm.get(alarm.id) ?? null}
                trackNames={trackNames}
                now={now}
                onEdit={() => push(`/alarm/${alarm.id}`)}
                onToggle={(enabled) => setAlarmEnabled(alarm.id, enabled)}
                onDelete={() => removeAlarm(alarm.id)}
              />
            ))}
          </View>
        )}

        <View style={{ height: FAB_CLEARANCE }} />
      </Screen>

      <Fab name="add" label="Добавить будильник" onPress={() => push('/alarm/new')} />
    </View>
  );
}
