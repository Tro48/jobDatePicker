import { useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { formatMonthName, formatMonthTitle } from '@/domain/format.ts';
import { FIRST_PERIOD, LAST_PERIOD, monthRefOf, periodFrom } from '@/domain/months.ts';
import type { Period } from '@/domain/payday.ts';
import { AppText, Button, Select, useReduceMotion } from '@/ui';
import type { SelectOption } from '@/ui';
import { useTheme } from '@/theme';

export interface MonthPickerProps {
  /** Открытый сейчас месяц. */
  period: Period;
  /** Выбран другой месяц. Закрывать окно — дело вызывающего. */
  onPick: (period: Period) => void;
  onClose: () => void;
}

/** Месяцы списком: значение — те же две цифры, что стоят в периоде. */
const MONTH_OPTIONS: SelectOption[] = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: formatMonthName(index + 1),
}));

/**
 * Годы списком.
 *
 * Не от сегодняшнего года и не от окна листания: и то и другое решало бы за
 * человека, как далеко ему можно смотреть. Список идёт по всем годам, которые
 * приложение вообще берётся показывать, и открывается на выбранном.
 */
const YEAR_OPTIONS: SelectOption[] = (() => {
  const first = monthRefOf(FIRST_PERIOD).year;
  const last = monthRefOf(LAST_PERIOD).year;
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    value: String(first + index),
    label: String(first + index),
  }));
})();

/**
 * Выбор месяца и года.
 *
 * Листание стрелками отвечает на «а что в следующем месяце», но до августа
 * прошлого года ими идти тринадцать нажатий. Здесь месяц и год берут порознь,
 * каждый своим списком, — и открытый месяц меняется одним нажатием.
 *
 * Выбранное в списках — черновик: экран переезжает на «Открыть». Иначе на
 * каждое движение по годам он пересчитывал бы смены месяца, которого никто не
 * просил, а по пути из сентября 2026-го в март 2028-го таких месяцев два.
 */
export function MonthPicker({ period, onPick, onClose }: MonthPickerProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();

  const current = monthRefOf(period);
  const [month, setMonth] = useState(period.slice(5, 7));
  const [year, setYear] = useState(String(current.year));

  const chosen = useMemo(() => periodFrom(Number(year), Number(month)), [year, month]);

  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть выбор месяца"
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000099' }}
      >
        {/* Нажатие внутри окна его не закрывает. */}
        <Pressable
          onPress={() => undefined}
          style={{
            gap: theme.spacing.md,
            padding: theme.spacing.lg,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
          }}
        >
          <AppText variant="heading" accessibilityRole="header">
            Какой месяц открыть
          </AppText>

          {/* Два списка в строку: месяц и год — части одного ответа, и стоять
              они должны рядом, а не друг под другом. */}
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Select label="Месяц" value={month} options={MONTH_OPTIONS} onChange={setMonth} />
            <Select label="Год" value={year} options={YEAR_OPTIONS} onChange={setYear} />
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button
              title="Открыть"
              variant="primary"
              // Подпись короткая, а нажимают её после двух списков: вслух
              // должно звучать, какой именно месяц откроется.
              accessibilityLabel={`Открыть ${formatMonthTitle(Number(year), Number(month))}`}
              onPress={() => onPick(chosen)}
              style={{ flex: 1 }}
            />
            <Button title="Отмена" onPress={onClose} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
