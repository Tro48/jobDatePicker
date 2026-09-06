import { memo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { describeDay } from '@/domain/describe.ts';
import { overtimeMinutes } from '@/domain/engine.ts';
import type { IsoDate } from '@/domain/date.ts';
import type { ResolvedDay } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useTheme, useShiftColors } from '@/theme';
import { CELL_FONT_SCALE_CAP } from './gridMetrics.ts';

/**
 * Значок праздника. Тот же и в клетке, и в легенде: объяснять один значок
 * другим бессмысленно.
 */
export const HOLIDAY_ICON = 'sparkles';

/**
 * Значок мельче числа дня намеренно: он живёт в углу клетки шириной сорок с
 * небольшим пунктов и не должен наезжать на само число.
 */
export const HOLIDAY_ICON_SIZE = 11;

export interface DayCellProps {
  day: ResolvedDay;
  size: number;
  /**
   * Высота клетки. Обычно равна ширине; при крупном системном шрифте больше —
   * иначе число дня и буква-маркер не помещаются.
   */
  height: number;
  /** false — день соседнего месяца: показывается приглушённо, но остаётся нажимаемым. */
  inMonth: boolean;
  /**
   * День идёт в счёт часов и смен. false — он раньше первой смены: график
   * разворачивается назад, а человек тогда здесь не работал. Такой день
   * показывается как день соседнего месяца — без заливки, но нажимаемым:
   * заливка обещала бы смену, которой не было.
   */
  counted?: boolean;
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
  /**
   * С кем совпал выходной: имя человека или группы. Нужно озвучке — «общий
   * выходной с Аней» вместо «общий выходной»: по одной заливке чей это день не
   * узнать ни скринридером, ни при дальтонизме.
   */
  sharedWith?: string;
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
  height,
  inMonth,
  counted = true,
  isToday,
  isWorked,
  highlighting = false,
  dimmed = false,
  sharedWith,
  isSelected,
  onPress,
}: DayCellProps) {
  const theme = useTheme();
  const shiftColors = useShiftColors(day.shiftType.colorToken, { faded: isWorked || dimmed });
  const [focused, setFocused] = useState(false);

  // День вне месяца и день до первой смены выглядят одинаково: и тот и другой
  // показаны как контекст, а не как своя смена.
  const plain = !inMonth || !counted;

  // Выделен — значит, выделение вообще включено и этот день в списке.
  const highlighted = !dimmed && !plain && highlighting;

  /**
   * Дни соседних месяцев не приглушаются прозрачностью: она уронила бы контраст
   * ниже проверенного порога. Вместо этого они теряют заливку и уходят в
   * приглушённый цвет текста, который проверен на фоне страницы.
   *
   * Выделенный день берёт свою заливку вместо сменной: одного лишь угасания
   * остальных мало — глазу нужно, за что зацепиться, а не откуда уйти. Смысл
   * дня при этом остаётся на букве-маркере.
   */
  const colors = plain
    ? { surface: theme.colors.background, on: theme.colors.textMuted }
    : highlighted
      ? theme.colors.highlight
      : shiftColors;

  const dayNumber = Number(day.date.slice(8, 10));
  const outlined = focused || isSelected || (isToday && !plain);

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
        !inMonth
          ? `${describeDay(day, { isWorked })}, соседний месяц`
          : counted
            ? describeDay(day, { isToday, isWorked, isShared: highlighted, sharedWith })
            : // Отработанной такая смена не называется: её не было. Причину
              // клетка говорит словами — по одной бледной заливке её не понять.
              `${describeDay(day, { isToday })}, до первой смены`
      }
      accessibilityState={{ selected: isSelected }}
      onPress={() => onPress(day.date)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: size,
        height,
        borderRadius: theme.radius.sm,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: outlined ? theme.focusRingWidth : 1,
        borderColor: focused
          ? theme.colors.focus
          : isSelected
            ? theme.colors.accent
            : isToday && !plain
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
          // Единственное место с ограничением масштаба шрифта: вширь клетке
          // расти некуда — колонок семь. Вниз она растёт вместе с текстом, это
          // считает gridMetrics; потолок здесь и там один и тот же.
          maxFontSizeMultiplier={CELL_FONT_SCALE_CAP}
          style={{ fontWeight: isToday && !plain ? '800' : '600' }}
        >
          {dayNumber}
        </AppText>
        <AppText
          variant="badge"
          color={colors.on}
          numberOfLines={1}
          maxFontSizeMultiplier={CELL_FONT_SCALE_CAP}
        >
          {day.shiftType.badge}
        </AppText>
      </View>

      {/* Совпавший выходной помечен ещё и полоской по низу клетки: одной
          заливки мало — она не читается ни при дальтонизме, ни в оттенках
          серого. Полоска — форма, а не цвет, и стоит она отдельно от двух
          угловых точек. */}
      {highlighted ? (
        <View
          importantForAccessibility="no"
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 3,
            height: 2,
            borderRadius: 1,
            backgroundColor: colors.on,
          }}
        />
      ) : null}

      {/* Праздник — значок в левом верхнем углу, отдельно от точки отклонения
          справа: это разные вещи, и на одной клетке они встречаются. Значок, а
          не второй кружок: две одинаковые точки по углам различались бы только
          цветом и положением, а по ним смысл не передают. Название праздника
          читает озвучка клетки. */}
      {day.holiday && !plain ? (
        <Ionicons
          name={HOLIDAY_ICON}
          size={HOLIDAY_ICON_SIZE}
          color={colors.on}
          importantForAccessibility="no"
          style={{ position: 'absolute', top: 2, left: 2 }}
        />
      ) : null}

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
 * Тип смены сверяется по ссылке намеренно: справочник лежит в хранилище одним
 * массивом, и правка одной смены создаёт новый объект только для неё.
 */
function sameDay(a: ResolvedDay, b: ResolvedDay): boolean {
  return (
    a.date === b.date &&
    a.shiftType === b.shiftType &&
    a.source === b.source &&
    a.workedMinutes === b.workedMinutes &&
    a.plannedMinutes === b.plannedMinutes &&
    a.note === b.note &&
    a.holiday === b.holiday
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
    before.height === after.height &&
    before.inMonth === after.inMonth &&
    before.counted === after.counted &&
    before.isToday === after.isToday &&
    before.isWorked === after.isWorked &&
    before.highlighting === after.highlighting &&
    before.dimmed === after.dimmed &&
    before.sharedWith === after.sharedWith &&
    before.isSelected === after.isSelected &&
    before.onPress === after.onPress,
);
