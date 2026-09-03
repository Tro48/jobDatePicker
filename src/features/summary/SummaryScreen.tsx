import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { todayIso } from '@/domain/date.ts';
import { formatMonthTitle, formatMoney, formatTotalHours } from '@/domain/format.ts';
import { buildMonthSummary, combineTotals } from '@/domain/summary.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import type { PaymentRule } from '@/domain/types.ts';
import { TrackTabs } from '@/features/calendar/TrackTabs.tsx';
import { MONTH_RANGE, buildMonthWindow } from '@/domain/months.ts';
import type { MonthRef } from '@/domain/months.ts';
import { periodOf } from '@/domain/payday.ts';
import { useActiveTrack, useScheduleContext, useScheduleContexts } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, HorizontalPager, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { MonthSummaryPage } from './MonthSummaryPage.tsx';

/** Пустой список правил выплат: новый массив в пропсах ломал бы memo страницы. */
const EMPTY_RULES: PaymentRule[] = [];

/** Ключ страницы. Вне компонента — чтобы пейджер получал одну и ту же функцию. */
const keyOfMonth = (item: MonthRef): string => item.period;

export function SummaryScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const activeContext = useScheduleContext();
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
  const activePayments = useMemo(
    () => allPayments.filter((payment) => payment.trackId === track?.id),
    [allPayments, track],
  );

  /**
   * Данные страницы одним значением: график, его выплаты и его числа аванса и
   * зарплаты. Вместе, а не по отдельности, потому что показывать часы одной
   * работы рядом с деньгами другой нельзя ни одного кадра.
   */
  const active = useMemo(
    () => ({
      context: activeContext,
      payments: activePayments,
      payrollRules: track?.payrollRules ?? EMPTY_RULES,
    }),
    [activeContext, activePayments, track],
  );

  // Заглушка «график не выбран» смотрит на актуальный график, а не на фоновый.
  const { context } = active;

  /**
   * Данные, по которым нарисованы месяцы, которых сейчас не видно.
   *
   * Каждая страница разворачивает свой месяц по дням, а при включённом
   * прогнозе — ещё двенадцать закрытых месяцев следом; страниц в памяти
   * пейджера несколько, а на экране одна. Открытый месяц берёт данные сразу,
   * соседние догоняют следующим кадром и уже переходом — React рисует их в
   * фоне и уступает поток, пока рисует.
   *
   * null — соседей ещё не рисовали ни разу: так открывается экран, и вместо
   * них стоят пустые страницы. Дальше значение не пустует, и при смене графика
   * соседи показывают прежние числа, пока не догонят.
   */
  const [background, setBackground] = useState<typeof active | null>(null);

  useEffect(() => {
    if (background === active) return;
    // Кадр отдаётся открытому месяцу: без него фоновая отрисовка успевает
    // влезть в тот же кадр и съедает весь выигрыш.
    const frame = requestAnimationFrame(() => {
      startTransition(() => setBackground(active));
    });
    return () => cancelAnimationFrame(frame);
  }, [active, background]);

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
  /**
   * Намеренно не зависит от индекса: страница считает свой месяц по item, и
   * листание не должно её пересобирать. Меняется она только вместе с данными —
   * графиком, выплатами, шириной экрана.
   */
  const renderPage = useCallback(
    (item: MonthRef) => {
      const shown = item.period === current.period ? active : background;

      // Соседний месяц до своей очереди — пустая страница: пейджер меряет
      // страницы по ширине, а высоту сводки задаёт содержимое.
      if (!shown) {
        return <View importantForAccessibility="no-hide-descendants" style={{ width }} />;
      }

      return (
        <MonthSummaryPage
          period={item.period}
          context={shown.context as ScheduleContext}
          payments={shown.payments}
          payroll={payroll}
          payrollRules={shown.payrollRules}
          today={today}
          width={width}
          onOpenYear={() =>
            push({ pathname: '/summary/year', params: { year: String(item.year) } })
          }
        />
      );
    },
    [active, background, current.period, payroll, today, width, push],
  );

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
        keyOf={keyOfMonth}
        index={index}
        onIndexChange={setIndex}
        width={width}
        renderPage={renderPage}
      />
    </View>
  );
}
