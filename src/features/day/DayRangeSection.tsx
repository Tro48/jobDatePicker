import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import type { OverrideRun } from '@/domain/engine.ts';
import { DAY_FORMS, formatDayShort, pluralize } from '@/domain/format.ts';
import type { ShiftType } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, TextField } from '@/ui';
import { useTheme } from '@/theme';

/** Разумный потолок: отпуск длиннее года — почти наверняка опечатка. */
const MAX_DAYS = 365;

export interface DayRangeSectionProps {
  shiftType: ShiftType;
  run: OverrideRun;
}

/**
 * Управление длительностью отпуска или больничного.
 *
 * Отсчёт всегда идёт от начала уже проставленного отрезка, а не от открытого
 * дня: иначе, зайдя в середину отпуска и указав «14 дней», пользователь
 * продлил бы его вдвое вместо того, чтобы задать длину.
 */
export function DayRangeSection({ shiftType, run }: DayRangeSectionProps) {
  const theme = useTheme();
  const setOverrideRange = useAppStore((state) => state.setOverrideRange);
  const clearOverrideRange = useAppStore((state) => state.clearOverrideRange);

  const [daysText, setDaysText] = useState(String(run.length));

  // Отрезок мог измениться снаружи — например, правкой соседнего дня.
  useEffect(() => setDaysText(String(run.length)), [run.length, run.start]);

  const parsed = Number(daysText.replace(/\D/g, ''));
  const days = Number.isFinite(parsed) ? parsed : 0;
  const canApply = days >= 1 && days <= MAX_DAYS && days !== run.length;

  return (
    <Card title={`${shiftType.name}: сколько дней`}>
      <AppText variant="body">
        {run.length === 1
          ? `Пока один день, ${formatDayShort(run.start)}`
          : `${pluralize(run.length, DAY_FORMS)}: с ${formatDayShort(run.start)} по ${formatDayShort(run.end)}`}
      </AppText>
      {run.length > 1 ? (
        <AppText variant="caption" tone="muted">
          Открыт {run.position}-й день из {run.length}
        </AppText>
      ) : null}

      <TextField
        label="Сколько дней подряд"
        value={daysText}
        onChangeText={setDaysText}
        keyboardType="number-pad"
        hint={`Отсчёт от ${formatDayShort(run.start)} — начала отрезка, а не от открытого дня`}
      />

      <Button
        title="Применить"
        variant="primary"
        disabled={!canApply}
        onPress={() => {
          // Сначала снимаем старый отрезок: при укорачивании хвост иначе останется.
          clearOverrideRange(run.start, run.length);
          setOverrideRange(run.start, days, shiftType.id);
        }}
      />

      <Button
        title={`Убрать ${shiftType.name.toLowerCase()} целиком`}
        variant="danger"
        accessibilityHint={`Снимет правку со всех ${pluralize(run.length, DAY_FORMS)}`}
        onPress={() =>
          Alert.alert(
            `Убрать ${shiftType.name.toLowerCase()}?`,
            run.length === 1
              ? formatDayShort(run.start)
              : `С ${formatDayShort(run.start)} по ${formatDayShort(run.end)}, ${pluralize(run.length, DAY_FORMS)}`,
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Убрать',
                style: 'destructive',
                onPress: () => clearOverrideRange(run.start, run.length),
              },
            ],
          )
        }
      />

      <View style={{ height: theme.spacing.xs }} />
    </Card>
  );
}
