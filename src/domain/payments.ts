import type { CompensationPaymentKind, PaymentKind, ScheduledPaymentKind } from './types.ts';

/**
 * Справочник видов выплат в одном месте: названия нужны и в карточке дня, и в
 * сводке, и в настройках, а расходиться они не должны.
 */
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  advance: 'Аванс',
  salary: 'Зарплата',
  vacationPay: 'Отпускные',
  sickPay: 'Больничный',
};

/** Порядок вывода: сначала регулярные выплаты, потом разовые. */
export const SCHEDULED_PAYMENT_KINDS: ScheduledPaymentKind[] = ['advance', 'salary'];
export const COMPENSATION_PAYMENT_KINDS: CompensationPaymentKind[] = ['vacationPay', 'sickPay'];
export const PAYMENT_KINDS: PaymentKind[] = [
  ...SCHEDULED_PAYMENT_KINDS,
  ...COMPENSATION_PAYMENT_KINDS,
];

/**
 * Отпускные и больничный — деньги, не заработанные часами этого месяца.
 * В сумму за месяц они входят, а в ставку за час и за смену — нет: иначе
 * месяц с отпуском показал бы ставку вдвое выше настоящей.
 */
export function isCompensationPayment(kind: PaymentKind): kind is CompensationPaymentKind {
  return kind === 'vacationPay' || kind === 'sickPay';
}
