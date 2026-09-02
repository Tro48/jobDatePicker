import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import {
  DAY_FORMS,
  SHIFT_FORMS,
  formatDayShort,
  formatHours,
  formatMonthTitle,
  formatMoney,
  formatOvertimeTotal,
  formatTotalHours,
  plural,
  pluralize,
} from '@/domain/format.ts';
import { shiftPeriod, upcomingPayments } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import { PAYMENT_KIND_LABELS } from '@/domain/payments.ts';
import { buildMonthSummary, forecastMonth } from '@/domain/summary.ts';
import type { MonthSummary } from '@/domain/summary.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { PaymentRecord, PayrollSettings } from '@/domain/types.ts';
import { AppText, Button, Card, Stat } from '@/ui';
import { useTheme } from '@/theme';

/** Сколько закрытых месяцев просматривать в поисках ставки для прогноза. */
const HISTORY_DEPTH = 12;

/** Стрелка «стало» и прочерк «данных нет» — одинаковые во всём экране. */
const ARROW = '→';
const DASH = '—';

export interface MonthSummaryPageProps {
  period: Period;
  context: ScheduleContext;
  payments: PaymentRecord[];
  payroll: PayrollSettings;
  today: IsoDate;
  /** Ширина страницы пейджера: месяцы листаются вбок. */
  width: number;
  onOpenYear: () => void;
}

/**
 * Сводка одного месяца — страница листалки.
 *
 * Отдельный компонент именно ради листания: пейджер держит в памяти три
 * страницы, и каждая считает свой месяц сама.
 */
export function MonthSummaryPage({
  period,
  context,
  payments,
  payroll,
  today,
  width,
  onOpenYear,
}: MonthSummaryPageProps) {
  const theme = useTheme();

  const summary = useMemo(
    () => buildMonthSummary(context, period, payments, today),
    [context, period, payments, today],
  );

  // Прогноз показывается только пока за месяц не внесено ни одной выплаты: как
  // только появился факт, догадка становится лишней.
  const wantsForecast = payroll.forecastFromLastClosedMonth && summary.payments.length === 0;

  /**
   * Закрытые месяцы, от ближайшего к дальнему.
   *
   * Первый нужен всегда — с ним сравнивается текущий. Вся глубина нужна одному
   * прогнозу, поэтому без него считается ровно один месяц: каждая сводка
   * разворачивает месяц целиком, а страниц в пейджере три.
   */
  const history = useMemo<MonthSummary[]>(
    () =>
      Array.from({ length: wantsForecast ? HISTORY_DEPTH : 1 }, (_, index) =>
        buildMonthSummary(context, shiftPeriod(period, -(index + 1)), payments, today),
      ),
    [context, period, payments, today, wantsForecast],
  );

  // Предыдущий месяц — первый в истории, второй раз его считать незачем.
  const previous = history[0];

  const forecast = useMemo(
    () => (wantsForecast ? forecastMonth(summary, history) : null),
    [summary, history, wantsForecast],
  );

  const upcoming = useMemo(
    () => upcomingPayments(payroll.rules, today, 1)[0],
    [payroll.rules, today],
  );

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  // Месяц закрыт, когда все его смены уже позади: тогда «отработано» и
  // «запланировано» — одно и то же число.
  const monthClosed = summary.elapsedWorkedDays === summary.workedDays;
  // Плюсы и минусы за месяц складываются: два дня «+2» и «−2» дают ноль, и это
  // не «нет отклонений», а «сошлось». Формулировка это различает.
  const overtimeSpoken =
    summary.overtimeMinutes === 0
      ? `Переработка и недоработка сошлись в ноль на ${pluralize(summary.overtimeDays, DAY_FORMS)}`
      : `${summary.overtimeMinutes > 0 ? 'Переработка' : 'Недоработка'} за месяц: ${formatTotalHours(Math.abs(summary.overtimeMinutes))} на ${pluralize(summary.overtimeDays, DAY_FORMS)}`;
  const currency = payroll.currency;
  const currentTitle = formatMonthTitle(year, month);
  const previousPeriod = shiftPeriod(period, -1);
  const previousTitle = formatMonthTitle(
    Number(previousPeriod.slice(0, 4)),
    Number(previousPeriod.slice(5, 7)),
  );

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxl,
      }}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
        {/* В незакрытом месяце показывается дробь «сделано из запланированного»:
            без неё «192 ч» в начале месяца читается как уже отработанные часы.
            В закрытом месяце дробь не рисуется — «192/192 ч» ничего не
            добавляет. */}
        <Stat
          value={
            monthClosed
              ? formatTotalHours(summary.workedMinutes)
              : formatHours(summary.elapsedWorkedMinutes)
          }
          total={monthClosed ? undefined : formatTotalHours(summary.workedMinutes)}
          label="отработано"
          spoken={
            monthClosed
              ? `Отработано ${formatTotalHours(summary.workedMinutes)}`
              : `Отработано ${formatTotalHours(summary.elapsedWorkedMinutes)} из ${formatTotalHours(summary.workedMinutes)}`
          }
        />
        <Stat
          value={String(monthClosed ? summary.workedDays : summary.elapsedWorkedDays)}
          total={monthClosed ? undefined : String(summary.workedDays)}
          label={plural(summary.workedDays, SHIFT_FORMS)}
          spoken={
            monthClosed
              ? pluralize(summary.workedDays, SHIFT_FORMS)
              : `Отработано ${summary.elapsedWorkedDays} из ${pluralize(summary.workedDays, SHIFT_FORMS)}`
          }
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
        {summary.overtimeDays > 0 ? (
          <AppText variant="caption" tone="muted" accessibilityLabel={overtimeSpoken}>
            Сверх нормы смен: {formatOvertimeTotal(summary.overtimeMinutes)} на{' '}
            {pluralize(summary.overtimeDays, DAY_FORMS)}
          </AppText>
        ) : null}
        {summary.adjustedDays > 0 ? (
          <AppText variant="caption" tone="muted">
            Изменено вручную: {pluralize(summary.adjustedDays, DAY_FORMS)}
          </AppText>
        ) : null}
      </Card>

      <Card title="Деньги за месяц">
        {summary.payments.length > 0 ? (
          <>
            <MoneyRow label="Итого" value={formatMoney(summary.totalPaid, currency)} emphasis />
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

        <Button
          title="Деньги по месяцам"
          onPress={onOpenYear}
          accessibilityHint="Открывает суммы за все месяцы года"
        />
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
