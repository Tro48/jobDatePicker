import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import type { IsoDate } from '@/domain/date.ts';
import { formatMonthTitle, formatMoney, parseAmount } from '@/domain/format.ts';
import { inferPaymentPeriod, periodOf, shiftPeriod } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import { PAYMENT_KINDS, PAYMENT_KIND_LABELS, isCompensationPayment } from '@/domain/payments.ts';
import type { PaymentKind } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, IconButton, Select, TextField } from '@/ui';
import { useTheme } from '@/theme';

const KIND_OPTIONS = PAYMENT_KINDS.map((kind) => ({
  value: kind,
  label: PAYMENT_KIND_LABELS[kind],
}));

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

  /**
   * Месяц подставляется из правила выплат. У отпускных и больничного правила
   * нет — берётся месяц поступления, дальше пользователь правит стрелками.
   */
  const inferredPeriod = useMemo(() => {
    if (isCompensationPayment(kind)) return periodOf(date);
    const rule = payroll.rules.find((item) => item.kind === kind);
    return rule ? inferPaymentPeriod(rule, date) : periodOf(date);
  }, [payroll.rules, kind, date]);

  const period = periodOverride ?? inferredPeriod;
  const amount = parseAmount(amountText);
  const canSave = amount !== null && amount > 0;

  const describe = (paymentKind: PaymentKind, value: number) =>
    `${PAYMENT_KIND_LABELS[paymentKind]} ${formatMoney(value, payroll.currency)}`;

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
            accessibilityLabel={`${describe(payment.kind, payment.amount)} за ${formatMonthTitle(Number(payment.period.slice(0, 4)), Number(payment.period.slice(5, 7)))}`}
          >
            {PAYMENT_KIND_LABELS[payment.kind]} · {formatMoney(payment.amount, payroll.currency)}
          </AppText>
          <IconButton
            name="trash-outline"
            label={`Удалить: ${describe(payment.kind, payment.amount)}`}
            onPress={() =>
              // Удаление меняет ставку за час задним числом, поэтому спрашиваем.
              Alert.alert('Удалить выплату?', describe(payment.kind, payment.amount), [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Удалить',
                  style: 'destructive',
                  onPress: () => removePayment(payment.id),
                },
              ])
            }
          />
        </View>
      ))}

      <Select
        label="Тип выплаты"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          // Месяц у каждого типа выводится по-своему — сбрасываем ручную правку,
          // иначе после смены типа остаётся месяц от предыдущего правила.
          setPeriodOverride(null);
        }}
      />

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
        {/* Месяц, ЗА который платят, и день поступления — разные вещи. */}
        <AppText variant="caption" tone="muted">
          {isCompensationPayment(kind)
            ? 'Это месяц, к которому отнести выплату в сводке. Подставлен месяц поступления.'
            : 'Это месяц, за который платят, а не когда пришло. Подставлен по правилу выплат.'}
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
