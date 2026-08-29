import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { formatMonthName, formatMoney, pluralize } from '@/domain/format.ts';
import { yearlyPaymentTotals } from '@/domain/summary.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { PaymentRecord } from '@/domain/types.ts';
import { AppText, Card } from '@/ui';
import { useTheme } from '@/theme';

const MONTH_FORMS = ['месяц', 'месяца', 'месяцев'] as const;

export interface YearMoneyPageProps {
  year: number;
  payments: PaymentRecord[];
  currency: string;
  today: IsoDate;
  /** Ширина страницы пейджера: годы листаются вбок. */
  width: number;
}

/**
 * Деньги одного года — страница листалки.
 *
 * Считается по выплатам, а не по графику: месяц выплаты — тот, ЗА который она
 * пришла. Поэтому страница работает и без выбранного графика смен.
 */
export function YearMoneyPage({ year, payments, currency, today, width }: YearMoneyPageProps) {
  const theme = useTheme();

  const months = useMemo(() => yearlyPaymentTotals(payments, year), [payments, year]);

  const total = months.reduce((sum, item) => sum + item.total, 0);
  const paidMonths = months.filter((item) => item.total > 0);
  const maximum = Math.max(...months.map((item) => item.total));
  const currentPeriod = today.slice(0, 7);

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
    >
      <Card title="Итого за год">
        {total > 0 ? (
          <>
            <AppText variant="display">{formatMoney(total, currency)}</AppText>
            <AppText variant="body" tone="muted">
              Выплаты внесены за {pluralize(paidMonths.length, MONTH_FORMS)}, в среднем{' '}
              {formatMoney(total / paidMonths.length, currency)} в месяц
            </AppText>
          </>
        ) : (
          <AppText variant="body" tone="muted">
            За {year} год выплат не внесено. Суммы вносятся в карточке дня, в который пришли
            деньги.
          </AppText>
        )}
      </Card>

      <Card title="По месяцам">
        <View accessibilityRole="list" style={{ gap: theme.spacing.md }}>
          {months.map((item) => {
            const isCurrent = item.period === currentPeriod;
            const value = item.total > 0 ? formatMoney(item.total, currency) : '—';
            const extra =
              item.compensation > 0
                ? `, из них отпускные и больничные ${formatMoney(item.compensation, currency)}`
                : '';

            return (
              <View
                key={item.period}
                accessibilityRole="text"
                accessibilityLabel={`${formatMonthName(item.month)}: ${item.total > 0 ? value : 'выплат нет'}${extra}${isCurrent ? ', текущий месяц' : ''}`}
                style={{ gap: theme.spacing.xs }}
              >
                <View
                  importantForAccessibility="no-hide-descendants"
                  style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
                >
                  {/* Текущий месяц помечен словом, а не только цветом полосы. */}
                  <AppText variant="body" style={{ fontWeight: isCurrent ? '700' : '400', flexShrink: 1 }}>
                    {formatMonthName(item.month)}
                    {isCurrent ? ' · сейчас' : ''}
                  </AppText>
                  <AppText variant="body" tone={item.total > 0 ? 'default' : 'muted'}>
                    {value}
                  </AppText>
                </View>

                {/* Полоса — только картинка: то же число уже сказано текстом. */}
                <View
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: theme.colors.surfaceElevated,
                    overflow: 'hidden',
                  }}
                >
                  {maximum > 0 && item.total > 0 ? (
                    <View
                      style={{
                        width: `${Math.max(2, (item.total / maximum) * 100)}%`,
                        height: '100%',
                        borderRadius: 5,
                        backgroundColor: theme.colors.accent,
                      }}
                    />
                  ) : null}
                </View>

                {item.compensation > 0 ? (
                  <AppText variant="caption" tone="muted" importantForAccessibility="no">
                    из них отпускные и больничные {formatMoney(item.compensation, currency)}
                  </AppText>
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      <Card title="Что здесь считается">
        <AppText variant="body" tone="muted">
          Месяц выплаты — тот, ЗА который она пришла, а не дата поступления: аванс за
          сентябрь остаётся сентябрьским, даже если пришёл 27 августа.
        </AppText>
      </Card>
    </ScrollView>
  );
}
