import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatMinutesAsTime, parseTimeToMinutes } from '@/domain/date.ts';
import type { IsoDate, Weekday } from '@/domain/date.ts';
import { patternShiftTypeIds, resolveDay } from '@/domain/engine.ts';
import { formatDayLong } from '@/domain/format.ts';
import {
  DEFAULT_SNOOZE_MINUTES,
  MAX_SNOOZE_MINUTES,
  MIN_SNOOZE_MINUTES,
  hasAnyTrigger,
  isPastOnce,
  newAlarmDraft,
  nextDateForTime,
} from '@/domain/alarm.ts';
import type { Alarm, AlarmRepeat } from '@/domain/alarm.ts';
import type { ShiftType } from '@/domain/types.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ChoiceGroup, Sheet, TextField, TimeSelect, Toggle } from '@/ui';
import { useTheme } from '@/theme';
import { DatePickerField } from './DatePickerField.tsx';
import { RingtonePicker } from './RingtonePicker.tsx';
import { WeekdayPicker } from './WeekdayPicker.tsx';

type AlarmDraft = Omit<Alarm, 'id'>;
type RepeatKind = AlarmRepeat['kind'];

const REPEAT_CHOICES: Array<{ value: RepeatKind; label: string; hint: string }> = [
  { value: 'once', label: 'Один раз', hint: 'Зазвонит один раз и выключится сам' },
  { value: 'weekly', label: 'По дням недели', hint: 'Обычный повтор: понедельник, среда, пятница' },
  { value: 'schedule', label: 'По графику', hint: 'Только в рабочие дни выбранного графика' },
];

/** Час до начала смены — то, что обычно и ставят. Дальше правится руками. */
const DEFAULT_LEAD_MINUTES = 60;

const EVERY_DAY: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function toDraft(alarm: Alarm): AlarmDraft {
  const { label, time, enabled, repeat, soundUri, vibrate, snoozeMinutes } = alarm;
  return { label, time, enabled, repeat, soundUri, vibrate, snoozeMinutes };
}

/** Время подъёма по умолчанию для смены: за час до её начала. */
function defaultTimeFor(shiftType: ShiftType): string {
  if (!shiftType.time) return '07:00';
  return formatMinutesAsTime(parseTimeToMinutes(shiftType.time.start) - DEFAULT_LEAD_MINUTES);
}

/**
 * Правка одного будильника.
 *
 * Форма держит черновик у себя и пишет в хранилище только по кнопке: иначе
 * каждая нажатая цифра переставляла бы весь набор будильников в системе.
 */
