import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { todayIso } from '@/domain/date.ts';
import {
  DAY_FORMS,
  SHIFT_FORMS,
  formatDayShort,
  formatMonthTitle,
  formatMoney,
  formatTotalHours,
  plural,
  pluralize,
} from '@/domain/format.ts';
import { periodOf, shiftPeriod, upcomingPayments } from '@/domain/payday.ts';
import { PAYMENT_KIND_LABELS } from '@/domain/payments.ts';
import type { Period } from '@/domain/payday.ts';
import { buildMonthSummary, forecastMonth } from '@/domain/summary.ts';
import type { MonthSummary } from '@/domain/summary.ts';
import { useScheduleContext } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, IconButton, Stat } from '@/ui';
import { useTheme } from '@/theme';

/** Сколько закрытых месяцев просматривать в поисках ставки для прогноза. */
const HISTORY_DEPTH = 12;

/** Стрелка «стало» и прочерк «данных нет» — одинаковые во всём экране. */
const ARROW = '\u2192';
const DASH = '\u2014';

export function SummaryScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
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
          <Button title="Выбрать график" variant="primary" onPress={() => push('/settings/schedule')} />
        </Card>
      </ScrollView>
    );
  }

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const currency = payroll.currency;
  const currentTitle = formatMonthTitle(year, month);
  const previousPeriod = shiftPeriod(period, -1);
  const previousTitle = formatMonthTitle(
    Number(previousPeriod.slice(0, 4)),
    Number(previousPeriod.slice(5, 7)),
  );

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
          {currentTitle}
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

      <Card title="Деньги за месяц">
        {summary.payments.length > 0 ? (
          <>
            <MoneyRow
              label="Итого"
              value={formatMoney(summary.totalPaid, currency)}
              emphasis
            />
            {summary.effectiveShiftRate !== null ? (
              <MoneyRow label="За смену" value={formatMoney(summary.effectiveShiftRate, currency)} />
            ) : null}
            {summary.effectiveHourlyRate !== null ? (
              <MoneyRow label="За час" value={formatMoney(summary.effectiveHourlyRate, currency)} />
            ) : null}

            {/* Отпускные и больничные — отдельными строками: в сумму месяца они
                входят, а в ставки нет, часами они не заработаны. */}
            {summary.byPaymentKind.map((entry) => (
              <MoneyRow
                key={entry.kind}
                label={PAYMENT_KIND_LABELS[entry.kind]}
                value={formatMoney(entry.amount, currency)}
                muted
              />
            ))}

            {summary.compensationPaid > 0 ? (
              <AppText variant="caption" tone="muted">
                За смену и за час — по авансу и зарплате. Отпускные и больничные в ставку
                не входят: они не заработаны часами этого месяца.
              </AppText>
            ) : null}
            {summary.workPaid > 0 && summary.workedMinutes === 0 ? (
              <AppText variant="caption" tone="muted">
                Смен за месяц нет, поэтому ставка не считается.
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText variant="body" tone="muted">
            За этот месяц выплат ещё не внесено. Сумма вносится в карточке дня, в который
            она пришла.
          </AppText>
        )}

        {upcoming ? (
          <AppText variant="caption" tone="muted">
            Ближайшая: {PAYMENT_KIND_LABELS[upcoming.rule.kind].toLowerCase()} за{' '}
            {formatMonthTitle(
              Number(upcoming.period.slice(0, 4)),
              Number(upcoming.period.slice(5, 7)),
            ).toLowerCase()}
            , {formatDayShort(upcoming.date)}
            {upcoming.daysAway === 0 ? ' — сегодня' : `, через ${pluralize(upcoming.daysAway, DAY_FORMS)}`}
          </AppText>
        ) : null}
      </Card>

      <Card title={`Сравнение с ${previousTitle.toLowerCase()}`}>
        <ComparisonRow
          label="Часы"
          previous={formatTotalHours(previous.workedMinutes)}
          current={formatTotalHours(summary.workedMinutes)}
          spoken={`Часы: в ${previousTitle.toLowerCase()} ${formatTotalHours(previous.workedMinutes)}, в ${currentTitle.toLowerCase()} ${formatTotalHours(summary.workedMinutes)}`}
        />
        <ComparisonRow
          label="Смены"
          previous={pluralize(previous.workedDays, SHIFT_FORMS)}
          current={pluralize(summary.workedDays, SHIFT_FORMS)}
          spoken={`Смены: в ${previousTitle.toLowerCase()} ${pluralize(previous.workedDays, SHIFT_FORMS)}, в ${currentTitle.toLowerCase()} ${pluralize(summary.workedDays, SHIFT_FORMS)}`}
        />
        {/* Показываются суммы обоих месяцев, а не разница: месяц с отпуском
            давал минус во всю зарплату прошлого — число верное, толку ноль.
            Прочерк вместо суммы честнее нуля: выплат просто ещё нет. */}
        <ComparisonRow
          label="Деньги"
          previous={previous.payments.length > 0 ? formatMoney(previous.totalPaid, currency) : DASH}
          current={summary.payments.length > 0 ? formatMoney(summary.totalPaid, currency) : DASH}
          spoken={`Деньги: в ${previousTitle.toLowerCase()} ${previous.payments.length > 0 ? formatMoney(previous.totalPaid, currency) : 'выплат нет'}, в ${currentTitle.toLowerCase()} ${summary.payments.length > 0 ? formatMoney(summary.totalPaid, currency) : 'выплат нет'}`}
        />
        {summary.payments.length === 0 || previous.payments.length === 0 ? (
          <AppText variant="caption" tone="muted">
            Прочерк — за месяц ещё не внесено ни одной выплаты.
          </AppText>
        ) : null}
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

function ComparisonRow({
  label,
  previous,
  current,
  spoken,
}: {
  label: string;
  previous: string;
  current: string;
  spoken: string;
}) {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={spoken}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <AppText variant="body" importantForAccessibility="no">
        {label}
      </AppText>
      {/* Значения в своей строке: на узком экране она переносится целиком,
          а не наезжает на подпись слева. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 }}>
        <AppText variant="body" tone="muted" importantForAccessibility="no">
          {previous}
        </AppText>
        <AppText variant="body" tone="muted" importantForAccessibility="no">
          {ARROW}
        </AppText>
        <AppText variant="body" importantForAccessibility="no">
          {current}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Строка денежного блока. Итог выделен начертанием, а не только размером:
 * ориентироваться на один лишь визуальный вес нельзя.
 */
function MoneyRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  const variant = emphasis ? 'heading' : 'body';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}
    >
      <AppText
        variant={variant}
        tone={muted ? 'muted' : undefined}
        importantForAccessibility="no"
        style={{ flexShrink: 1 }}
      >
        {label}
      </AppText>
      <AppText variant={variant} tone={muted ? 'muted' : undefined} importantForAccessibility="no">
        {value}
      </AppText>
    </View>
  );
}
