import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { todayIso } from '@/domain/date.ts';
import {
  formatMonthTitle,
  formatRussianDate,
  parseAmount,
  parseRussianDate,
} from '@/domain/format.ts';
import { expectedPaymentDate, periodOf, shiftPeriod } from '@/domain/payday.ts';
import type { Period } from '@/domain/payday.ts';
import type { PaymentKind } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ChoiceGroup, IconButton, TextField } from '@/ui';
import { useTheme } from '@/theme';

const KIND_CHOICES = [
  { value: 'advance' as const, label: 'Аванс' },
  { value: 'salary' as const, label: 'Зарплата' },
];

export function PaymentFormScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ period?: string }>();

  const payroll = useAppStore((state) => state.payroll);
  const addPayment = useAppStore((state) => state.addPayment);

  const today = useMemo(() => todayIso(), []);
  const [kind, setKind] = useState<PaymentKind>('salary');
  const [period, setPeriod] = useState<Period>(params.period ?? periodOf(today));
  const [dateText, setDateText] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');

  /**
   * Дата поступления по правилу выплат — только подсказка. Если пользователь
   * ничего не ввёл, берём ожидаемую дату; введённое всегда важнее.
   */
  const suggestedDate = useMemo(() => {
    const rule = payroll.rules.find((item) => item.kind === kind);
    return rule ? expectedPaymentDate(rule, period) : today;
  }, [payroll.rules, kind, period, today]);

  const effectiveDateText = dateText || formatRussianDate(suggestedDate);
  const parsedDate = parseRussianDate(effectiveDateText);
  const parsedAmount = parseAmount(amountText);
  const canSave = parsedDate !== null && parsedAmount !== null && parsedAmount > 0;

  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <AppText variant="display" accessibilityRole="header" style={{ marginBottom: theme.spacing.lg }}>
        Выплата
      </AppText>

      <Card title="Что за выплата">
        <ChoiceGroup label="Тип выплаты" choices={KIND_CHOICES} value={kind} onChange={setKind} />
      </Card>

      <Card title="За какой месяц">
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            name="chevron-back"
            label="Предыдущий месяц"
            onPress={() => setPeriod((value) => shiftPeriod(value, -1))}
          />
          <AppText variant="heading" accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: 'center' }}>
            {formatMonthTitle(year, month)}
          </AppText>
          <IconButton
            name="chevron-forward"
            label="Следующий месяц"
            onPress={() => setPeriod((value) => shiftPeriod(value, 1))}
          />
        </View>
        {/* Ключевое место всей денежной части: месяц выплаты и месяц, за который
            платят, — разные вещи, и путать их нельзя. */}
        <AppText variant="caption" tone="muted">
          Это месяц, ЗА который платят, а не когда деньги пришли. Аванс за сентябрь остаётся
          сентябрьским, даже если пришёл в конце августа.
        </AppText>
      </Card>

      <Card title="Когда пришли">
        <TextField
          label="Дата поступления"
          value={effectiveDateText}
          onChangeText={setDateText}
          keyboardType="numbers-and-punctuation"
          placeholder="ДД.ММ.ГГГГ"
          hint={parsedDate === null ? 'Не похоже на дату. Нужен вид 27.08.2026' : undefined}
        />
      </Card>

      <Card title="Сколько">
        <TextField
          label={`Сумма, ${payroll.currency}`}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="30 000"
          hint={
            amountText.length > 0 && parsedAmount === null
              ? 'Только цифры. Пробелы между разрядами можно'
              : undefined
          }
        />
        <TextField label="Заметка" value={note} onChangeText={setNote} placeholder="необязательно" />
      </Card>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          title="Сохранить"
          variant="primary"
          disabled={!canSave}
          accessibilityHint={canSave ? undefined : 'Заполни дату и сумму'}
          onPress={() => {
            if (parsedDate === null || parsedAmount === null) return;
            addPayment({
              kind,
              period,
              receivedOn: parsedDate,
              amount: parsedAmount,
              note: note.trim() || undefined,
            });
            router.back();
          }}
        />
        <Button title="Отмена" onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}