export function AlarmEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  // date приходит из карточки дня: «добавить будильник на этот день».
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const isNew = params.id === 'new';
  // Пришли из карточки дня: такой будильник всегда разовый, на этот день, и
  // выбор повтора здесь только мешает.
  const fromCalendar = isNew && params.date !== undefined;
  const context = useScheduleContext();

  const existing = useAppStore((state) => state.alarms.find((alarm) => alarm.id === params.id));
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const schedule = useAppStore((state) => state.schedule);
  const addAlarm = useAppStore((state) => state.addAlarm);
  const updateAlarm = useAppStore((state) => state.updateAlarm);
  const removeAlarm = useAppStore((state) => state.removeAlarm);

  const now = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState<AlarmDraft>(() => {
    if (existing) return toDraft(existing);

    const fresh = newAlarmDraft(now);
    const date = params.date as IsoDate | undefined;
    if (!date) return fresh;

    // Пришли из календаря: разовый будильник на этот день, а если день
    // рабочий — за час до смены и с её названием.
    const shiftType = context ? resolveDay(context, date).shiftType : null;
    const work = shiftType?.kind === 'work' ? shiftType : null;
    return {
      ...fresh,
      time: work ? defaultTimeFor(work) : fresh.time,
      label: work ? work.name : fresh.label,
      repeat: { kind: 'once', date },
    };
  });

  /**
   * Рабочие смены самого графика. Спрашивать их у пользователя незачем —
   * график уже выбран в настройках; здесь они нужны только затем, чтобы у
   * чередующихся дневных и ночных было по своему времени подъёма.
   */
  const scheduleShifts = useMemo(() => {
    if (!schedule) return [];
    const index = new Map(shiftTypes.map((type) => [type.id, type]));
    return patternShiftTypeIds(schedule.pattern)
      .map((id) => index.get(id))
      .filter((type): type is ShiftType => Boolean(type?.time) && type?.kind === 'work');
  }, [schedule, shiftTypes]);

  const perShiftTimes = draft.repeat.kind === 'schedule' && scheduleShifts.length > 1;

  /** Время смены: заданное пользователем или час до её начала. */
  const timeFor = (type: ShiftType): string =>
    draft.repeat.kind === 'schedule'
      ? (draft.repeat.times[type.id] ?? defaultTimeFor(type))
      : draft.time;

  const padding = { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl };

  if (!isNew && !existing) {
    return (
      <Sheet title="Будильник" onClose={() => router.back()}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={padding}>
          <Card title="Будильник не найден">
            <AppText variant="body" tone="muted">
              Похоже, его уже удалили.
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  const setTime = (time: string): void => setDraft((current) => ({ ...current, time }));

  const setRepeatKind = (kind: RepeatKind): void =>
    setDraft((current) => {
      if (kind === current.repeat.kind) return current;
      if (kind === 'once') {
        return { ...current, repeat: { kind: 'once', date: nextDateForTime(current.time, now) } };
      }
      if (kind === 'weekly') return { ...current, repeat: { kind: 'weekly', days: EVERY_DAY } };
      return { ...current, repeat: { kind: 'schedule', times: {} } };
    });

  const setShiftTime = (shiftTypeId: string, time: string): void =>
    setDraft((current) => {
      if (current.repeat.kind !== 'schedule') return current;
      return {
        ...current,
        repeat: { kind: 'schedule', times: { ...current.repeat.times, [shiftTypeId]: time } },
      };
    });

  const save = (): void => {
    // Времена смен дозаполняются перед сохранением: то, что показано на
    // экране, и то, что уходит в хранилище, должно совпадать до значения.
    const saved: AlarmDraft = perShiftTimes
      ? {
          ...draft,
          repeat: {
            kind: 'schedule',
            times: Object.fromEntries(scheduleShifts.map((type) => [type.id, timeFor(type)])),
          },
        }
      : draft;

    if (isNew) addAlarm(saved);
    else updateAlarm(params.id, saved);
    router.back();
  };

  const remove = (): void => {
    removeAlarm(params.id);
    router.back();
  };

  const silent = !hasAnyTrigger({ ...draft, id: 'draft' });

  return (
    <Sheet title={isNew ? 'Новый будильник' : 'Будильник'} onClose={() => router.back()}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={padding}
        keyboardShouldPersistTaps="handled"
      >
        <Card title="Когда звонить">
          {perShiftTimes ? (
            <>
              {/* В графике чередуются дневные и ночные — вставать надо в разное
                  время, поэтому полей столько, сколько смен в графике. */}
              <AppText variant="body" tone="muted">
                В графике несколько смен, и время подъёма у них разное.
              </AppText>
              {scheduleShifts.map((type) => (
                <TimeSelect
                  key={type.id}
                  label={type.name}
                  value={timeFor(type)}
                  onChange={(time) => setShiftTime(type.id, time)}
                  hint={
                    type.time && timeFor(type) >= type.time.start
                      ? `Начало смены в ${type.time.start} — звонок придётся уже на смену`
                      : `Начало смены в ${type.time?.start ?? ''}`
                  }
                />
              ))}
            </>
          ) : (
            <TimeSelect label="Время" value={draft.time} onChange={setTime} />
          )}
          <TextField
            label="Название"
            value={draft.label}
            onChangeText={(label) => setDraft((current) => ({ ...current, label }))}
            placeholder="На смену"
            hint="Показывается на экране будильника"
          />
          <Toggle
            label="Включён"
            hint="Выключенный остаётся в списке со всеми настройками"
            value={draft.enabled}
            onValueChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
          />
        </Card>

        <Card title={fromCalendar ? 'День' : 'Повтор'}>
          {fromCalendar ? (
            <AppText variant="body" tone="muted">
              Разовый будильник на выбранный день. Повторы настраиваются на вкладке
              «Будильник».
            </AppText>
          ) : (
            <ChoiceGroup
              label="Режим повтора"
              choices={REPEAT_CHOICES}
              value={draft.repeat.kind}
              onChange={setRepeatKind}
            />
          )}

          {draft.repeat.kind === 'once' ? (
            <DatePickerField
              label="Дата"
              value={draft.repeat.date}
              onChange={(date) => setDraft((current) => ({ ...current, repeat: { kind: 'once', date } }))}
              hint={isPastOnce(draft, now) ? undefined : `Зазвонит: ${formatDayLong(draft.repeat.date).toLowerCase()}`}
            />
          ) : null}

          {isPastOnce(draft, now) ? (
            <AppText variant="body" tone="danger">
              Этот момент уже прошёл — будильник не зазвонит. Выбери другое время или день.
            </AppText>
          ) : null}

          {draft.repeat.kind === 'weekly' ? (
            <WeekdayPicker
              days={draft.repeat.days}
              onChange={(days) => setDraft((current) => ({ ...current, repeat: { kind: 'weekly', days } }))}
            />
          ) : null}

          {draft.repeat.kind === 'schedule' && !schedule ? (
            <AppText variant="body" tone="muted">
              График не выбран, поэтому смен приложение пока не знает. Выбери график в
              настройках — они появятся здесь сами.
            </AppText>
          ) : null}

          {draft.repeat.kind === 'schedule' && schedule ? (
            <AppText variant="body" tone="muted">
              Звонит в каждый рабочий день графика. Выходные, отсыпные, отпуск и больничный
              пропускаются, ручные правки дней учитываются.
            </AppText>
          ) : null}

          {silent ? (
            <AppText variant="body" tone="danger">
              {draft.repeat.kind === 'schedule'
                ? 'Так будильник не зазвонит ни разу: не отмечена ни одна смена.'
                : 'Так будильник не зазвонит ни разу: не выбран ни один день недели.'}
            </AppText>
          ) : null}
        </Card>

        <Card title="Сигнал">
          <RingtonePicker
            value={draft.soundUri}
            onChange={(soundUri) => setDraft((current) => ({ ...current, soundUri }))}
          />
          <Toggle
            label="Вибрация"
            value={draft.vibrate}
            onValueChange={(vibrate) => setDraft((current) => ({ ...current, vibrate }))}
          />
          <TextField
            label="Отложить на, минут"
            value={String(draft.snoozeMinutes)}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '');
              setDraft((current) => ({
                ...current,
                snoozeMinutes: digits === '' ? DEFAULT_SNOOZE_MINUTES : Number(digits),
              }));
            }}
            keyboardType="number-pad"
            hint={`Столько ждёт кнопка «Отложить». От ${MIN_SNOOZE_MINUTES} до ${MAX_SNOOZE_MINUTES} минут`}
          />
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Button title="Сохранить" variant="primary" onPress={save} />
          {isNew ? null : <Button title="Удалить будильник" variant="danger" onPress={remove} />}
        </View>
      </ScrollView>
    </Sheet>
  );
}
