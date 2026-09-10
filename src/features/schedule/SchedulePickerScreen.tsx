import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays, todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { patternShiftTypeIds, resolveDay, resolveRange, scheduleOn } from '@/domain/engine.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { formatDayShort, formatDuration, formatMonthTitle } from '@/domain/format.ts';
import { periodOf, shiftPeriod } from '@/domain/payday.ts';
import { describePattern } from '@/domain/customSchedules.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { indexShiftTypes, shiftStartGroups } from '@/domain/shifts.ts';
import { useActiveTrack } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { pickShareFile } from '@/features/share/pickShareFile.ts';
import { SHARE_FAILED_TEXT, sendTrackFile, shareOfTrack } from '@/features/share/trackShare.ts';
import {
  AppText,
  Button,
  Card,
  IconButton,
  Select,
  Sheet,
  TextField,
  TimeSelect,
  Toggle,
  useSheetScroll,
} from '@/ui';
import { useTheme } from '@/theme';
import { MonthGrid, WeekdayHeader } from '@/features/calendar/MonthGrid.tsx';

/** Сколько дней показывает строка предпросмотра под выбором даты. */
const PREVIEW_DAYS = 14;

/**
 * Насколько далеко назад искать рабочие дни, оставшиеся прежнему графику.
 * Упор нужен графику без выходных: иначе поиск ушёл бы в прошлое навсегда.
 */
const LEFTOVER_LIMIT_DAYS = 31;

