import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import type { IsoDate } from '@/domain/date.ts';
import { formatMoney, parseAmount } from '@/domain/format.ts';
import { formatMonthTitle } from '@/domain/format.ts';
import { inferPaymentPeriod, shiftPeriod } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import type { PaymentKind } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ChoiceGroup, IconButton, TextField } from '@/ui';
import { useTheme } from '@/theme';

const KIND_CHOICES = [
  { value: 'advance' as const, label: 'Аванс' },
  { value: 'salary' as const, label: 'Зарплата' },
];

const KIND_LABELS: Record<PaymentKind, string> = { advance: 'Аванс', salary: 'Зарплата' };

/**
 * Ввод и просмотр выплат, пришедших в этот день.
 *
 * Живёт в карточке дня, а не на отдельном экране: дата поступления — это и есть
 * день, по которому ты сюда попал, и переспрашивать её незачем.
 */
export function DayPaymentSection({ date }: { date: IsoDate }) {
  const theme = useTheme();
  const payroll = useAppStore((state) => state.payroll);
  const payments = useAppStore((state) => state.payments);
  const addPayment = useAppStore((state) => state.addPayment);
  const removePayment = useAppStore((state) => state.removePayment);

  const [kind, setKind] = useState<PaymentKind>('salary');
  const [amountText, setAmountText] = useState('');
  const [periodOverride, setPeriodOverride] = useState<Period | null>(null);

  const dayPayments = useMemo(
    () => payments.filter((payment) => payment.receivedOn === date),
    [payments, date],
  );

  /** Месяц подставляется из правила выплат, но остаётся правимым. */
  const inferredPeriod = useMemo(() => {
    const rule = payroll.rules.find((item) => item.kind === kind);
    return rule ? inferPaymentPeriod(rule, date) : date.slice(0, 7);
  }, [payroll.rules, kind, date]);

  const period = periodOverride ?? inferredPeriod;
  const amount = parseAmount(amountText);
  const canSave = amount !== null && amount > 0;

  const confirmRemove = (id: string, label: string) => {
    Alert.alert('Удалить выплату?', label, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => removePayment(id) },
    ]);
  };

  return (
    <Card title="Выплата в этот день">
      {dayPayments.map((payment) => (
        <View
          key={payment.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
        >
          <AppText
            variant="body"
            style={{ flex: 1 }}
            accessibilityLabel={`${KIND_LABELS[payment.kind]} ${formatMoney(payment.amount, payroll.currency)} за ${formatMonthTitle(Number(payment.period.slice(0, 4)), Number(payment.period.slice(5, 7)))}`}
          >
            {KIND_LABELS[payment.kind]} · {formatMoney(payment.amount, payroll.currency)}
          </AppText>
          <IconButton
            name="trash-outline"
            label={`Удалить: ${KIND_LABELS[payment.kind]} ${formatMoney(payment.amount, payroll.currency)}`}
            onPress={() =>
              confirmRemove(
                payment.id,
                `${KIND_LABELS[payment.kind]} ${formatMoney(payment.amount, payroll.currency)}`,
              )
            }
          />
        </View>
      ))}

      <ChoiceGroup label="Тип выплаты" choices={KIND_CHOICES} value={kind} onChange={setKind} />

      <TextField
        label={`Сумма, ${payroll.currency}`}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="30 000"
        hint={
          amountText.length > 0 && amount === null ? 'Только цифры, пробелы между разрядами можно' : undefined
        }
      />

      <View style={{ gap: theme.spacing.xs }}>
        <AppText variant="label" tone="muted">
          За какой месяц
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            name="chevron-back"
            label="Предыдущий месяц"
            onPress={() => setPeriodOverride(shiftPeriod(period, -1))}
          />
          <AppText variant="body" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }}>
            {formatMonthTitle(Number(period.slice(0, 4)), Number(period.slice(5, 7)))}
          </AppText>
          <IconButton
            name="chevron-forward"
            label="Следующий месяц"
            onPress={() => setPeriodOverride(shiftPeriod(period, 1))}
          />
        </View>
        {/* Месяц, ЗА который платят, и день поступления — разные вещи.
            Подставленное значение приходит из правила выплат. */}
        <AppText variant="caption" tone="muted">
          Это месяц, за который платят, а не когда пришло. Подставлен по правилу выплат.
        </AppText>
      </View>

      <Button
        title="Записать выплату"
        variant="primary"
        disabled={!canSave}
        accessibilityHint={canSave ? undefined : 'Введи сумму'}
        onPress={() => {
          if (amount === null) return;
          addPayment({ kind, period, receivedOn: date, amount });
          setAmountText('');
          setPeriodOverride(null);
        }}
      />
    </Card>
  );
}
