import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatMinutesAsTime, parseTimeToMinutes } from '@/domain/date.ts';
import type { IsoDate, Weekday } from '@/domain/date.ts';
import { patternShiftTypeIds, resolveDay } from '@/domain/engine.ts';
import { formatDayLong } from '@/domain/format.ts';
import {
  MAX_SNOOZE_MINUTES,
  hasAnyTrigger,
  isPastOnce,
  newAlarmDraft,
  nextDateForTime,
  parseSnoozeMinutes,
} from '@/domain/alarm.ts';
import type { Alarm, AlarmRepeat } from '@/domain/alarm.ts';
import type { ShiftType } from '@/domain/types.ts';
import { useAlarmTrack, useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import {
  AppText,
  Button,
  Card,
  ChoiceGroup,
  Sheet,
  TextField,
  TimeSelect,
  Toggle,
  useSheetScroll,
} from '@/ui';
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
  const scroll = useSheetScroll();
  // date приходит из карточки дня: «добавить будильник на этот день».
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const isNew = params.id === 'new';
  // Пришли из карточки дня: такой будильник всегда разовый, на этот день, и
  // выбор повтора здесь только мешает.
  const fromCalendar = isNew && params.date !== undefined;
  // А вот заготовка «за час до смены» берётся из календаря, который был перед
  // глазами: это разовый будильник на конкретный день, и он ни за каким
  // графиком дальше не следует.
  const context = useScheduleContext();

  const existing = useAppStore((state) => state.alarms.find((alarm) => alarm.id === params.id));
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const tracks = useAppStore((state) => state.tracks);
  // Куда падает галочка у нового будильника: своя работа, а не та вкладка, на
  // которой человек стоял. Подъёмы не должны зависеть от взгляда.
  const defaultTrack = useAlarmTrack();
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
   * Отсрочка правится текстом, а не числом: поле обязано хранить ровно то, что
   * набрали, включая пустую строку. Число из него получается один раз, при
   * сохранении, — иначе поле само подставляет значение поверх ввода.
   */
  const [snoozeText, setSnoozeText] = useState(() => String(draft.snoozeMinutes));

  /**
   * Рабочие смены каждого графика. Спрашивать их у пользователя незачем — они
   * заданы самим графиком; нужны только затем, чтобы у чередующихся дневных и
   * ночных было по своему времени подъёма.
   */
  const shiftsByTrack = useMemo(() => {
    const index = new Map(shiftTypes.map((type) => [type.id, type]));
    return new Map(
      tracks.map((track) => [
        track.id,
        track.schedule
          ? patternShiftTypeIds(track.schedule.pattern)
              .map((id) => index.get(id))
              .filter((type): type is ShiftType => Boolean(type?.time) && type?.kind === 'work')
          : [],
      ]),
    );
  }, [tracks, shiftTypes]);

  /** Графики, отмеченные в этом будильнике. */
  const picked = draft.repeat.kind === 'schedule' ? draft.repeat.tracks : [];

  /** По чему вообще можно звонить: дорожка без графика не раскладывается. */
  const usable = tracks.filter((track) => track.schedule !== null);

  /**
   * Спрашивать время по сменам стоит там, где смен больше одной. Считается по
   * каждому графику отдельно: на складе может быть одна смена, а на основной
   * работе — дневная с ночной.
   */
  const perShiftTimes = (trackId: string): boolean => (shiftsByTrack.get(trackId)?.length ?? 0) > 1;

  /** Время смены: заданное пользователем или час до её начала. */
  const timeFor = (trackId: string, type: ShiftType): string =>
    picked.find((item) => item.trackId === trackId)?.times[type.id] ?? defaultTimeFor(type);

  const padding = { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl };

  if (!isNew && !existing) {
    return (
      <Sheet title="Будильник" onClose={() => router.back()}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
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
      // Переключились на график — сразу отмечаем свою работу: будильник без
      // единого графика не звонит, и пустой список выглядел бы поломкой.
      return {
        ...current,
        repeat: {
          kind: 'schedule',
          tracks: defaultTrack ? [{ trackId: defaultTrack.id, times: {} }] : [],
        },
      };
    });

  /** Отметить или снять график. */
  const toggleTrack = (trackId: string, on: boolean): void =>
    setDraft((current) => {
      if (current.repeat.kind !== 'schedule') return current;
      const rest = current.repeat.tracks.filter((item) => item.trackId !== trackId);
      return {
        ...current,
        repeat: {
          kind: 'schedule',
          // Порядок отметок держится порядком графиков, а не порядком нажатий:
          // иначе список полей времени прыгал бы под руками.
          tracks: on
            ? tracks
                .filter(
                  (track) => track.id === trackId || rest.some((item) => item.trackId === track.id),
                )
                .map(
                  (track) =>
                    rest.find((item) => item.trackId === track.id) ?? {
                      trackId: track.id,
                      times: {},
                    },
                )
            : rest,
        },
      };
    });

  const setShiftTime = (trackId: string, shiftTypeId: string, time: string): void =>
    setDraft((current) => {
      if (current.repeat.kind !== 'schedule') return current;
      return {
        ...current,
        repeat: {
          kind: 'schedule',
          tracks: current.repeat.tracks.map((item) =>
            item.trackId === trackId
              ? { ...item, times: { ...item.times, [shiftTypeId]: time } }
              : item,
          ),
        },
      };
    });

  const save = (): void => {
    // Времена смен дозаполняются перед сохранением: то, что показано на
    // экране, и то, что уходит в хранилище, должно совпадать до значения.
    const base: AlarmDraft = { ...draft, snoozeMinutes: parseSnoozeMinutes(snoozeText) };
    const saved: AlarmDraft =
      base.repeat.kind === 'schedule'
        ? {
            ...base,
            repeat: {
              kind: 'schedule',
              tracks: base.repeat.tracks.map((item) => ({
                trackId: item.trackId,
                times: perShiftTimes(item.trackId)
                  ? Object.fromEntries(
                      (shiftsByTrack.get(item.trackId) ?? []).map((type) => [
                        type.id,
                        timeFor(item.trackId, type),
                      ]),
                    )
                  : {},
              })),
            },
          }
        : base;

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
      <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
        <Card title="Когда звонить">
          {/* Общее время нужно всегда: по нему звонят разовый, недельный и те
              графики, где рабочая смена одна. */}
          <TimeSelect label="Время" value={draft.time} onChange={setTime} />

          {picked.filter((item) => perShiftTimes(item.trackId)).length > 0 ? (
            <AppText variant="body" tone="muted">
              Там, где в графике чередуются дневные и ночные, вставать надо в разное время — для
              таких смен время задаётся отдельно.
            </AppText>
          ) : null}

          {picked.map((item) => {
            if (!perShiftTimes(item.trackId)) return null;
            const track = tracks.find((candidate) => candidate.id === item.trackId);

            return (shiftsByTrack.get(item.trackId) ?? []).map((type) => (
              <TimeSelect
                key={`${item.trackId}:${type.id}`}
                label={tracks.length > 1 && track ? `${track.name} · ${type.name}` : type.name}
                value={timeFor(item.trackId, type)}
                onChange={(time) => setShiftTime(item.trackId, type.id, time)}
                hint={
                  type.time && timeFor(item.trackId, type) >= type.time.start
                    ? `Начало смены в ${type.time.start} — звонок придётся уже на смену`
                    : `Начало смены в ${type.time?.start ?? ''}`
                }
              />
            ));
          })}
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
              Разовый будильник на выбранный день. Повторы настраиваются на вкладке «Будильник».
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
              onChange={(date) =>
                setDraft((current) => ({ ...current, repeat: { kind: 'once', date } }))
              }
              hint={
                isPastOnce(draft, now)
                  ? undefined
                  : `Зазвонит: ${formatDayLong(draft.repeat.date).toLowerCase()}`
              }
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
              onChange={(days) =>
                setDraft((current) => ({ ...current, repeat: { kind: 'weekly', days } }))
              }
            />
          ) : null}

          {draft.repeat.kind === 'schedule' ? (
            usable.length === 0 ? (
              <AppText variant="body" tone="muted">
                График не выбран, поэтому будить не по чему. Выбери график в настройках — он
                появится здесь сам.
              </AppText>
            ) : (
              <>
                {/* Отмечается несколько: одним будильником удобно закрыть и
                    основную работу, и вторую. Совпавшие по времени звонки
                    приложение схлопнет в один. */}
                {usable.map((track) => (
                  <Toggle
                    key={track.id}
                    label={track.name}
                    hint={track.own ? undefined : 'Чужой график'}
                    value={picked.some((item) => item.trackId === track.id)}
                    onValueChange={(on) => toggleTrack(track.id, on)}
                  />
                ))}
                <AppText variant="body" tone="muted">
                  Звонит в каждый рабочий день отмеченных графиков. Выходные, отсыпные, отпуск и
                  больничный пропускаются, ручные правки дней учитываются.
                </AppText>
              </>
            )
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
            value={snoozeText}
            onChangeText={setSnoozeText}
            keyboardType="number-pad"
            hint={
              parseSnoozeMinutes(snoozeText) === 0
                ? 'Кнопки «Отложить» не будет. Поставь минуты, чтобы она появилась'
                : `Столько ждёт кнопка «Отложить». Не больше ${MAX_SNOOZE_MINUTES} минут`
            }
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