export function SchedulePickerScreen() {
  const theme = useTheme();
  const router = useRouter();
  const push = useGuardedPush();
  const scroll = useSheetScroll();
  const { width } = useWindowDimensions();
  // Какую дорожку правим: «new» — заводим новую, пусто — активную. Так один
  // экран закрывает и первый выбор графика, и вторую работу, и правку.
  //
  // period — какой период истории: «new» — смена графика с какого-то дня,
  // число — правка уже прожитого, пусто — тот график, по которому работают
  // сейчас.
  const params = useLocalSearchParams<{ track?: string; period?: string }>();

  const tracks = useAppStore((state) => state.tracks);
  const active = useActiveTrack();
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const customSchedules = useAppStore((state) => state.customSchedules);
  const addTrack = useAppStore((state) => state.addTrack);
  const updateTrack = useAppStore((state) => state.updateTrack);
  const setTrackSchedule = useAppStore((state) => state.setTrackSchedule);
  const addTrackSchedule = useAppStore((state) => state.addTrackSchedule);
  const removeTrackSchedule = useAppStore((state) => state.removeTrackSchedule);
  const removeTrack = useAppStore((state) => state.removeTrack);

  const isNew = params.track === 'new';
  const edited = isNew ? null : (tracks.find((track) => track.id === params.track) ?? active);
  // Пустой список — тоже значение, и новый на каждый рендер сбивал бы расчёты,
  // которые от истории зависят.
  const history = useMemo(() => edited?.schedules ?? [], [edited]);

  /**
   * Номер правимого периода. -1 — новый: его добавляют, когда переводят на
   * другой график, а прожитое должно остаться как было.
   *
   * Считается один раз за жизнь экрана. Иначе после добавления периода с
   * соседнего экрана номер «последнего» съезжает на свежий период, а поля на
   * этом экране остаются от прежнего — и «Сохранить» переписывает новый график
   * старым.
   */
  const [periodIndex] = useState(() =>
    params.period === 'new'
      ? -1
      : params.period
        ? Number(params.period)
        : Math.max(0, history.length - 1),
  );
  const saved = history[periodIndex] ?? null;

  /** Заводим период поверх уже существующей истории — значит, спрашиваем и дату начала. */
  const addsPeriod = periodIndex === -1;
  /**
   * Дату начала видно, только когда она отдельная сущность: у самого первого
   * графика начало и есть первая смена, и второе поле там нечего заполнять.
   */
  const showsStart = addsPeriod || periodIndex > 0;

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
  const [startsOn, setStartsOn] = useState<IsoDate>(saved?.startsOn ?? today);
  const [previewPeriod, setPreviewPeriod] = useState(() => periodOf(saved?.startsOn ?? today));
  /**
   * Своё начало смен этого графика: id смены → «ЧЧ:ММ». Пусто — как в
   * справочнике; там же лежит и всё остальное про смену.
   */
  const [shiftStarts, setShiftStarts] = useState<Record<string, string>>(
    () => saved?.shiftStarts ?? {},
  );
  /**
   * Какую из двух дат ставит нажатие по календарю. Один календарь на обе: две
   * сетки подряд на телефоне не помещаются, а разница между ними — одна
   * подсвеченная кнопка.
   */
  const [picking, setPicking] = useState<'startsOn' | 'anchorDate'>('startsOn');

  /**
   * Выбранный график: встроенный пресет или собранный руками. Для дорожки они
   * неразличимы — в неё копируется одна и та же раскладка.
   */
  const preset = useMemo(() => {
    const builtin = SCHEDULE_PRESETS.find((item) => item.id === presetId);
    if (builtin) return builtin;

    const custom = customSchedules.find((item) => item.id === presetId);
    if (custom) {
      return { ...custom, description: describePattern(custom.pattern, shiftTypes) };
    }
    return SCHEDULE_PRESETS[0];
  }, [presetId, customSchedules, shiftTypes]);

  /**
   * Только что собранный график выбирается сам.
   *
   * Человек уходил в конструктор ровно за этим, и заставлять его после
   * возврата второй раз искать своё название в списке — значит терять
   * сделанное. Сравнивается последний собранный график: конструктор
   * дописывает новый в конец.
   */
  const latestCustomId = customSchedules.at(-1)?.id;
  const seenCustomId = useRef(latestCustomId);
  useEffect(() => {
    if (latestCustomId !== undefined && latestCustomId !== seenCustomId.current) {
      seenCustomId.current = latestCustomId;
      setPresetId(latestCustomId);
    }
  }, [latestCustomId]);

  /**
   * По каким временам спрашивать начало: рабочие смены выбранного графика,
   * сгруппированные по началу. У 2/2 это одно поле, у графика с чередованием
   * дня и ночи — два, а сокращённая пятница отдельного поля не получает: она
   * начинается тогда же, когда обычный день.
   */
  const startGroups = useMemo(() => {
    const index = indexShiftTypes(shiftTypes);
    const types = patternShiftTypeIds(preset.pattern)
      .map((id) => index.get(id))
      .filter((type) => type !== undefined);
    return shiftStartGroups(types);
  }, [preset, shiftTypes]);

  /** Что стоит в поле группы: своё время, если его задавали, иначе справочник. */
  const startOf = (group: { start: string; shiftTypeIds: string[] }): string =>
    shiftStarts[group.shiftTypeIds[0]] ?? group.start;

  /**
   * Время уходит всем сменам группы разом: в будильник и в календарь оно
   * попадает по типу смены, и смена без записи осталась бы со справочным.
   * Возврат к справочному значению запись удаляет — иначе правка справочника
   * перестала бы доезжать до графика.
   */
  const setGroupStart = (group: { start: string; shiftTypeIds: string[] }, time: string): void =>
    setShiftStarts((current) => {
      const next = { ...current };
      for (const id of group.shiftTypeIds) {
        if (time === group.start) delete next[id];
        else next[id] = time;
      }
      return next;
    });

  // Имя обязательно ровно там, где его спрашивают: без него вкладки
  // получаются безымянными, и переключаться между ними не по чему.
  const incomplete = named && name.trim().length === 0;

  const save = (): void => {
    if (incomplete) return;
    // Времена смен, которых в выбранном графике нет, с ним и не сохраняются:
    // иначе смена графика тащила бы за собой время от прежнего.
    const used = new Set(patternShiftTypeIds(preset.pattern));
    const starts = Object.fromEntries(Object.entries(shiftStarts).filter(([id]) => used.has(id)));

    if (!edited) {
      addTrack({ name: name.trim(), own, presetId: preset.id, anchorDate, shiftStarts: starts });
      router.back();
      return;
    }

    updateTrack(edited.id, { name: name.trim() || edited.name, own });
    // У первого графика начало и первая смена — одно и то же: отдельного поля
    // там нет, и брать оттуда нечего.
    const entry = {
      presetId: preset.id,
      anchorDate,
      startsOn: showsStart ? startsOn : anchorDate,
      shiftStarts: starts,
    };
    if (addsPeriod) addTrackSchedule(edited.id, entry);
    else setTrackSchedule(edited.id, periodIndex, entry);
    router.back();
  };

  /** Убрать один период истории — не всю работу. */
  const removePeriod = (): void => {
    if (edited) removeTrackSchedule(edited.id, periodIndex);
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
      schedules: [
        {
          presetId: preset.id,
          pattern: preset.pattern,
          anchorDate,
          startsOn: showsStart ? startsOn : anchorDate,
          shiftStarts,
        },
      ],
      shiftTypes: indexShiftTypes(shiftTypes),
      overrides: new Map(),
    }),
    [preset, anchorDate, startsOn, showsStart, shiftTypes, shiftStarts],
  );

  /** Как называется график периода в истории: пресет, свой или пришедший чужой. */
  const nameOfSchedule = (id: string): string =>
    SCHEDULE_PRESETS.find((item) => item.id === id)?.name ??
    customSchedules.find((item) => item.id === id)?.name ??
    'график с другого телефона';

  /**
   * Рабочие дни прежнего графика, примыкающие к началу нового.
   *
   * Ловушка, ради которой это считается: «перевели с сентября, первая смена
   * второго» — и первое число остаётся прежней работе сменой, а ручной выходной
   * поверх неё превращается в недоработку. Считается вся серия подряд, а не один
   * день: у пятидневки их перед средой два, и сдвиг на сутки убрал бы только
   * половину.
   *
   * null — предупреждать не о чем: прежнего графика здесь нет или он и так
   * ставит выходной.
   */
  const leftover = useMemo(() => {
    if (!showsStart) return null;

    // Правимый период сам себе предшественником быть не может.
    const prior = history.filter((_, at) => at !== periodIndex);
    if (prior.length === 0) return null;

    const context: ScheduleContext = {
      schedules: prior,
      shiftTypes: indexShiftTypes(shiftTypes),
      overrides: new Map(),
    };

    let minutes = 0;
    let first: IsoDate | null = null;
    let last: IsoDate | null = null;

    // Назад от начала, пока идут рабочие дни. Предел — на случай графика без
    // выходных вовсе: уходить в прошлое бесконечно незачем.
    for (let back = 1; back <= LEFTOVER_LIMIT_DAYS; back += 1) {
      const date = addDays(startsOn, -back);
      if (!scheduleOn(prior, date)) break;

      const { shiftType, plannedMinutes } = resolveDay(context, date);
      if (shiftType.kind !== 'work') break;

      minutes += plannedMinutes;
      first = date;
      last ??= date;
    }

    if (!first || !last) return null;
    // Отдаётся id, а не готовое имя: разрешать его здесь значило бы затащить в
    // зависимости пересоздаваемую на каждый рендер функцию.
    return { first, last, minutes, presetId: scheduleOn(prior, first)!.presetId };
  }, [showsStart, history, periodIndex, startsOn, shiftTypes]);

  /** Начало этого периода: от него и показывается, как график ляжет. */
  const from = showsStart ? startsOn : anchorDate;

  const previewDays = useMemo(
    () =>
      resolveRange(
        draftContext,
        Array.from({ length: PREVIEW_DAYS }, (_, index) => addDays(from, index)),
      ),
    [draftContext, from],
  );

  const previewYear = Number(previewPeriod.slice(0, 4));
  const previewMonth = Number(previewPeriod.slice(5, 7));

  // Десять готовых графиков стоят первыми: большинству дальше листать незачем.
  const choices = [
    ...SCHEDULE_PRESETS.map((item) => ({
      value: item.id,
      label: item.name,
      hint: item.description,
    })),
    ...customSchedules.map((item) => ({
      value: item.id,
      label: item.name,
      hint: describePattern(item.pattern, shiftTypes),
    })),
  ];

  const editedCustom = customSchedules.find((item) => item.id === presetId) ?? null;

  /** Что не так с выбранным файлом. Пусто — либо ещё не выбирали, либо всё вышло. */
  const [importError, setImportError] = useState<string | null>(null);

  /** Отказ системного листа: делиться на этом телефоне нечем. */
  const [shareError, setShareError] = useState<string | null>(null);

  /**
   * Принять чужой график прямо здесь.
   *
   * Тому, кому график прислали, заполнять эту форму нечем: у него в
   * мессенджере лежит готовый файл, а не знание про раскладку и дату первой
   * смены. Поэтому вход в приём стоит там же, где заводят график руками.
   *
   * Предпросмотр встаёт на место этого экрана, а не поверх: график либо
   * собирают сами, либо берут готовым — возвращаться в брошенную форму после
   * принятия чужого незачем. Тем же заменой открывается и сканер.
   */
  const loadFromFile = async (): Promise<void> => {
    setImportError(null);
    const picked = await pickShareFile();

    if (picked.kind === 'canceled') return;
    if (picked.kind === 'error') {
      setImportError(picked.message);
      return;
    }
    if (picked.kind === 'other') {
      setImportError(
        'В этом файле графика нет. Резервная копия открывается в «Настройки → Данные».',
      );
      return;
    }

    router.replace({ pathname: '/track', params: { d: picked.payload } });
  };

  /**
   * Отдать этот график файлом.
   *
   * Прямо отсюда, без промежуточного экрана: системный лист и есть тот выбор,
   * ради которого раньше открывалась отдельная карточка. Уезжает последний
   * период — тот график, по которому работают сейчас.
   */
  const sendFile = async (): Promise<void> => {
    setShareError(null);
    if (!edited) return;

    const share = shareOfTrack(edited, shiftTypes);
    if (!share) return;
    if (!(await sendTrackFile(share))) setShareError(SHARE_FAILED_TEXT);
  };

  return (
    <Sheet
      title={isNew ? 'Новый график' : addsPeriod ? 'Смена графика' : 'График'}
      onClose={() => router.back()}
    >
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        {/* Приём стоит первым и только у нового графика: правя свой, чужой
            файл не открывают. Значки — напротив заголовка: строки под ними
            нет, и карточка занимает ровно одну. */}
        {isNew ? (
          <>
            <Card
              title="Загрузить"
              help="Файл с графиком приходит в мессенджер — открой его отсюда. Что именно добавится, будет видно до того, как оно попадёт в календарь. QR-код с чужого экрана снимается обычной камерой телефона."
              action={
                <View style={{ flexDirection: 'row' }}>
                  <IconButton
                    name="folder-open-outline"
                    label="Загрузить график из файла"
                    accessibilityHint="График, который отдал другой телефон. Заполнять форму ниже тогда не нужно"
                    onPress={() => void loadFromFile()}
                  />
                  {/* Второй путь того же приёма: код с чужого экрана вместо
                      файла в мессенджере. Сканер сам заменяет себя
                      предпросмотром, поэтому и открывается заменой. */}
                  <IconButton
                    name="qr-code-outline"
                    label="Сканировать QR"
                    accessibilityHint="Считать код с экрана другого телефона камерой"
                    onPress={() => router.replace('/settings/scan')}
                  />
                </View>
              }
            >
              {importError ? (
                <AppText
                  variant="body"
                  color={theme.colors.danger}
                  accessibilityLiveRegion="polite"
                >
                  {importError}
                </AppText>
              ) : null}
            </Card>

            {/* Развилка названа словом, а не чертой: «или» читается и
                скринридером, и тем, кто видит два блока подряд. */}
            <AppText
              variant="body"
              tone="muted"
              style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}
            >
              или
            </AppText>
          </>
        ) : null}

        {named ? (
          <Card title="Чей это график">
            <TextField
              label="Название"
              value={name}
              onChangeText={setName}
              placeholder="Вторая работа"
            />
            <Toggle
              label="Считать часы и деньги моими"
              help="Выключи, если это график близкого человека: он будет виден в календаре и может будить будильником, но в сводку часов и в деньги не попадёт."
              value={own}
              onValueChange={setOwn}
            />
          </Card>
        ) : null}

        <Card
          title="График"
          /* Отдать график можно только сохранённым: у черновика, который ещё
             не нажали «Сохранить», нет ни одного периода — отдавать нечем. */
          action={
            edited && history.length > 0 ? (
              <View style={{ flexDirection: 'row' }}>
                <IconButton
                  name="share-social-outline"
                  label="Отправить график файлом"
                  accessibilityHint="Откроется системный лист: мессенджер, почта, облако"
                  onPress={() => void sendFile()}
                />
                <IconButton
                  name="qr-code-outline"
                  label="Показать QR-код графика"
                  accessibilityHint="Код на весь экран: его снимают камерой другого телефона"
                  onPress={() =>
                    push({ pathname: '/settings/share', params: { track: edited.id } })
                  }
                />
              </View>
            ) : null
          }
        >
          {/* Отказ системного листа — первой строкой карточки: значок, который
              его вызвал, стоит прямо над ней. */}
          {shareError ? (
            <AppText variant="body" color={theme.colors.danger} accessibilityLiveRegion="polite">
              {shareError}
            </AppText>
          ) : null}

          {/* Выпадающим списком, а не столбиком радиокнопок: графиков десяток,
              и развёрнутый список выталкивал бы дату первой смены за экран. */}
          <Select label="График работы" value={presetId} options={choices} onChange={setPresetId} />
          <AppText variant="caption" tone="muted">
            {preset.description}
          </AppText>

          {/* Нужного графика в списке нет — значит, его надо собрать, и
              выясняется это ровно здесь. */}
          <Button
            title={editedCustom ? `Изменить «${editedCustom.name}»` : 'Собрать свой'}
            accessibilityHint={
              editedCustom
                ? 'Раскладка по дням меняется в конструкторе'
                : 'Разложить смены по дням цикла или по дням недели'
            }
            onPress={() =>
              push(
                editedCustom
                  ? {
                      pathname: '/settings/schedule-builder',
                      params: { schedule: editedCustom.id },
                    }
                  : '/settings/schedule-builder',
              )
            }
          />
        </Card>

        {/* Начало смен спрашивается у графика, а не в справочнике смен:
            двенадцатичасовая дневная одна на всё приложение, а выходят по ней
            у кого в восемь, у кого в девять. Правка справочника меняла бы
            смену сразу во всех графиках и у всех дорожек. */}
        {startGroups.length > 0 ? (
          <Card
            title="Время смен"
            help="Во сколько смена начинается на самом деле. Поле показательное: конец едет вместе с началом, длительность та же — часы, деньги и время будильника не меняются."
          >
            {startGroups.map((group) => (
              <TimeSelect
                key={group.start}
                label={group.label}
                value={startOf(group)}
                hint={
                  startOf(group) === group.start
                    ? 'Как в справочнике смен'
                    : `В справочнике смен — ${group.start}`
                }
                onChange={(time) => setGroupStart(group, time)}
              />
            ))}
          </Card>
        ) : null}

        <Card title={showsStart ? 'Когда действует' : 'Дата первой смены'}>
          {showsStart ? (
            <>
              {/* Две даты, один календарь: нажатие ставит ту, что выбрана
                  кнопкой. Даты разные по смыслу — с какого дня работаешь по
                  этому графику и куда попадает его первая смена. У 2/2 вторая
                  нужна всегда: переводят обычно не в день выхода. */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                <Button
                  title={`Действует с: ${formatDayShort(startsOn)}`}
                  variant={picking === 'startsOn' ? 'primary' : 'secondary'}
                  compact
                  accessibilityHint="Нажатие по календарю поставит день начала"
                  onPress={() => setPicking('startsOn')}
                />
                <Button
                  title={`Первая смена: ${formatDayShort(anchorDate)}`}
                  variant={picking === 'anchorDate' ? 'primary' : 'secondary'}
                  compact
                  accessibilityHint="Нажатие по календарю поставит день первой смены"
                  onPress={() => setPicking('anchorDate')}
                />
              </View>
              <AppText variant="caption" tone="muted">
                Дни до {formatDayShort(startsOn)} остаются на прежнем графике. Первая смена
                показывает, куда попадает начало раскладки, — обычно это тот же день.
              </AppText>

              {/* Прежний график кончается не там, где его мысленно закончили:
                  «перевели с сентября, первая смена второго» оставляет первое
                  число старой работе рабочей сменой. Пока это видно только по
                  часам в сводке, человек считает это поломкой — поэтому сказано
                  прямо, числом и с кнопкой, которая это чинит. */}
              {leftover ? (
                <View
                  style={{
                    gap: theme.spacing.xs,
                    padding: theme.spacing.md,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.surfaceElevated,
                  }}
                >
                  <AppText variant="body">
                    {leftover.first === leftover.last
                      ? `${formatDayShort(leftover.first)} останется`
                      : `Дни с ${formatDayShort(leftover.first)} по ${formatDayShort(leftover.last)} остаются`}{' '}
                    на графике «{nameOfSchedule(leftover.presetId)}»: рабочие смены,{' '}
                    {formatDuration(leftover.minutes)} в плане.
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    Если ты там уже не работаешь, начни новый график с этого дня — иначе выходной
                    поверх такой смены посчитается недоработкой.
                  </AppText>
                  <Button
                    title={`Начать с ${formatDayShort(leftover.first)}`}
                    compact
                    accessibilityHint="Перенести начало нового графика на первый из этих дней"
                    onPress={() => setStartsOn(leftover.first)}
                  />
                </View>
              ) : null}
            </>
          ) : (
            <>
              <AppText variant="body">{formatDayShort(anchorDate)}</AppText>
              <AppText variant="caption" tone="muted">
                Нажми на день в календаре ниже. Календарь разворачивает график от него и вперёд, и
                назад, но часы и смены считаются только с этого дня.
              </AppText>
            </>
          )}

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
              selectedDate={picking === 'startsOn' && showsStart ? startsOn : anchorDate}
              width={width}
              onSelectDay={(date) => {
                if (showsStart && picking === 'startsOn') {
                  // Первая смена тянется за началом, пока её не двигали руками:
                  // в большинстве переводов это один и тот же день.
                  if (anchorDate === startsOn) setAnchorDate(date);
                  setStartsOn(date);
                  return;
                }
                setAnchorDate(date);
              }}
            />
          </View>
        </Card>

        <Card title={`Как ляжет: ${PREVIEW_DAYS} дней с ${formatDayShort(from)}`}>
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

        {/* История графиков: перевели с пятидневки на 2/2 — прожитые месяцы
            должны остаться на прежнем графике, а не пересчитаться задним
            числом. Показывается только когда есть что показывать: у первого
            графика история — он сам. */}
        {edited && history.length > 0 && !addsPeriod ? (
          <Card title="История графиков">
            <View accessibilityRole="list" style={{ gap: theme.spacing.xs }}>
              {history.map((item, index) => (
                <View
                  key={item.startsOn}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                >
                  <AppText
                    variant="body"
                    tone={index === periodIndex ? 'default' : 'muted'}
                    style={{ flex: 1 }}
                  >
                    С {formatDayShort(item.startsOn)} — {nameOfSchedule(item.presetId)}
                    {index === periodIndex ? ' · правится сейчас' : ''}
                  </AppText>
                  {index === periodIndex ? null : (
                    <IconButton
                      name="create-outline"
                      label={`Править график с ${formatDayShort(item.startsOn)}`}
                      onPress={() =>
                        push({
                          pathname: '/settings/schedule',
                          params: { track: edited.id, period: String(index) },
                        })
                      }
                    />
                  )}
                </View>
              ))}
            </View>
            <AppText variant="caption" tone="muted">
              Перевели на другой график или сменил работу — добавь период, и прошлые месяцы
              останутся посчитанными по-старому.
            </AppText>
            <Button
              title="Сменить график с даты"
              accessibilityHint="Прежний график останется на прожитых месяцах"
              onPress={() =>
                push({
                  pathname: '/settings/schedule',
                  params: { track: edited.id, period: 'new' },
                })
              }
            />
          </Card>
        ) : null}

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
          {/* Период истории убирается отдельно от работы: ошиблись датой
              перевода — незачем сносить весь календарь. Самый первый период
              так не убрать: без него у графика не будет начала. */}
          {edited && !addsPeriod && periodIndex > 0 ? (
            <Button
              title="Убрать этот период"
              variant="danger"
              accessibilityHint="Дни вернутся на прежний график"
              onPress={removePeriod}
            />
          ) : null}
          {/* Последнюю дорожку удалять нечем: без графиков приложению нечего
              показывать, и это состояние достигается сбросом с экрана ошибки. */}
          {edited && tracks.length > 1 ? (
            <Button title="Удалить эту работу" variant="danger" onPress={remove} />
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}
