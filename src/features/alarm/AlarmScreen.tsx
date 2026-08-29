import { useMemo } from 'react';
import { View } from 'react-native';
import { formatDayLong, formatDayShort } from '@/domain/format.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import {
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '@modules/shift-alarm';
import { AppText, Button, Card, Screen, TextField, Toggle } from '@/ui';
import { useTheme } from '@/theme';
import { ShiftAlarmRow } from './ShiftAlarmRow.tsx';
import { useAlarmSync } from './useAlarmSync.ts';

export function AlarmScreen() {
  const theme = useTheme();
  const context = useScheduleContext();
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const settings = useAppStore((state) => state.alarms);
  const setAlarmsEnabled = useAppStore((state) => state.setAlarmsEnabled);
  const setSnoozeMinutes = useAppStore((state) => state.setSnoozeMinutes);

  const { planned, scheduled, permissions, available, needsExactAlarmPermission } = useAlarmSync();

  // Будить можно только на смену: у выходного и отпуска времени начала нет.
  const workTypes = useMemo(
    () => shiftTypes.filter((type) => type.kind === 'work' && type.time),
    [shiftTypes],
  );

  return (
    <Screen title="Будильник" subtitle="Звонит перед сменой по графику">
      {!available ? (
        // Модуль нативный: в старой сборке его просто нет, и врать про
        // поставленные будильники нельзя.
        <Card title="Нужна новая сборка">
          <AppText variant="body" tone="muted">
            Будильник работает через нативный модуль. В установленной сборке его ещё нет —
            расписание ниже считается, но звонить некому.
          </AppText>
        </Card>
      ) : null}

      {!context ? (
        <Card title="График не выбран">
          <AppText variant="body" tone="muted">
            Будить не по чему. Выбери график — расписание появится само.
          </AppText>
        </Card>
      ) : null}

      <Card title="Настройки">
        <Toggle
          label="Будильник включён"
          hint="Общий выключатель: снимает все будильники разом"
          value={settings.enabled}
          onValueChange={setAlarmsEnabled}
        />
        <TextField
          label="Отложить на, минут"
          value={String(settings.snoozeMinutes)}
          onChangeText={(text) => {
            const minutes = Number(text.replace(/\D/g, ''));
            if (Number.isFinite(minutes) && text.length > 0) setSnoozeMinutes(minutes);
          }}
          keyboardType="number-pad"
          hint="Столько ждёт кнопка «Отложить» на экране будильника"
        />
      </Card>

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

      <Card title="По типам смен">
        {workTypes.map((type) => (
          <ShiftAlarmRow key={type.id} shiftType={type} settings={settings} />
        ))}
      </Card>

      <Card title="Ближайшие звонки">
        {planned.length === 0 ? (
          <AppText variant="body" tone="muted">
            {settings.enabled
              ? 'Ни для одного типа смены будильник не включён.'
              : 'Будильник выключен целиком.'}
          </AppText>
        ) : (
          <View
            accessibilityRole="list"
            accessibilityLabel="Ближайшие будильники"
            style={{ gap: theme.spacing.sm }}
          >
            {planned.map((alarm) => (
              <View
                key={alarm.id}
                accessibilityRole="text"
                accessibilityLabel={`${alarm.wakeTime}, ${formatDayLong(alarm.wakeDate).toLowerCase()}, ${alarm.title}, начало смены в ${alarm.shiftStartTime}`}
                style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.md }}
              >
                <AppText variant="heading" importantForAccessibility="no" style={{ minWidth: 64 }}>
                  {alarm.wakeTime}
                </AppText>
                <View importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>
                  <AppText variant="body">{formatDayShort(alarm.wakeDate)}</AppText>
                  <AppText variant="caption" tone="muted">
                    {alarm.title}, начало в {alarm.shiftStartTime}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        )}
        {available && scheduled > 0 ? (
          <AppText variant="caption" tone="muted">
            Поставлено в систему: {scheduled}. Дальше расписание продлевается само при
            каждом открытии приложения.
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
