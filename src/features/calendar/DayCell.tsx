import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { describeDay } from '@/domain/describe.ts';
import { overtimeMinutes } from '@/domain/engine.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { ResolvedDay } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';

export interface DayCellProps {
  day: ResolvedDay;
  size: number;
  /** false — день соседнего месяца: показывается приглушённо, но остаётся нажимаемым. */
  inMonth: boolean;
  isToday: boolean;
  /** Смена этого дня уже позади: заливка уходит в серый. */
  isWorked: boolean;
  /** На календаре сейчас кого-то выделяют: значит, невыделенные дни гаснут. */
  highlighting?: boolean;
  /**
   * День не попал в выделенный список совпадений: гаснет, чтобы попавшие были
   * видны. Приглушается заливка, подпись остаётся — прозрачность уронила бы
   * контраст ниже проверенного порога.
   */
  dimmed?: boolean;
  isSelected: boolean;
  onPress: (date: IsoDate) => void;
}

/**
 * Клетка календаря.
 *
 * Смысл дня передаётся тремя способами сразу: заливкой, буквой-маркером и
 * полной озвучкой. Одной заливки недостаточно — она не читается ни при
 * дальтонизме, ни скринридером.
 */
function DayCellView({
  day,
  size,
  inMonth,
  isToday,
  isWorked,
  highlighting = false,
  dimmed = false,
  isSelected,
  onPress,
}: DayCellProps) {
  const theme = useTheme();
  const shiftColors = useShiftColors(day.shiftType.colorToken, { faded: isWorked || dimmed });
  const [focused, setFocused] = useState(false);

  // Выделен — значит, выделение вообще включено и этот день в списке.
  const highlighted = !dimmed && inMonth && highlighting;

  /**
   * Дни соседних месяцев не приглушаются прозрачностью: она уронила бы контраст
   * ниже проверенного порога. Вместо этого они теряют заливку и уходят в
   * приглушённый цвет текста, который проверен на фоне страницы.
   *
   * Выделенный день берёт свою заливку вместо сменной: одного лишь угасания
   * остальных мало — глазу нужно, за что зацепиться, а не откуда уйти. Смысл
   * дня при этом остаётся на букве-маркере.
   */
  const colors = !inMonth
    ? { surface: theme.colors.background, on: theme.colors.textMuted }
    : highlighted
      ? theme.colors.highlight
      : shiftColors;

  const dayNumber = Number(day.date.slice(8, 10));
  const outlined = focused || isSelected || (isToday && inMonth);

  /**
   * Отклонение факта от графика. В клетке от него остаётся только цветная
   * точка: часы в углу — это третье число на сорока шести пунктах, и они
   * спорят с самим числом дня. Сколько именно вышло — говорит карточка дня и
   * озвучка клетки.
   */
  const overtime = overtimeMinutes(day);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        inMonth
          ? describeDay(day, { isToday, isWorked, isShared: highlighted })
          : `${describeDay(day, { isWorked })}, соседний месяц`
      }
      accessibilityState={{ selected: isSelected }}
      onPress={() => onPress(day.date)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.sm,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: outlined ? theme.focusRingWidth : 1,
        borderColor: focused
          ? theme.colors.focus
          : isSelected
            ? theme.colors.accent
            : isToday && inMonth
              ? colors.on
              : 'transparent',
      }}
    >
      {/* Содержимое скрыто от озвучки: клетка уже прочитана целиком по accessibilityLabel. */}
      <View importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
        <AppText
          variant="label"
          color={colors.on}
          numberOfLines={1}
          // Единственное место с ограничением масштаба шрифта: клетка сетки не
          // может расти, иначе месяц не поместится на экран. Полные данные дня
          // доступны в карточке дня и через скринридер.
          maxFontSizeMultiplier={1.3}
          style={{ fontWeight: isToday && inMonth ? '800' : '600' }}
        >
          {dayNumber}
        </AppText>
        <AppText variant="badge" color={colors.on} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {day.shiftType.badge}
        </AppText>
      </View>

      {/* Точка отмечает расхождение с графиком, а не саму правку: правок за
          отпуск набирается две недели подряд, и точка на каждой клетке ничего
          не выделяла. Зелёная — переработка, красная — недоработка. */}
      {overtime !== 0 ? (
        <View
          importantForAccessibility="no"
          style={{
            position: 'absolute',
            top: 3,
            right: 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: overtime > 0 ? theme.colors.positive : theme.colors.danger,
          }}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Разложенный день сравнивается по значению, а не по ссылке.
 *
 * `resolveDay` собирает новый объект на каждый пересчёт сетки, поэтому по
 * ссылке он не совпадает никогда — а по значению совпадает часто. При смене
 * графика половина месяца обычно остаётся при своём: выходной остался
 * выходным, смена той же длины на том же месте. Такие клетки перерисовывать
 * незачем, а их на трёх страницах пейджера больше сотни.
 *
 * Тип смены сверяется по ссылке намеренно: справочник задан кодом и живёт в
 * одном экземпляре.
 */
function sameDay(a: ResolvedDay, b: ResolvedDay): boolean {
  return (
    a.date === b.date &&
    a.shiftType === b.shiftType &&
    a.source === b.source &&
    a.workedMinutes === b.workedMinutes &&
    a.plannedMinutes === b.plannedMinutes &&
    a.note === b.note
  );
}

/**
 * Клетка мемоизирована: их на странице сорок с лишним, и каждая — Pressable со
 * своим состоянием фокуса, то есть далеко не бесплатная.
 */
export const DayCell = memo(
  DayCellView,
  (before, after) =>
    sameDay(before.day, after.day) &&
    before.size === after.size &&
    before.inMonth === after.inMonth &&
    before.isToday === after.isToday &&
    before.isWorked === after.isWorked &&
    before.highlighting === after.highlighting &&
    before.dimmed === after.dimmed &&
    before.isSelected === after.isSelected &&
    before.onPress === after.onPress,
);
