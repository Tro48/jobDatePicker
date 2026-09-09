import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { monthDays, todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveDay } from '@/domain/engine.ts';
import type { DayNote } from '@/domain/types.ts';
import {
  SHIFT_FORMS,
  formatHoursRatio,
  formatTotalHours,
  plural,
  pluralize,
} from '@/domain/format.ts';
import { describeScheduleStart } from '@/domain/describe.ts';
import { buildMonthSummary } from '@/domain/summary.ts';
import { useActiveTrack, useNotesByDate, useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';
import { AlarmPermissionNotice } from '@/features/alarm/AlarmPermissionNotice.tsx';
import { UpdateNotice } from '@/features/updates/UpdateNotice.tsx';
import { Legend } from './Legend.tsx';
import { WeekdayHeader } from './MonthGrid.tsx';
import { MonthPager } from './MonthPager.tsx';
import { MonthSwitcher } from './MonthSwitcher.tsx';
import { useMonthWindow } from './useMonthWindow.ts';
import { SharedDaysOffCard } from './SharedDaysOffCard.tsx';
import { DayCard } from './DayCard.tsx';
import { useSharedRows } from './useSharedDays.ts';
import { TrackTabs } from './TrackTabs.tsx';

/** Пустой список заметок: одна ссылка на всё приложение — карточка мемоизируется. */
const EMPTY_NOTES: DayNote[] = [];

export function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const push = useGuardedPush();
  const { width } = useWindowDimensions();
  const context = useScheduleContext();
  const track = useActiveTrack();
  const tracks = useAppStore((state) => state.tracks);
  const shared = useAppStore((state) => state.sharedDaysOff);
  const payments = useAppStore((state) => state.payments);
  const currency = useAppStore((state) => state.payroll.currency);
  const notesByDay = useNotesByDate();

  const today = useMemo(() => todayIso(), []);
  const { months, index, visible, setIndex, goTo, key: windowKey } = useMonthWindow(today);

  /**
   * День, на который сейчас смотрит карточка над календарём.
   *
   * Приложение открывается на сегодняшнем: это ответ на главный вопрос к нему.
   * Дальше выбор двигает только нажатие на клетку — листание месяцев его не
   * трогает, поэтому в карточке всегда написана полная дата, а не одно число.
   *
   * Живёт в экране, а не в хранилище: это состояние взгляда, а любая запись в
   * persist сериализует всё состояние и синхронно кладёт его в MMKV.
   */
  const [selected, setSelected] = useState<IsoDate>(today);

  /** Выплаты открытой работы по датам: в клетке у них свой значок. */
  const paymentDates = useMemo(
    () =>
      new Set(
        payments
          .filter((payment) => payment.trackId === track?.id)
          .map((payment) => payment.receivedOn),
      ),
    [payments, track?.id],
  );

  // Карта уже отсортирована по порядку появления — брать из неё готовый
  // список дешевле, чем заново перебирать все заметки приложения.
  const selectedNotes = notesByDay.get(selected) ?? EMPTY_NOTES;

  const selectedPayments = useMemo(
    () =>
      payments.filter(
        (payment) => payment.trackId === track?.id && payment.receivedOn === selected,
      ),
    [payments, track?.id, selected],
  );

  const summary = useMemo(
    () => (context ? buildMonthSummary(context, visible.period, [], today) : null),
    [context, visible.period, today],
  );

  /**
   * Есть ли в этом месяце праздники. Легенда объясняет значок в углу клетки
   * только тогда, когда объяснять есть что: в июле и августе строка «праздник»
   * — лишний шум.
   */
  const monthHasHolidays = useMemo(() => {
    const holidays = context?.holidays;
    if (!holidays) return false;
    return monthDays(visible.year, visible.month).some((date) => holidays.nameOf(date) !== null);
  }, [context, visible.year, visible.month]);

  const sharedRows = useSharedRows(visible.year, visible.month);

  /**
   * Чьи совпадения сейчас выделены. Живёт в экране, а не в хранилище: это
   * состояние взгляда, а любая запись в persist сериализует всё состояние и
   * синхронно кладёт его в MMKV.
   */
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focused = sharedRows.find((row) => row.id === focusedId) ?? null;

  // Выделять нечего, если блок выключен или выбранная строка исчезла.
  const highlighted = useMemo(
    () => (shared.enabled && focused ? new Set(focused.dates) : undefined),
    [shared.enabled, focused],
  );

  // Чьи именно дни выделены. Имя нужно и легенде под календарём, и в озвучке
  // каждой выделенной клетки: по заливке чей это выходной не узнать.
  const highlightName = highlighted ? focused?.name : undefined;

  /**
   * Что скажет строка под легендой. Число дней здесь не украшение: в месяц без
   * единого совпадения календарь всё равно гаснет, и без слов непонятно, что
   * искать нечего.
   */
  const highlight =
    highlighted && focused ? { name: focused.name, days: focused.dates.length } : undefined;

  // Список совпадений показывается, только когда есть с кем совпадать.
  const sharedListVisible = shared.enabled && sharedRows.length > 0;

  // Легенде нужен не токен, а то, откуда смена берёт цвет: у неё может стоять
  // и свой, выбранный в редакторе смены.
  const shiftColors = useMemo(() => {
    if (!context) return {};
    return Object.fromEntries(
      [...context.shiftTypes.values()].map((type) => [
        type.id,
        { colorToken: type.colorToken, ...(type.color ? { color: type.color } : {}) },
      ]),
    );
  }, [context]);

  /**
   * Ряд графиков. С одним графиком в нём только кнопка «+», со вторым
   * появляются сами вкладки. Без единого графика не рисуется: там уже стоит
   * большая кнопка «Выбрать график».
   */
  const trackRow =
    tracks.length > 0 ? (
      <TrackTabs
        tracks={tracks}
        activeTrackId={track?.id ?? null}
        onAdd={() => push({ pathname: '/settings/schedule', params: { track: 'new' } })}
      />
    ) : null;

  /**
   * Нажатие на клетку только переносит выбор.
   *
   * Раньше оно открывало шторку дня — на каждый взгляд «а что у меня в
   * четверг» приходилось открывать и закрывать экран. Теперь ответ приходит в
   * карточку над календарём, а правка дня — отдельное действие с её кнопки.
   */
  const selectDay = useCallback((date: IsoDate) => setSelected(date), []);

  const padding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  };

  if (!context) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={padding}
      >
        <AppText
          variant="display"
          accessibilityRole="header"
          style={{ marginBottom: theme.spacing.lg }}
        >
          Календарь
        </AppText>
        {trackRow}
        <Card title="График не выбран">
          <AppText variant="body" tone="muted">
            Выбери график и дату первой смены — календарь заполнится сам.
          </AppText>
          <Button
            title="Выбрать график"
            variant="primary"
            onPress={() => push('/settings/schedule')}
          />
        </Card>
      </ScrollView>
    );
  }

  const selectedDay = resolveDay(context, selected);
  // Почему за месяц числа меньше обычного — или нули. Та же строка стоит в
  // сводке: расходиться в объяснении этим двум экранам нельзя.
  const startNote = describeScheduleStart(visible.period, context.schedules[0].startsOn);
  // Прошлый месяц отработан целиком — дробить его числа незачем.
  const monthClosed = summary === null || summary.elapsedWorkedDays === summary.workedDays;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={padding}
    >
      {trackRow}

      {/* Шапка страницы — сам месяц: он меняется при листании и точнее
          описывает то, что сейчас на экране, чем слово «Календарь». */}
      <View style={{ marginBottom: theme.spacing.sm }}>
        <MonthSwitcher period={visible.period} onChange={goTo} />
      </View>

      <AlarmPermissionNotice />

      {/* Обновление — новость, а не работа: полоска стоит после разрешений
          будильника, которые чинить надо прямо сейчас, и перед календарём,
          иначе её никто не увидит. */}
      <View style={{ marginBottom: theme.spacing.md, gap: theme.spacing.md }}>
        <UpdateNotice />
        <DayCard
          day={selectedDay}
          isToday={selected === today}
          notes={selectedNotes}
          payments={selectedPayments}
          currency={currency}
          onEdit={() => push({ pathname: '/day/[date]', params: { date: selected } })}
          onNotes={() => push({ pathname: '/notes/[date]', params: { date: selected } })}
        />
      </View>

      {/* Сетка идёт во всю ширину экрана: при семи колонках только так клетка
          дотягивает до 48 dp зоны нажатия на узких телефонах. */}
      <View style={{ marginHorizontal: -theme.spacing.lg }}>
        <WeekdayHeader width={width} />
        <MonthPager
          key={windowKey}
          months={months}
          index={index}
          onIndexChange={setIndex}
          context={context}
          today={today}
          selectedDate={selected}
          onSelectDay={selectDay}
          highlighted={highlighted}
          highlightName={highlightName}
          notes={notesByDay}
          paymentDates={paymentDates}
          width={width}
        />
      </View>

      {summary && summary.byShiftType.length > 0 ? (
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
          {/* Выделение объясняется легендой под календарём, вместе с
              заливками смен: своей строки у него нет — она стояла над сеткой
              и на каждое нажатие в списке двигала весь экран вниз. */}
          <Legend
            totals={summary.byShiftType}
            colors={shiftColors}
            hasHolidays={monthHasHolidays}
            hasNotes={monthHas(notesByDay.keys(), visible.period)}
            hasPayments={monthHas(paymentDates, visible.period)}
            shared={highlight}
            reserveShared={sharedListVisible}
          />
          <View style={{ gap: theme.spacing.xs }}>
            {/* Только смены и часы. Число ручных правок отсюда убрано: после
                двухнедельного отпуска строка «правок: 14» читается как «что-то
                сломалось на четырнадцати днях», хотя это одна проставленная
                запись. Кому нужен счёт — он есть в сводке за месяц.

                В незакрытом месяце числа идут дробью: «7/16 смен» — сколько из
                запланированного уже отработано. */}
            <AppText
              variant="body"
              tone="muted"
              accessibilityLabel={
                monthClosed
                  ? `${pluralize(summary.workedDays, SHIFT_FORMS)}, ${formatTotalHours(summary.workedMinutes)}`
                  : `Отработано ${summary.elapsedWorkedDays} из ${pluralize(summary.workedDays, SHIFT_FORMS)}, ${formatTotalHours(summary.elapsedWorkedMinutes)} из ${formatTotalHours(summary.workedMinutes)}`
              }
            >
              {monthClosed
                ? `${pluralize(summary.workedDays, SHIFT_FORMS)} · ${formatTotalHours(summary.workedMinutes)}`
                : `${summary.elapsedWorkedDays}/${summary.workedDays} ${plural(summary.workedDays, SHIFT_FORMS)} · ${formatHoursRatio(summary.elapsedWorkedMinutes, summary.workedMinutes)}`}
            </AppText>
            <OvertimeLine minutes={summary.overtimeMinutes} />
            {startNote ? (
              <AppText variant="caption" tone="muted">
                {startNote}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}

      {summary && summary.byShiftType.length === 0 && startNote ? (
        <AppText variant="body" tone="muted" style={{ marginTop: theme.spacing.md }}>
          {startNote}
        </AppText>
      ) : null}

      {sharedListVisible ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <SharedDaysOffCard rows={sharedRows} focusedId={focusedId} onFocus={setFocusedId} />
        </View>
      ) : null}

      {/* Правка графика — внизу страницы, а не в ряду переключателей: она про
          весь открытый календарь, а не про выбор между ними. Название стоит в
          кнопке, только когда графиков несколько, — иначе непонятно, какой из
          них откроется. */}
      {track ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            title={tracks.length > 1 ? `Изменить: ${track.name}` : 'Изменить график'}
            accessibilityHint="График, дата первой смены, название"
            onPress={() => push({ pathname: '/settings/schedule', params: { track: track.id } })}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * Есть ли в этом месяце хоть одна такая дата.
 *
 * По ней легенда решает, объяснять ли значок в углу клетки: в месяце без
 * единой заметки строка «заметка» — лишний шум, ровно как строка «праздник» в
 * июле.
 */
function monthHas(dates: Iterable<IsoDate>, period: string): boolean {
  for (const date of dates) {
    if (date.slice(0, 7) === period) return true;
  }
  return false;
}

/**
 * Итог переработки за месяц одной строкой: точка того же цвета, что и в
 * клетках, плюс часы. Точка здесь работает легендой к календарю — потому и
 * стоит прямо под ним.
 *
 * Плюсы и минусы месяца складываются, и в ноль они сходятся редко; сошлись —
 * строки нет, показывать «0 ч» незачем.
 */
function OvertimeLine({ minutes }: { minutes: number }) {
  const theme = useTheme();
  if (minutes === 0) return null;

  const over = minutes > 0;
  const color = over ? theme.colors.positive : theme.colors.danger;
  const hours = formatTotalHours(Math.abs(minutes));

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${over ? 'Переработка' : 'Недоработка'} за месяц: ${hours}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      <View
        importantForAccessibility="no"
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
      />
      <AppText variant="body" color={color} importantForAccessibility="no">
        {over ? 'Переработка' : 'Недоработка'} {hours}
      </AppText>
    </View>
  );
}
