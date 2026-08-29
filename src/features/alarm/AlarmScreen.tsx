import { useMemo } from 'react';
import { View } from 'react-native';
import { indexShiftTypes } from '@/domain/shifts.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '@modules/shift-alarm';
import { AppText, Button, Card, Screen } from '@/ui';
import { useTheme } from '@/theme';
import { AlarmRow } from './AlarmRow.tsx';
import { useAlarmSyncState } from './AlarmSyncProvider.tsx';

export function AlarmScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
  const alarms = useAppStore((state) => state.alarms);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const setAlarmEnabled = useAppStore((state) => state.setAlarmEnabled);

  const { occurrences, scheduled, permissions, available, needsExactAlarmPermission } =
    useAlarmSyncState();

  const index = useMemo(() => indexShiftTypes(shiftTypes), [shiftTypes]);
  const now = Date.now();

  /** Ближайшее срабатывание каждого будильника — то, что показывает строка списка. */
  const nextByAlarm = useMemo(() => {
    const map = new Map<string, (typeof occurrences)[number]>();
    for (const occurrence of occurrences) {
      if (!map.has(occurrence.alarmId)) map.set(occurrence.alarmId, occurrence);
    }
    return map;
  }, [occurrences]);

  return (
    <Screen title="Будильник" subtitle="Звонит даже на заблокированном экране">
      {!available ? (
        // Модуль нативный: в старой сборке его просто нет, и врать про
        // поставленные будильники нельзя.
        <Card title="Нужна новая сборка">
          <AppText variant="body" tone="muted">
            Будильник работает через нативный модуль. В установленной сборке его ещё нет —
            список ниже сохраняется, но звонить некому.
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
          <Button title="Включить уведомления" onPress={openNotificationSettings} />
        </Card>
      ) : null}

      {available && !permissions.fullScreenIntent ? (
        <Card title="Экран поверх блокировки запрещён">
          <AppText variant="body">
            Будильник зазвонит, но покажется шторкой сверху, а не своим экраном на весь
            телефон.
          </AppText>
          <Button title="Разрешить" onPress={openFullScreenIntentSettings} />
        </Card>
      ) : null}

      <Card title="Мои будильники">
        {alarms.length === 0 ? (
          <AppText variant="body" tone="muted">
            Ни одного будильника пока нет. Обычный будильник ставится на время и дни недели,
            а режим «по графику» звонит только в рабочие дни — у ночных и дневных смен своё
            время подъёма.
          </AppText>
        ) : (
          <View accessibilityRole="list" style={{ gap: theme.spacing.sm }}>
            {alarms.map((alarm) => (
              <AlarmRow
                key={alarm.id}
                alarm={alarm}
                next={nextByAlarm.get(alarm.id) ?? null}
                shiftTypes={index}
                now={now}
                onEdit={() => push(`/alarm/${alarm.id}`)}
                onToggle={(enabled) => setAlarmEnabled(alarm.id, enabled)}
              />
            ))}
          </View>
        )}
        <Button title="Добавить будильник" variant="primary" onPress={() => push('/alarm/new')} />
        {available && scheduled > 0 ? (
          <AppText variant="caption" tone="muted">
            Поставлено в систему: {scheduled}. Расписание продлевается при каждом открытии
            приложения.
          </AppText>
        ) : null}
      </Card>

      <Card title="Что может помешать">
        {/* Честно: это не лечится кодом, и молчать об этом хуже, чем сказать. */}
        <AppText variant="body" tone="muted">
          Оболочки Xiaomi, Huawei, Oppo, Vivo и Samsung выгружают приложения из памяти. Если
          будильник не звонит — разреши автозапуск и сними ограничение батареи для «Смен» в
          настройках телефона.
        </AppText>
        <AppText variant="body" tone="muted">
          Принудительная остановка приложения снимает все его будильники до следующего
          запуска — так устроен Android.
        </AppText>
      </Card>
    </Screen>
  );
}
