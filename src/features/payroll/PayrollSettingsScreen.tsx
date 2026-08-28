import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { todayIso } from '@/domain/date.ts';
import { formatDayShort, formatMonthTitle } from '@/domain/format.ts';
import { expectedPaymentDate, periodOf } from '@/domain/payday.ts';
import type { PaymentKind, PaymentRule } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Card, ChoiceGroup, TextField, Toggle } from '@/ui';
import { useTheme } from '@/theme';

const KIND_TITLES: Record<PaymentKind, string> = {
  advance: 'Аванс',
  salary: 'Зарплата',
};

const OFFSET_CHOICES = [
  { value: '-1', label: 'В предыдущем месяце', hint: 'Аванс за сентябрь приходит в конце августа' },
  { value: '0', label: 'В том же месяце' },
  { value: '1', label: 'В следующем месяце', hint: 'Зарплата за сентябрь приходит в октябре' },
];

const WEEKEND_CHOICES = [
  { value: 'before', label: 'Раньше, в пятницу' },
  { value: 'after', label: 'Позже, в понедельник' },
  { value: 'none', label: 'Не сдвигать' },
];

export function PayrollSettingsScreen() {
  const theme = useTheme();
  const payroll = useAppStore((state) => state.payroll);
  const setPayroll = useAppStore((state) => state.setPayroll);

  const today = useMemo(() => todayIso(), []);
  const period = periodOf(today);

  const updateRule = (kind: PaymentKind, patch: Partial<PaymentRule>) => {
    setPayroll({
      ...payroll,
      rules: payroll.rules.map((rule) => (rule.kind === kind ? { ...rule, ...patch } : rule)),
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      {payroll.rules.map((rule) => (
        <Card key={rule.kind} title={KIND_TITLES[rule.kind]}>
          <TextField
            label="День месяца"
            value={String(rule.dayOfMonth)}
            onChangeText={(text) => {
              const day = Number(text.replace(/\D/g, ''));
              // 31-е в коротком месяце домен сам сдвинет на последний день,
              // поэтому здесь достаточно ограничить ввод диапазоном.
              if (day >= 1 && day <= 31) updateRule(rule.kind, { dayOfMonth: day });
            }}
            keyboardType="number-pad"
          />

          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="label" tone="muted">
              Когда приходит
            </AppText>
            <ChoiceGroup
              label={`Когда приходит: ${KIND_TITLES[rule.kind].toLowerCase()}`}
              choices={OFFSET_CHOICES}
              value={String(rule.paidInMonthOffset)}
              onChange={(value) =>
                updateRule(rule.kind, { paidInMonthOffset: Number(value) as -1 | 0 | 1 })
              }
            />
          </View>

          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="label" tone="muted">
              Если выпало на выходной
            </AppText>
            <ChoiceGroup
              label={`Если выпало на выходной: ${KIND_TITLES[rule.kind].toLowerCase()}`}
              choices={WEEKEND_CHOICES}
              value={rule.weekendShift}
              onChange={(value) =>
                updateRule(rule.kind, { weekendShift: value as PaymentRule['weekendShift'] })
              }
            />
          </View>

          {/* Предпросмотр обязателен: без него смысл поля «когда приходит»
              на словах не считывается. */}
          <AppText variant="caption" tone="muted">
            {KIND_TITLES[rule.kind]} за{' '}
            {formatMonthTitle(Number(period.slice(0, 4)), Number(period.slice(5, 7))).toLowerCase()}{' '}
            придёт {formatDayShort(expectedPaymentDate(rule, period))}
          </AppText>
        </Card>
      ))}

      <Card title="Прочее">
        <TextField
          label="Знак валюты"
          value={payroll.currency}
          onChangeText={(currency) => setPayroll({ ...payroll, currency })}
        />
        <Toggle
          label="Прогноз для незакрытого месяца"
          hint="Считает по ставке последнего месяца, где есть и часы, и выплаты"
          value={payroll.forecastFromLastClosedMonth}
          onValueChange={(value) => setPayroll({ ...payroll, forecastFromLastClosedMonth: value })}
        />
      </Card>
    </ScrollView>
  );
}
