import { Alert, View } from 'react-native';
import { formatMoney, formatRussianDate } from '@/domain/format.ts';
import type { PaymentRecord } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, IconButton } from '@/ui';
import { useTheme } from '@/theme';

const KIND_LABELS: Record<PaymentRecord['kind'], string> = {
  advance: 'Аванс',
  salary: 'Зарплата',
};

export function PaymentList({
  payments,
  currency,
}: {
  payments: PaymentRecord[];
  currency: string;
}) {
  const theme = useTheme();
  const removePayment = useAppStore((state) => state.removePayment);

  if (payments.length === 0) return null;

  const confirmRemove = (payment: PaymentRecord) => {
    // Удаление выплаты меняет ставку за час задним числом, поэтому спрашиваем.
    Alert.alert(
      'Удалить выплату?',
      `${KIND_LABELS[payment.kind]} ${formatMoney(payment.amount, currency)} от ${formatRussianDate(payment.receivedOn)}`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => removePayment(payment.id) },
      ],
    );
  };

  return (
    <View accessibilityRole="list" accessibilityLabel="Выплаты за месяц" style={{ gap: theme.spacing.xs }}>
      {payments.map((payment) => (
        <View
          key={payment.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
        >
          <View
            accessibilityRole="text"
            accessibilityLabel={`${KIND_LABELS[payment.kind]}, ${formatMoney(payment.amount, currency)}, получено ${formatRussianDate(payment.receivedOn)}${payment.note ? `, ${payment.note}` : ''}`}
            style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}
          >
            <View importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>
              <AppText variant="body">{KIND_LABELS[payment.kind]}</AppText>
              <AppText variant="caption" tone="muted">
                {formatRussianDate(payment.receivedOn)}
                {payment.note ? ` · ${payment.note}` : ''}
              </AppText>
            </View>
            <AppText variant="body" importantForAccessibility="no">
              {formatMoney(payment.amount, currency)}
            </AppText>
          </View>
          <IconButton
            name="trash-outline"
            label={`Удалить выплату: ${KIND_LABELS[payment.kind]} ${formatMoney(payment.amount, currency)}`}
            onPress={() => confirmRemove(payment)}
          />
        </View>
      ))}
    </View>
  );
}
