import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatMinutesAsTime, parseTimeToMinutes } from '@/domain/date.ts';
import type { IsoDate, Weekday } from '@/domain/date.ts';
import { resolveDay } from '@/domain/engine.ts';
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
import { AppText, Button, Card, ChoiceGroup, TextField, TimeDialField, Toggle } from '@/ui';
import { useTheme } from '@/theme';
import { DatePickerField } from './DatePickerField.tsx';
import { RingtonePicker } from './RingtonePicker.tsx';
import { WeekdayPicker } from './WeekdayPicker.tsx';

type AlarmDraft = Omit<Alarm, 'id'>;
type RepeatKind = AlarmRepeat['kind'];

const REPEAT_CHOICES: Array<{ value: RepeatKind; label: string; hint: string }> = [
  { value: 'once', label: 'Один раз', hint: 'Зазвонит один раз и выключится сам' },
  { value: 'weekly', label: 'По дням недели', hint: 'Обычный повтор: понедельник, среда, пятница' },
  { value: 'schedule', label: 'По графику', hint: 'Только в рабочие дни, у каждой смены своё время' },
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

  const workTypes = useMemo(
    () => shiftTypes.filter((type) => type.kind === 'work' && type.time),
    [shiftTypes],
  );

  const padding = { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl };

  if (!isNew && !existing) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={padding}>
        <Card title="Будильник не найден">
          <AppText variant="body" tone="muted">
            Похоже, его уже удалили.
          </AppText>
          <Button title="Назад" onPress={() => router.back()} />
        </Card>
      </ScrollView>
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

  const setScheduleTime = (shiftTypeId: string, time: string | null): void =>
    setDraft((current) => {
      if (current.repeat.kind !== 'schedule') return current;
      const times = { ...current.repeat.times };
      if (time === null) delete times[shiftTypeId];
      else times[shiftTypeId] = time;
      return { ...current, repeat: { kind: 'schedule', times } };
    });

  const save = (): void => {
    if (isNew) addAlarm(draft);
    else updateAlarm(params.id, draft);
    router.back();
  };

  const remove = (): void => {
    removeAlarm(params.id);
    router.back();
  };

  const silent = !hasAnyTrigger({ ...draft, id: 'draft' });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={padding}
      keyboardShouldPersistTaps="handled"
    >
      <Card title="Когда звонить">
        {draft.repeat.kind === 'schedule' ? (
          <AppText variant="body" tone="muted">
            Время задаётся ниже, отдельно для каждой смены.
          </AppText>
        ) : (
          <TimeDialField label="Время" value={draft.time} onChange={setTime} defaultExpanded />
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
            График не выбран, поэтому рабочих дней приложение пока не знает. Выбери график в
            настройках — смены появятся здесь сами.
          </AppText>
        ) : null}

        {draft.repeat.kind === 'schedule' && schedule ? (
          <View style={{ gap: theme.spacing.lg }}>
            <AppText variant="caption" tone="muted">
              Отметь смены, перед которыми надо вставать. Ночные и дневные чередуются — у
              каждой своё время подъёма.
            </AppText>
            {workTypes.map((type) => {
              const times = draft.repeat.kind === 'schedule' ? draft.repeat.times : {};
              const time = times[type.id];
              const start = type.time?.start ?? '';
              const late = time !== undefined && start !== '' && time >= start;

              return (
                <View key={type.id} style={{ gap: theme.spacing.sm }}>
                  <Toggle
                    label={type.name}
                    hint={start ? `Начало смены в ${start}` : undefined}
                    value={time !== undefined}
                    onValueChange={(on) => setScheduleTime(type.id, on ? defaultTimeFor(type) : null)}
                  />
                  {time !== undefined ? (
                    <TimeDialField
                      label={`Подъём, ${type.name.toLowerCase()}`}
                      value={time}
                      onChange={(next) => setScheduleTime(type.id, next)}
                      hint={late ? 'Позже начала смены — звонок придётся уже на смену' : undefined}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
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
  );
}
