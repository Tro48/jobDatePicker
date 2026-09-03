import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import {
  findOverrideRun,
  overtimeMinutes,
  resolveDay,
  resolvePlannedShiftId,
  shiftDurationMinutes,
} from '@/domain/engine.ts';
import {
  formatDayLong,
  formatDuration,
  formatMinutesAsHoursInput,
  formatOvertimeSpoken,
  formatTimeRange,
  parseHoursToMinutes,
} from '@/domain/format.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Select, Sheet, TextField, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';
import { DayAlarmSection } from './DayAlarmSection.tsx';
import { DayPaymentSection } from './DayPaymentSection.tsx';
import { DayRangeSection } from './DayRangeSection.tsx';

/** Значение выбора «оставить как в графике» — правка при этом удаляется. */
const FOLLOW_SCHEDULE = '__schedule__';

export function DayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ date: string }>();
  const date = (params.date ?? todayIso()) as IsoDate;

  const context = useScheduleContext();
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const override = useAppStore((state) => state.overrides[date]);
  const setOverride = useAppStore((state) => state.setOverride);
  const clearOverride = useAppStore((state) => state.clearOverride);

  /**
   * Черновики полей. В хранилище они уходят по уходу фокуса, а не на каждую
   * букву: одна нажатая клавиша иначе пересобирает контекст графика,
   * перерисовывает календарь под шторкой и заново ставит все будильники в
   * системе. null — «поле не трогали», показывается сохранённое значение.
   */
  const [hoursText, setHoursText] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<string | null>(null);

  // Шторку закрывают и смахиванием — тогда поле не успевает потерять фокус, и
  // набранное пропало бы. Ref держит последнюю версию замыкания и заполняется
  // ниже; сам эффект отрабатывает один раз, при размонтировании. Хуки стоят до
  // ветки «график не выбран»: ниже неё их вызывать уже нельзя.
  const flush = useRef<() => void>(() => {});
  useEffect(() => () => flush.current(), []);

  /**
   * Набирали ли что-то с последней записи.
   *
   * Без флага «Готово» записывало бы дважды: замыкание, дописывающее поля при
   * размонтировании, ещё не знает, что их только что сохранили, — сброс
   * состояния до него не доезжает.
   */
  const pending = useRef(false);

  // Отступ снизу свой: у шторки под содержимым системная полоса навигации.
  const padding = {
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: insets.bottom + theme.spacing.xxl,
  };

  const planned = useMemo(() => {
    if (!context) return null;
    const id = resolvePlannedShiftId(context.schedule, date);
    return context.shiftTypes.get(id) ?? null;
  }, [context, date]);

  if (!context || !planned) {
    return (
      <Sheet title={formatDayLong(date)} onClose={() => router.back()}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
          <Card title="График не выбран">
            <AppText variant="body" tone="muted">
              Пока график не выбран, править отдельные дни нечего.
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  const resolved = resolveDay(context, date);
  const isWork = resolved.shiftType.kind === 'work';
  const shiftNormMinutes = shiftDurationMinutes(resolved.shiftType);
  const hoursValue = hoursText ?? formatMinutesAsHoursInput(resolved.workedMinutes);
  const overtime = overtimeMinutes(resolved);
  const run = findOverrideRun(context.overrides, date);

  /**
   * Список смен без отдельной строки «по графику»: она называлась бы так же,
   * как сама смена из графика, и в списке стояли бы два одинаковых названия
   * подряд. Вместо этого смена из графика подписана снизу, а выбор её же
   * означает «следовать графику» — правка удаляется.
   */
  const shiftOptions = shiftTypes.map((type) => {
    const hints = [
      type.id === planned.id ? 'по графику' : null,
      type.multiDay ? 'можно поставить на несколько дней подряд' : null,
    ].filter(Boolean);

    return { value: type.id, label: type.name, hint: hints.join(' · ') || undefined };
  });

  /** Черновик часов правится у себя; в хранилище он уходит из commitDrafts. */
  const editHours = (text: string) => {
    pending.current = true;
    setHoursText(text);
  };

  const editNote = (text: string) => {
    pending.current = true;
    setNoteText(text);
  };

  /** Черновики набраны заново — то, что было в полях, больше не нужно. */
  const dropDrafts = () => {
    pending.current = false;
    setHoursText(null);
    setNoteText(null);
  };

  const applyShiftType = (value: string) => {
    // Часы сбрасываются вместе со сменой: у новой смены своя штатная
    // длительность. Заметка переживает смену — это разные вещи.
    dropDrafts();
    setOverride({
      date,
      shiftTypeId: value === FOLLOW_SCHEDULE ? undefined : value,
      note: override?.note,
    });
  };

  /**
   * Дописать черновики в хранилище. Смена в правке не проставляется: заметка и
   * часы сами по себе день от графика не отвязывают, иначе сдвиг даты первой
   * смены переставал бы такие дни трогать.
   */
  const commitDrafts = () => {
    if (!pending.current) return;

    const minutes = hoursText === null ? undefined : parseHoursToMinutes(hoursText);
    const note = noteText?.trim();

    // Мусор в поле часов не сохраняется: поле вернётся к сохранённому значению.
    const nextMinutes = minutes ?? override?.workedMinutesOverride;
    const nextNote = note === undefined ? override?.note : note.length > 0 ? note : undefined;

    dropDrafts();

    if (nextMinutes === override?.workedMinutesOverride && nextNote === override?.note) return;
    setOverride({
      date,
      shiftTypeId: override?.shiftTypeId,
      workedMinutesOverride: nextMinutes,
      note: nextNote,
    });
  };

  flush.current = commitDrafts;

  return (
    <Sheet title={formatDayLong(date)} onClose={() => router.back()}>
      <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
        <Card title="Сейчас">
          <AppText variant="heading">{resolved.shiftType.name}</AppText>
          {isWork ? (
            <AppText variant="body" tone="muted">
              {resolved.shiftType.time && resolved.workedMinutes === shiftNormMinutes
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
          {/* Выпадающий список, а не десять строк подряд: справочник смен
              растянул карточку дня на два экрана, и часы с заметкой уезжали
              под сгиб. */}
          <Select
            label="Смена в этот день"
            options={shiftOptions}
            value={override?.shiftTypeId ?? planned.id}
            onChange={(value) => applyShiftType(value === planned.id ? FOLLOW_SCHEDULE : value)}
          />
          {/* Выходной поверх смены из графика: блока «Часы» у него нет, а точку
              в клетке календаря он получает — объяснить её больше негде. */}
          {!isWork && overtime !== 0 ? (
            <AppText
              variant="caption"
              color={theme.colors.danger}
              accessibilityLabel={formatOvertimeSpoken(overtime)}
            >
              Недоработка: {formatDuration(Math.abs(overtime))} — смена по графику снята
            </AppText>
          ) : null}
        </Card>

        {resolved.shiftType.multiDay && run ? (
          <DayRangeSection shiftType={resolved.shiftType} run={run} />
        ) : null}

        {isWork ? (
          <Card title="Часы">
            <TextField
              label="Отработано часов"
              value={hoursValue}
              onChangeText={editHours}
              onBlur={commitDrafts}
              keyboardType="decimal-pad"
              hint={`Штатно за эту смену — ${formatDuration(shiftNormMinutes)}`}
            />
            {/* То же число, что стоит в клетке календаря рядом с буквой смены:
                иначе непонятно, откуда там взялось «+2». */}
            {overtime !== 0 ? (
              <AppText
                variant="caption"
                color={overtime > 0 ? theme.colors.positive : theme.colors.danger}
                accessibilityLabel={formatOvertimeSpoken(overtime)}
              >
                {overtime > 0 ? 'Переработка' : 'Недоработка'}: {formatDuration(Math.abs(overtime))}
              </AppText>
            ) : null}
          </Card>
        ) : null}

        <DayAlarmSection date={date} />

        <Card title="Заметка">
          <TextField
            label="Заметка к дню"
            value={noteText ?? override?.note ?? ''}
            onChangeText={editNote}
            onBlur={commitDrafts}
            placeholder="Например: вышел за Сергея"
            multiline
          />
        </Card>

        <DayPaymentSection date={date} />

        <View style={{ gap: theme.spacing.sm }}>
          {resolved.source === 'override' ? (
            <Button
              title="Вернуть по графику"
              variant="danger"
              accessibilityHint="Удаляет правку этого дня целиком, вместе с заметкой"
              onPress={() => {
                dropDrafts();
                clearOverride(date);
              }}
            />
          ) : null}
          <Button
            title="Готово"
            variant="primary"
            onPress={() => {
              commitDrafts();
              router.back();
            }}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}
