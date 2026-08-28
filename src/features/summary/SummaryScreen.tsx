import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { todayIso } from '@/domain/date.ts';
import {
  DAY_FORMS,
  SHIFT_FORMS,
  formatDayShort,
  formatMonthTitle,
  formatMoney,
  formatSignedMoney,
  formatSignedShifts,
  formatSignedTotalHours,
  formatTotalHours,
  plural,
  pluralize,
} from '@/domain/format.ts';
import { periodOf, shiftPeriod, upcomingPayments } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import { buildMonthSummary, forecastMonth } from '@/domain/summary.ts';
import type { MonthSummary } from '@/domain/summary.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, IconButton, Stat } from '@/ui';
import { useTheme } from '@/theme';
import { PaymentList } from './PaymentList.tsx';

/** Сколько закрытых месяцев просматривать в поисках ставки для прогноза. */
const HISTORY_DEPTH = 12;

export function SummaryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const context = useScheduleContext();
  const payroll = useAppStore((state) => state.payroll);
  const payments = useAppStore((state) => state.payments);

  const today = useMemo(() => todayIso(), []);
  const [period, setPeriod] = useState<Period>(() => periodOf(today));

  const summary = useMemo(
    () => (context ? buildMonthSummary(context, period, payments) : null),
    [context, period, payments],
  );

  const previous = useMemo(
    () => (context ? buildMonthSummary(context, shiftPeriod(period, -1), payments) : null),
    [context, period, payments],
  );

  const history = useMemo<MonthSummary[]>(() => {
    if (!context) return [];
    return Array.from({ length: HISTORY_DEPTH }, (_, index) =>
      buildMonthSummary(context, shiftPeriod(period, -(index + 1)), payments),
    );
  }, [context, period, payments]);

  const forecast = useMemo(() => {
    if (!context || !summary || !payroll.forecastFromLastClosedMonth) return null;
    // Прогноз показывается только пока за месяц не внесено ни одной выплаты:
    // как только появился факт, догадка становится лишней.
    if (summary.payments.length > 0) return null;
    return forecastMonth(summary, history, today, context);
  }, [context, summary, history, today, payroll.forecastFromLastClosedMonth]);

  const upcoming = useMemo(
    () => upcomingPayments(payroll.rules, today, 1)[0],
    [payroll.rules, today],
  );

  const padding = {
    paddingTop: insets.top + theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  };

  if (!context || !summary || !previous) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={padding}>
        <AppText variant="display" accessibilityRole="header" style={{ marginBottom: theme.spacing.lg }}>
          Сводка
        </AppText>
        <Card title="График не выбран">
          <AppText variant="body" tone="muted">
            Считать часы не по чему. Выбери график — сводка появится сама.
          </AppText>
          <Button title="Выбрать график" variant="primary" onPress={() => router.push('/settings/schedule')} />
        </Card>
      </ScrollView>
    );
  }

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const currency = payroll.currency;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={padding}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <IconButton
          name="chevron-back"
          label="Предыдущий месяц"
          onPress={() => setPeriod((value) => shiftPeriod(value, -1))}
        />
        <AppText
          variant="title"
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={{ flex: 1, textAlign: 'center' }}
        >
          {formatMonthTitle(year, month)}
        </AppText>
        <IconButton
          name="chevron-forward"
          label="Следующий месяц"
          onPress={() => setPeriod((value) => shiftPeriod(value, 1))}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
        <Stat
          value={formatTotalHours(summary.workedMinutes)}
          label="отработано"
          spoken={`Отработано ${formatTotalHours(summary.workedMinutes)}`}
        />
        <Stat
          value={String(summary.workedDays)}
          label={plural(summary.workedDays, SHIFT_FORMS)}
          spoken={pluralize(summary.workedDays, SHIFT_FORMS)}
        />
        <Stat
          value={String(summary.restDays)}
          label="выходных"
          spoken={`${summary.restDays} ${summary.restDays === 1 ? 'выходной' : 'выходных'}`}
        />
      </View>

      <Card title="По типам смен">
        {summary.byShiftType.map((item) => (
          <View
            key={item.shiftTypeId}
            accessibilityRole="text"
            accessibilityLabel={`${item.name}: ${pluralize(item.days, DAY_FORMS)}${item.minutes > 0 ? `, ${formatTotalHours(item.minutes)}` : ''}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
          >
            <AppText variant="body" importantForAccessibility="no" style={{ flex: 1 }}>
              {item.name}
            </AppText>
            <AppText variant="body" tone="muted" importantForAccessibility="no">
              {pluralize(item.days, DAY_FORMS)}
            </AppText>
            <AppText variant="body" tone="muted" importantForAccessibility="no" style={{ minWidth: 72, textAlign: 'right' }}>
              {item.minutes > 0 ? formatTotalHours(item.minutes) : '—'}
            </AppText>
          </View>
        ))}
        {summary.adjustedDays > 0 ? (
          <AppText variant="caption" tone="muted">
            Изменено вручную: {pluralize(summary.adjustedDays, DAY_FORMS)}
          </AppText>
        ) : null}
      </Card>

      <Card title="Деньги">
        <PaymentList payments={summary.payments} currency={currency} />

        {summary.payments.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="heading">Итого</AppText>
              <AppText variant="heading">{formatMoney(summary.totalPaid, currency)}</AppText>
            </View>
            {summary.effectiveHourlyRate !== null && summary.effectiveShiftRate !== null ? (
              <AppText variant="body" tone="muted">
                {formatMoney(summary.effectiveHourlyRate, currency)} за час ·{' '}
                {formatMoney(summary.effectiveShiftRate, currency)} за смену
              </AppText>
            ) : (
              <AppText variant="caption" tone="muted">
                Часов за месяц нет, поэтому ставка не считается.
              </AppText>
            )}
          </>
        ) : (
          <AppText variant="body" tone="muted">
            За этот месяц выплат ещё не внесено.
          </AppText>
        )}

        {upcoming ? (
          <AppText variant="caption" tone="muted">
            Ближайшая: {upcoming.rule.kind === 'advance' ? 'аванс' : 'зарплата'} за{' '}
            {formatMonthTitle(
              Number(upcoming.period.slice(0, 4)),
              Number(upcoming.period.slice(5, 7)),
            ).toLowerCase()}
            , {formatDayShort(upcoming.date)}
            {upcoming.daysAway === 0 ? ' — сегодня' : `, через ${pluralize(upcoming.daysAway, DAY_FORMS)}`}
          </AppText>
        ) : null}

        <Button
          title="Внести выплату"
          variant="primary"
          onPress={() => router.push({ pathname: '/payment/new', params: { period } })}
        />
      </Card>

      <Card title="К предыдущему месяцу">
        <ComparisonRow label="Часы" value={formatSignedTotalHours(summary.workedMinutes - previous.workedMinutes)} />
        <ComparisonRow label="Смены" value={formatSignedShifts(summary.workedDays - previous.workedDays)} />
        <ComparisonRow label="Деньги" value={formatSignedMoney(summary.totalPaid - previous.totalPaid, currency)} />
      </Card>

      {forecast ? (
        <Card title="Прогноз">
          <AppText variant="heading">{formatMoney(forecast.projectedTotal, currency)}</AppText>
          <AppText variant="body" tone="muted">
            Уже отработано на {formatMoney(forecast.earnedSoFar, currency)}
          </AppText>
          {/* Прогноз всегда подписан источником: приложение не знает ставку,
              оно взяло её из последнего закрытого месяца. */}
          <AppText variant="caption" tone="muted">
            Это прогноз, а не факт: ставка {formatMoney(forecast.hourlyRate, currency)} за час взята из{' '}
            {formatMonthTitle(
              Number(forecast.basedOnPeriod.slice(0, 4)),
              Number(forecast.basedOnPeriod.slice(5, 7)),
            ).toLowerCase()}
            . В итоги месяца он не входит.
          </AppText>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function ComparisonRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
    >
      <AppText variant="body" importantForAccessibility="no">
        {label}
      </AppText>
      <AppText variant="body" tone="muted" importantForAccessibility="no">
        {value}
      </AppText>
    </View>
  );
}
