import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveRange } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { formatDayShort, formatMonthTitle } from '@/domain/format.ts';
import { periodOf, shiftPeriod } from '@/domain/payday.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { indexShiftTypes } from '@/domain/shifts.ts';
import { useActiveTrack } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Select,
  Sheet,
  TextField,
  Toggle,
  useSheetScroll,
} from '@/ui';
import { useTheme } from '@/theme';
import { MonthGrid, WeekdayHeader } from '@/features/calendar/MonthGrid.tsx';

/** Сколько дней показывает строка предпросмотра под выбором даты. */
const PREVIEW_DAYS = 14;

export function SchedulePickerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const { width } = useWindowDimensions();
  // Какую дорожку правим: «new» — заводим новую, пусто — активную. Так один
  // экран закрывает и первый выбор графика, и вторую работу, и правку.
  const params = useLocalSearchParams<{ track?: string }>();

  const tracks = useAppStore((state) => state.tracks);
  const active = useActiveTrack();
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const addTrack = useAppStore((state) => state.addTrack);
  const updateTrack = useAppStore((state) => state.updateTrack);
  const setTrackSchedule = useAppStore((state) => state.setTrackSchedule);
  const removeTrack = useAppStore((state) => state.removeTrack);

  const isNew = params.track === 'new';
  const edited = isNew ? null : (tracks.find((track) => track.id === params.track) ?? active);
  const saved = edited?.schedule ?? null;

  /**
   * Имя и признак «мои часы» спрашиваются, только когда они что-то значат:
   * у человека с одной работой нет ни второй, от которой её надо отличать, ни
   * чужих часов, которые надо исключить из сводки.
   */
  const named = isNew ? tracks.length > 0 : tracks.length > 1;

  const today = useMemo(() => todayIso(), []);
  const [name, setName] = useState(edited?.name ?? '');
  // Первый график заводят себе — переключателя там нет вовсе. А вот второй
  // чаще всего заводят под близкого человека, а не под вторую работу: считать
  // его часы своими по умолчанию значило бы молча испортить сводку.
  const [own, setOwn] = useState(edited?.own ?? tracks.length === 0);
  const [presetId, setPresetId] = useState(saved?.presetId ?? SCHEDULE_PRESETS[0].id);
  const [anchorDate, setAnchorDate] = useState<IsoDate>(saved?.anchorDate ?? today);
  const [previewPeriod, setPreviewPeriod] = useState(() => periodOf(saved?.anchorDate ?? today));

  const preset = useMemo(
    () => SCHEDULE_PRESETS.find((item) => item.id === presetId) ?? SCHEDULE_PRESETS[0],
    [presetId],
  );

  // Имя обязательно ровно там, где его спрашивают: без него вкладки
  // получаются безымянными, и переключаться между ними не по чему.
  const incomplete = named && name.trim().length === 0;

  const save = (): void => {
    if (incomplete) return;
    if (edited) {
      updateTrack(edited.id, { name: name.trim() || edited.name, own });
      setTrackSchedule(edited.id, preset.id, anchorDate);
    } else {
      addTrack({ name: name.trim(), own, presetId: preset.id, anchorDate });
    }
    router.back();
  };

  const remove = (): void => {
    if (edited) removeTrack(edited.id);
    router.back();
  };

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
    <Sheet title={isNew ? 'Новый график' : 'График'} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        {named ? (
          <Card title="Чей это график">
            <TextField
              label="Название"
              value={name}
              onChangeText={setName}
              placeholder="Вторая работа"
              hint="Так график подписан на вкладке над календарём"
            />
            <Toggle
              label="Считать часы и деньги моими"
              hint="Выключи, если это график близкого человека: он будет виден в календаре, но в сводку не попадёт"
              value={own}
              onValueChange={setOwn}
            />
          </Card>
        ) : null}

        <Card title="График">
          {/* Выпадающим списком, а не столбиком радиокнопок: графиков десяток,
              и развёрнутый список выталкивал бы дату первой смены за экран. */}
          <Select label="График работы" value={presetId} options={choices} onChange={setPresetId} />
          <AppText variant="caption" tone="muted">
            {preset.description}
          </AppText>
        </Card>

        <Card title="Дата первой смены">
          <AppText variant="body">{formatDayShort(anchorDate)}</AppText>
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

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Сохранить график"
            variant="primary"
            disabled={incomplete}
            accessibilityHint={
              incomplete ? 'Сначала впиши название' : 'Календарь заполнится по выбранному графику'
            }
            onPress={save}
          />
          {/* Последнюю дорожку удалять нечем: без графиков приложению нечего
              показывать, и это состояние достигается сбросом с экрана ошибки. */}
          {edited && tracks.length > 1 ? (
            <Button title="Удалить график" variant="danger" onPress={remove} />
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}
