import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { resolveDay } from '@/domain/engine.ts';
import { SHIFT_FORMS, formatMonthTitle, formatTotalHours, pluralize } from '@/domain/format.ts';
import { periodOf } from '@/domain/payday.ts';
import { buildMonthSummary } from '@/domain/summary.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { Legend } from './Legend.tsx';
import { WeekdayHeader } from './MonthGrid.tsx';
import { MONTH_RANGE, buildMonthWindow } from '@/domain/months.ts';
import { MonthPager } from './MonthPager.tsx';
import { TodayCard } from './TodayCard.tsx';

export function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const push = useGuardedPush();
  const { width } = useWindowDimensions();
  const context = useScheduleContext();

  const today = useMemo(() => todayIso(), []);
  const months = useMemo(() => buildMonthWindow(periodOf(today)), [today]);
  const [index, setIndex] = useState(MONTH_RANGE);
  const visible = months[index];

  const summary = useMemo(
    () => (context ? buildMonthSummary(context, visible.period, []) : null),
    [context, visible.period],
  );

  const colorTokens = useMemo(() => {
    if (!context) return {};
    return Object.fromEntries(
      [...context.shiftTypes.values()].map((type) => [type.id, type.colorToken]),
    );
  }, [context]);

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
        <AppText variant="display" accessibilityRole="header" style={{ marginBottom: theme.spacing.lg }}>
          Календарь
        </AppText>
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={padding}
    >
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

      <View style={{ marginBottom: theme.spacing.md }}>
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
          width={width}
        />
      </View>

      {summary ? (
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
          <Legend totals={summary.byShiftType} colorTokens={colorTokens} />
          <AppText variant="body" tone="muted">
            {pluralize(summary.workedDays, SHIFT_FORMS)} · {formatTotalHours(summary.workedMinutes)}
            {summary.adjustedDays > 0 ? ` · правок: ${summary.adjustedDays}` : ''}
          </AppText>
        </View>
      ) : null}
    </ScrollView>
  );
}
