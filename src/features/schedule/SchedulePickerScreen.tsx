import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { addDays, todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveRange } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { formatDayShort, formatMonthTitle } from '@/domain/format.ts';
import { periodOf, shiftPeriod } from '@/domain/payday.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { indexShiftTypes } from '@/domain/shifts.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ChoiceGroup, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { MonthGrid, WeekdayHeader } from '@/features/calendar/MonthGrid.tsx';

/** Сколько дней показывает строка предпросмотра под выбором даты. */
const PREVIEW_DAYS = 14;

export function SchedulePickerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const saved = useAppStore((state) => state.schedule);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const selectSchedule = useAppStore((state) => state.selectSchedule);

  const today = useMemo(() => todayIso(), []);
  const [presetId, setPresetId] = useState(saved?.presetId ?? SCHEDULE_PRESETS[0].id);
  const [anchorDate, setAnchorDate] = useState<IsoDate>(saved?.anchorDate ?? today);
  const [previewPeriod, setPreviewPeriod] = useState(() => periodOf(saved?.anchorDate ?? today));

  const preset = useMemo(
    () => SCHEDULE_PRESETS.find((item) => item.id === presetId) ?? SCHEDULE_PRESETS[0],
    [presetId],
  );

  /**
   * Черновой контекст: пользователь видит результат выбора до сохранения.
   * Ручные правки в предпросмотр не подмешиваются — здесь оценивается сам
   * график, а не то, что поверх него уже наверчено.
   */
  const draftContext: ScheduleContext = useMemo(
    () => ({
      schedule: { presetId: preset.id, pattern: preset.pattern, anchorDate },
      shiftTypes: indexShiftTypes(shiftTypes),
      overrides: new Map(),
    }),
    [preset, anchorDate, shiftTypes],
  );

  const previewDays = useMemo(
    () =>
      resolveRange(
        draftContext,
        Array.from({ length: PREVIEW_DAYS }, (_, index) => addDays(anchorDate, index)),
      ),
    [draftContext, anchorDate],
  );

  const previewYear = Number(previewPeriod.slice(0, 4));
  const previewMonth = Number(previewPeriod.slice(5, 7));

  const choices = SCHEDULE_PRESETS.map((item) => ({
    value: item.id,
    label: item.name,
    hint: item.description,
  }));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
    >
      <Card title="График">
        <ChoiceGroup label="График работы" choices={choices} value={presetId} onChange={setPresetId} />
      </Card>

      <Card title="Дата первой смены">
        <AppText variant="body">
          {formatDayShort(anchorDate)}
        </AppText>
        <AppText variant="caption" tone="muted">
          Нажми на день в календаре ниже. От него график разворачивается и вперёд, и назад.
        </AppText>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            name="chevron-back"
            label="Предыдущий месяц"
            onPress={() => setPreviewPeriod((value) => shiftPeriod(value, -1))}
          />
          <AppText variant="heading" style={{ flex: 1, textAlign: 'center' }}>
            {formatMonthTitle(previewYear, previewMonth)}
          </AppText>
          <IconButton
            name="chevron-forward"
            label="Следующий месяц"
            onPress={() => setPreviewPeriod((value) => shiftPeriod(value, 1))}
          />
        </View>

        {/* Сетка во всю ширину карточки: те же 48 dp на клетку, что и в календаре. */}
        <View style={{ marginHorizontal: -theme.spacing.lg, alignItems: 'center' }}>
          <WeekdayHeader width={width} />
          <MonthGrid
            year={previewYear}
            month={previewMonth}
            context={draftContext}
            today={today}
            selectedDate={anchorDate}
            width={width}
            onSelectDay={setAnchorDate}
          />
        </View>
      </Card>

      <Card title={`Как ляжет: ${PREVIEW_DAYS} дней от первой смены`}>
        <View
          accessibilityRole="text"
          accessibilityLabel={previewDays
            .map((day) => `${formatDayShort(day.date)} — ${day.shiftType.name.toLowerCase()}`)
            .join('; ')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
        >
          {previewDays.map((day) => (
            <View
              key={day.date}
              importantForAccessibility="no-hide-descendants"
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 2,
                borderRadius: theme.radius.sm,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <AppText variant="badge">{day.shiftType.badge}</AppText>
            </View>
          ))}
        </View>
      </Card>

      <Button
        title="Сохранить график"
        variant="primary"
        accessibilityHint="Календарь заполнится по выбранному графику"
        onPress={() => {
          selectSchedule(preset.id, anchorDate);
          router.back();
        }}
      />
    </ScrollView>
  );
}

