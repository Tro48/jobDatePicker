import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveDay } from '@/domain/engine.ts';
import {
  SHIFT_FORMS,
  formatHoursRatio,
  formatMonthTitle,
  formatTotalHours,
  plural,
  pluralize,
} from '@/domain/format.ts';
import { periodOf } from '@/domain/payday.ts';
import { buildMonthSummary } from '@/domain/summary.ts';
import { useActiveTrack, useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { AlarmPermissionNotice } from '@/features/alarm/AlarmPermissionNotice.tsx';
import { UpdateNotice } from '@/features/updates/UpdateNotice.tsx';
import { Legend } from './Legend.tsx';
import { WeekdayHeader } from './MonthGrid.tsx';
import { MONTH_RANGE, buildMonthWindow } from '@/domain/months.ts';
import { MonthPager } from './MonthPager.tsx';
import { SharedDaysOffCard } from './SharedDaysOffCard.tsx';
import { TodayCard } from './TodayCard.tsx';
import { useSharedRows } from './useSharedDays.ts';
import { TrackTabs } from './TrackTabs.tsx';

export function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const push = useGuardedPush();
  const { width } = useWindowDimensions();
  const context = useScheduleContext();
  const track = useActiveTrack();
  const tracks = useAppStore((state) => state.tracks);
  const shared = useAppStore((state) => state.sharedDaysOff);

  const today = useMemo(() => todayIso(), []);
  const months = useMemo(() => buildMonthWindow(periodOf(today)), [today]);
  const [index, setIndex] = useState(MONTH_RANGE);
  const visible = months[index];

  const summary = useMemo(
    () => (context ? buildMonthSummary(context, visible.period, [], today) : null),
    [context, visible.period, today],
  );

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

  const colorTokens = useMemo(() => {
    if (!context) return {};
    return Object.fromEntries(
      [...context.shiftTypes.values()].map((type) => [type.id, type.colorToken]),
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

  const openDay = useCallback(
    (date: IsoDate) => push({ pathname: '/day/[date]', params: { date } }),
    [push],
  );

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

  const todayDay = resolveDay(context, today);
  // Прошлый месяц отработан целиком — дробить его числа незачем.
  const monthClosed = summary === null || summary.elapsedWorkedDays === summary.workedDays;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={padding}
    >
      {trackRow}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm }}>
        <IconButton
          name="chevron-back"
          label="Предыдущий месяц"
          disabled={index === 0}
          onPress={() => setIndex((value) => Math.max(0, value - 1))}
        />
        {/* Заголовок страницы — сам месяц: он меняется при листании и точнее
            описывает то, что сейчас на экране, чем слово «Календарь». */}
        <AppText
          variant="title"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={{ flex: 1, textAlign: 'center' }}
        >
          {formatMonthTitle(visible.year, visible.month)}
        </AppText>
        <IconButton
          name="chevron-forward"
          label="Следующий месяц"
          disabled={index === months.length - 1}
          onPress={() => setIndex((value) => Math.min(months.length - 1, value + 1))}
        />
      </View>

      <AlarmPermissionNotice />

      {/* Обновление — новость, а не работа: полоска стоит после разрешений
          будильника, которые чинить надо прямо сейчас, и перед календарём,
          иначе её никто не увидит. */}
      <View style={{ marginBottom: theme.spacing.md, gap: theme.spacing.md }}>
        <UpdateNotice />
        <TodayCard day={todayDay} />
      </View>

      {/* Сетка идёт во всю ширину экрана: при семи колонках только так клетка
          дотягивает до 48 dp зоны нажатия на узких телефонах. */}
      <View style={{ marginHorizontal: -theme.spacing.lg }}>
        <WeekdayHeader width={width} />
        <MonthPager
          months={months}
          index={index}
          onIndexChange={setIndex}
          context={context}
          today={today}
          onSelectDay={openDay}
          highlighted={highlighted}
          width={width}
        />
      </View>

      {summary ? (
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
          <Legend totals={summary.byShiftType} colorTokens={colorTokens} />
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
          </View>
        </View>
      ) : null}

      {shared.enabled ? (
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
