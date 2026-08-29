import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { formatMinutesAsTime, parseTimeToMinutes } from '@/domain/date.ts';
import { settingFor } from '@/domain/alarm.ts';
import type { AlarmSettings } from '@/domain/alarm.ts';
import type { ShiftType } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, TextField, Toggle } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Одна строка настройки: включён ли будильник для этого типа смены и за
 * сколько минут до начала звонить. Рядом сразу показано время подъёма —
 * иначе «за 90 минут» приходится считать в уме.
 */
export function ShiftAlarmRow({
  shiftType,
  settings,
}: {
  shiftType: ShiftType;
  settings: AlarmSettings;
}) {
  const theme = useTheme();
  const setShiftAlarmEnabled = useAppStore((state) => state.setShiftAlarmEnabled);
  const setShiftAlarmLead = useAppStore((state) => state.setShiftAlarmLead);

  const setting = settingFor(settings, shiftType.id);
  const [leadText, setLeadText] = useState(String(setting.leadMinutes));

  // Значение могло измениться снаружи — например, сбросом настроек.
  useEffect(() => setLeadText(String(setting.leadMinutes)), [setting.leadMinutes]);

  const start = shiftType.time?.start;
  const wakeTime = start
    ? formatMinutesAsTime(parseTimeToMinutes(start) - setting.leadMinutes)
    : null;

  const applyLead = (text: string) => {
    setLeadText(text);
    const minutes = Number(text.replace(/\D/g, ''));
    if (Number.isFinite(minutes) && text.length > 0) setShiftAlarmLead(shiftType.id, minutes);
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Toggle
        label={shiftType.name}
        hint={start ? `Начало в ${start}` : undefined}
        value={setting.enabled}
        onValueChange={(value) => setShiftAlarmEnabled(shiftType.id, value)}
      />
      {setting.enabled ? (
        <TextField
          label="За сколько минут до смены"
          value={leadText}
          onChangeText={applyLead}
          keyboardType="number-pad"
          hint={wakeTime ? `Звонок в ${wakeTime}` : undefined}
        />
      ) : null}
    </View>
  );
}
