import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayIso } from '@/domain/date.ts';
import { formatMonthTitle, formatMoney, formatTotalHours } from '@/domain/format.ts';
import { buildMonthSummary, combineTotals } from '@/domain/summary.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import { TrackTabs } from '@/features/calendar/TrackTabs.tsx';
import { MONTH_RANGE, buildMonthWindow } from '@/domain/months.ts';
import { periodOf } from '@/domain/payday.ts';
import { useActiveTrack, useScheduleContext, useScheduleContexts } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, HorizontalPager, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { MonthSummaryPage } from './MonthSummaryPage.tsx';

export function SummaryScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const context = useScheduleContext();
  const track = useActiveTrack();
  const tracks = useAppStore((state) => state.tracks);
  const contexts = useScheduleContexts();
  const payroll = useAppStore((state) => state.payroll);
  const allPayments = useAppStore((state) => state.payments);

  const today = useMemo(() => todayIso(), []);
  const months = useMemo(() => buildMonthWindow(periodOf(today)), [today]);
  const [index, setIndex] = useState(MONTH_RANGE);

  const current = months[index];

  // Сводка всегда про одну работу: смешивать часы двух работодателей в одной
  // таблице нельзя — ставка за час у них разная.
  const payments = useMemo(
    () => allPayments.filter((payment) => payment.trackId === track?.id),
    [allPayments, track],
  );

  /**
   * Итог по всем своим работам за открытый месяц. Ради него вторая работа и
   * заводится: по отдельности сводки есть, а «сколько всего вышло» иначе
   * приходится складывать в уме.
   */
  const combined = useMemo(() => {
    const own = tracks.filter((item) => item.own && contexts.has(item.id));
    if (own.length < 2) return null;

    return combineTotals(
      own.map((item) =>
        buildMonthSummary(
          contexts.get(item.id) as ScheduleContext,
          current.period,
          allPayments.filter((payment) => payment.trackId === item.id),
          today,
        ),
      ),
    );
  }, [tracks, contexts, allPayments, current.period, today]);
  const padding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
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
          Сводка
        </AppText>
        <Card title="График не выбран">
          <AppText variant="body" tone="muted">
            Считать часы не по чему. Выбери график — сводка появится сама.
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

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Шапка вне листалки: стрелки и свайп двигают один и тот же индекс. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <IconButton
          name="chevron-back"
          label="Предыдущий месяц"
          disabled={index === 0}
          onPress={() => setIndex((value) => Math.max(0, value - 1))}
        />
        <AppText
          variant="title"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={{ flex: 1, textAlign: 'center' }}
        >
          {formatMonthTitle(current.year, current.month)}
        </AppText>
        <IconButton
          name="chevron-forward"
          label="Следующий месяц"
          disabled={index === months.length - 1}
          onPress={() => setIndex((value) => Math.min(months.length - 1, value + 1))}
        />
      </View>

      {tracks.length > 1 ? (
        <View style={{ paddingHorizontal: theme.spacing.lg }}>
          <TrackTabs tracks={tracks} activeTrackId={track?.id ?? null} />
        </View>
      ) : null}

      {combined ? (
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
          <AppText
            variant="body"
            tone="muted"
            accessibilityLabel={`Всего по ${combined.tracks} работам: ${formatTotalHours(combined.workedMinutes)}, ${formatMoney(combined.totalPaid, payroll.currency)}`}
          >
            Всего по {combined.tracks} работам: {formatTotalHours(combined.workedMinutes)} ·{' '}
            {formatMoney(combined.totalPaid, payroll.currency)}
          </AppText>
        </View>
      ) : null}

      <HorizontalPager
        items={months}
        keyOf={(item) => item.period}
        index={index}
        onIndexChange={setIndex}
        width={width}
        renderPage={(item) => (
          <MonthSummaryPage
            period={item.period}
            context={context}
            payments={payments}
            payroll={payroll}
            payrollRules={track?.payrollRules ?? []}
            today={today}
            width={width}
            onOpenYear={() =>
              push({ pathname: '/summary/year', params: { year: String(item.year) } })
            }
          />
        )}
      />
    </View>
  );
}
