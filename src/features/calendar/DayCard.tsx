import type { ComponentProps } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { describeBaseDay, describeDay } from '@/domain/describe.ts';
import { overtimeMinutes, shiftDurationMinutes } from '@/domain/engine.ts';
import { formatDayLong, formatDuration, formatMoney, formatTimeRange } from '@/domain/format.ts';
import { PAYMENT_KIND_LABELS } from '@/domain/payments.ts';
import type { DayNote, PaymentRecord, ResolvedDay } from '@/domain/types.ts';
import { AppText, IconButton } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';
import { PAYMENT_ICON } from './DayCell.tsx';

export interface DayCardProps {
  day: ResolvedDay;
  /** Выбран сегодняшний день: карточка говорит об этом словом, а не цветом. */
  isToday: boolean;
  notes: DayNote[];
  /** Выплаты этого дня по открытой работе. У чужого графика их не бывает. */
  payments: PaymentRecord[];
  currency: string;
  onEdit: () => void;
  onNotes: () => void;
}

/**
 * Неразрывный пробел вместо пустой строки.
 *
 * Строка без текста схлопывается в ноль высоты, и место, отведённое под
 * подробности, пропадает вместе с ней. Пробел держит ровно ту же высоту, что и
 * настоящий текст, при любом системном шрифте — считать её в пунктах не
 * приходится.
 */
const BLANK = '\u00A0';

/**
 * Карточка выбранного дня над календарём.
 *
 * Отвечает на главный вопрос к приложению — «что у меня в этот день» — без
 * открытия чего-либо: нажатие на клетку только переносит на неё выбор, а всё,
 * что о дне известно, показывает эта карточка.
 *
 * Высота у неё постоянная: четыре строки, и каждая ровно в одну строку.
 * Карточка стоит прямо над сеткой, и день с выплатой иначе сдвигал бы календарь
 * вниз — при том, что выбор дня меняется нажатием, то есть по десять раз
 * подряд. Место под подробности отведено всегда, а пустое оно или занятое —
 * видно по содержимому, а не по прыжку сетки.
 *
 * Поэтому же подробности склеены в одну строку, а не разложены по своим, а
 * текста заметок здесь нет вовсе: заметка бывает в десять строк, и в карточке
 * от неё осталось бы обрезанное начало. Вместо текста — счётчик на кнопке,
 * которая их открывает.
 */
export function DayCard({
  day,
  isToday,
  notes,
  payments,
  currency,
  onEdit,
  onNotes,
}: DayCardProps) {
  const theme = useTheme();
  const colors = useShiftColors(day.shiftType);
  const time = day.shiftType.time;
  const planned = shiftDurationMinutes(day.shiftType);
  const overtime = overtimeMinutes(day);

  /**
   * День раньше первого графика: смены у него нет вовсе.
   *
   * Заглушка-выходной, которой его заполняет движок, здесь не показывается:
   * назвать вторник выходным значило бы соврать — ровно как в клетке
   * календаря, которая в такие дни рисует базовый календарь без буквы смены.
   */
  const planless = day.source === 'none';

  // Время смены показывается, только когда часы не правлены руками, иначе
  // строка спорит сама с собой: «08:00 – 20:00 · 4 ч».
  const hours =
    !planless && day.shiftType.kind === 'work'
      ? [
          time && day.workedMinutes === planned ? formatTimeRange(time.start, time.end) : null,
          formatDuration(day.workedMinutes),
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  /**
   * Подробности дня одной строкой: часы, отклонение от графика, праздник.
   *
   * Порядок — по тому, что чаще нужно: у обрезанной строки первым виден самый
   * нужный конец. Отклонение цветом не выделяется: на цветной заливке смены ни
   * зелёный, ни красный проверенного контраста не дают, а слово говорит то же
   * самое.
   */
  const details =
    [
      hours,
      planless || overtime === 0
        ? null
        : `${overtime > 0 ? 'Переработка' : 'Недоработка'} ${formatDuration(Math.abs(overtime))}`,
      day.holiday,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  const money =
    payments.length > 0
      ? payments
          .map(
            (payment) =>
              `${PAYMENT_KIND_LABELS[payment.kind]} ${formatMoney(payment.amount, currency)}`,
          )
          .join(' · ')
      : null;

  // Карточка читается скринридером как один элемент: разрозненные «Сегодня»,
  // «Дневная», «11 ч» превращаются в набор обрывков. Кнопки в эту склейку не
  // входят — они рядом, своими элементами.
  const spoken = [
    isToday ? 'Сегодня' : null,
    planless
      ? [
          describeBaseDay(day.date, { holiday: day.holiday }),
          money !== null ? 'есть выплата' : null,
        ]
          .filter(Boolean)
          .join(', ')
      : describeDay(day, { hasPayment: money !== null }),
    money,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        backgroundColor: colors.surface,
        borderRadius: theme.radius.lg,
        paddingLeft: theme.spacing.md,
        paddingRight: theme.spacing.xs,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View
        accessibilityRole="summary"
        accessibilityLabel={spoken}
        accessibilityLiveRegion="polite"
        style={{ flex: 1 }}
      >
        <View importantForAccessibility="no-hide-descendants" style={{ gap: 2 }}>
          <CardLine
            text={isToday ? `Сегодня · ${formatDayLong(day.date)}` : formatDayLong(day.date)}
            color={colors.on}
          />
          {/* Название смены — в одну строку, как и всё остальное: своя смена
              может называться «Ночная на складе с доплатой», и на второй строке
              карточка снова начала бы прыгать. */}
          <AppText variant="heading" color={colors.on} numberOfLines={1}>
            {planless ? 'Графика ещё нет' : day.shiftType.name}
          </AppText>
          <CardLine text={details} color={colors.on} />
          <CardLine icon={PAYMENT_ICON} text={money} color={colors.on} />
        </View>
      </View>

      <IconButton
        name="create-outline"
        label="Изменить день"
        accessibilityHint="Смена, часы и выплата этого дня"
        color={colors.on}
        onPress={onEdit}
      />
      <IconButton
        name="document-text-outline"
        label={notes.length > 0 ? `Заметки: ${notes.length}` : 'Добавить заметку'}
        accessibilityHint="Список заметок этого дня"
        color={colors.on}
        // Сколько заметок у дня, видно по счётчику на самой кнопке: текст
        // заметки в карточку не помещается, а число — вопрос «есть ли там
        // что-нибудь» — помещается.
        badge={notes.length}
        onPress={onNotes}
      />
    </View>
  );
}

/**
 * Одна строка подробностей: значок, текст и место, которое остаётся за строкой
 * даже когда сказать нечего.
 *
 * Значок — тот же, что стоит в углу клетки календаря: увидев там купюру,
 * человек находит её же в карточке и рядом сумму. Без текста значок не
 * рисуется — сам по себе он ничего не сообщает. Скринридеру строка не видна:
 * всё, что нужно, уже сказано в озвучке карточки целиком.
 */
function CardLine({
  icon,
  text,
  color,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** Нечего сказать — строка всё равно занимает своё место. */
  text: string | null | undefined;
  color: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      {icon && text ? (
        <Ionicons name={icon} size={12} color={color} importantForAccessibility="no" />
      ) : null}
      <AppText variant="caption" color={color} numberOfLines={1} style={{ flex: 1 }}>
        {text ?? BLANK}
      </AppText>
    </View>
  );
}
