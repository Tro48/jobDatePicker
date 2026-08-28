import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveDay, resolvePlannedShiftId, shiftDurationMinutes } from '@/domain/engine.ts';
import {
  formatDayLong,
  formatDuration,
  formatMinutesAsHoursInput,
  formatTimeRange,
  parseHoursToMinutes,
} from '@/domain/format.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ChoiceGroup, TextField } from '@/ui';
import { useTheme } from '@/theme';

/** Значение выбора «оставить как в графике» — правка при этом удаляется. */
const FOLLOW_SCHEDULE = '__schedule__';

export function DayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ date: string }>();
  const date = (params.date ?? todayIso()) as IsoDate;

  const context = useScheduleContext();
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const override = useAppStore((state) => state.overrides[date]);
  const setOverride = useAppStore((state) => state.setOverride);
  const clearOverride = useAppStore((state) => state.clearOverride);

  const [hoursText, setHoursText] = useState<string | null>(null);

  const planned = useMemo(() => {
    if (!context) return null;
    const id = resolvePlannedShiftId(context.schedule, date);
    return context.shiftTypes.get(id) ?? null;
  }, [context, date]);

  if (!context || !planned) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ padding: theme.spacing.lg }}
      >
        <Card title="График не выбран">
          <AppText variant="body" tone="muted">
            Пока график не выбран, править отдельные дни нечего.
          </AppText>
          <Button title="Закрыть" onPress={() => router.back()} />
        </Card>
      </ScrollView>
    );
  }

  const resolved = resolveDay(context, date);
  const isWork = resolved.shiftType.kind === 'work';
  const plannedMinutes = shiftDurationMinutes(resolved.shiftType);
  const hoursValue = hoursText ?? formatMinutesAsHoursInput(resolved.workedMinutes);

  const choices = [
    { value: FOLLOW_SCHEDULE, label: `По графику — ${planned.name.toLowerCase()}` },
    ...shiftTypes.map((type) => ({ value: type.id, label: type.name })),
  ];

  const applyShiftType = (value: string) => {
    setHoursText(null);
    if (value === FOLLOW_SCHEDULE) {
      clearOverride(date);
      return;
    }
    // Часы сбрасываются вместе со сменой: у новой смены своя штатная длительность.
    setOverride({ date, shiftTypeId: value, note: override?.note });
  };

  const applyHours = (text: string) => {
    setHoursText(text);
    const minutes = parseHoursToMinutes(text);
    if (minutes === null) return;
    setOverride({
      date,
      shiftTypeId: resolved.shiftType.id,
      workedMinutesOverride: minutes,
      note: override?.note,
    });
  };

  const applyNote = (note: string) => {
    setOverride({
      date,
      shiftTypeId: resolved.shiftType.id,
      workedMinutesOverride: override?.workedMinutesOverride,
      note: note.length > 0 ? note : undefined,
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ marginBottom: theme.spacing.lg }}>
        <AppText variant="display" accessibilityRole="header">
          {formatDayLong(date)}
        </AppText>
      </View>

      <Card title="Сейчас">
        <AppText variant="heading">{resolved.shiftType.name}</AppText>
        {isWork ? (
          <AppText variant="body" tone="muted">
            {resolved.shiftType.time && resolved.workedMinutes === plannedMinutes
              ? `${formatTimeRange(resolved.shiftType.time.start, resolved.shiftType.time.end)} · ${formatDuration(resolved.workedMinutes)}`
              : formatDuration(resolved.workedMinutes)}
          </AppText>
        ) : null}
        {/* Что даёт график, видно всегда — иначе непонятно, от чего отличается факт. */}
        <AppText variant="caption" tone="muted">
          По графику: {planned.name.toLowerCase()}
          {resolved.source === 'override' ? ' · изменено вручную' : ''}
        </AppText>
      </Card>

      <Card title="Смена">
        <ChoiceGroup
          label="Смена в этот день"
          choices={choices}
          value={override ? override.shiftTypeId : FOLLOW_SCHEDULE}
          onChange={applyShiftType}
        />
      </Card>

      {isWork ? (
        <Card title="Часы">
          <TextField
            label="Отработано часов"
            value={hoursValue}
            onChangeText={applyHours}
            keyboardType="decimal-pad"
            hint={`Штатно за эту смену — ${formatDuration(plannedMinutes)}`}
          />
        </Card>
      ) : null}

      <Card title="Заметка">
        <TextField
          label="Заметка к дню"
          value={override?.note ?? ''}
          onChangeText={applyNote}
          placeholder="Например: вышел за Сергея"
          multiline
        />
      </Card>

      <View style={{ gap: theme.spacing.sm }}>
        {resolved.source === 'override' ? (
          <Button
            title="Вернуть по графику"
            variant="danger"
            accessibilityHint="Удаляет ручную правку этого дня"
            onPress={() => {
              setHoursText(null);
              clearOverride(date);
            }}
          />
        ) : null}
        <Button title="Готово" variant="primary" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
