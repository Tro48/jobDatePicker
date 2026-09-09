import { memo, useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { describeBaseDay, describeDay, isWeekend } from '@/domain/describe.ts';
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
export const HOLIDAY_ICON: IoniconName = 'sparkles';

/** Имя значка из набора Ionicons — того же, которым рисует IconButton. */
type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Размер значка в углу клетки — один на все три: праздник, заметку и выплату.
 *
 * Мельче числа дня намеренно: клетка шириной сорок с небольшим пунктов, и
 * наезжать на само число значку нельзя. Ниже тринадцати опускаться тоже
 * нельзя — на одиннадцати рисунок значка сливается в пятно, и отличить заметку
 * от выплаты уже не выходит.
 */
export const MARKER_ICON_SIZE = 13;

/** Отступ значка от края клетки. Меньше — значок липнет к рамке. */
const ICON_INSET = 1;

/**
 * Значки в нижних углах клетки: заметка слева, выплата справа.
 *
 * Разные значки, а не одна общая точка: заметка и деньги — разные вещи, и
 * различать их по одному лишь положению нельзя. Заливка тоже отпадает — цветом
 * клетка уже говорит про смену. Названия и суммы читает озвучка клетки.
 */
export const NOTE_ICON: IoniconName = 'document-text';
export const PAYMENT_ICON: IoniconName = 'cash';

/**
 * Насколько полоска общего выходного отступает от краёв, когда в нижних углах
 * стоят значки: иначе она заезжает прямо под них.
 */
const STRIPE_INSET_WITH_MARKERS = 18;

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
  /**
   * Заметки этого дня одной строкой. Заданы — в углу клетки стоит значок, а
   * озвучка читает сам текст: заметки живут отдельно от графика, и движок про
   * них не знает.
   */
  note?: string;
  /** В этот день записана выплата: в другом углу клетки свой значок. */
  hasPayment?: boolean;
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
  note,
  hasPayment = false,
  isSelected,
  onPress,
}: DayCellProps) {
  const theme = useTheme();
  const shiftColors = useShiftColors(day.shiftType, { faded: isWorked || dimmed });
  const [focused, setFocused] = useState(false);

  /**
   * Клетка без заливки — только дни соседних месяцев: они здесь как контекст,
   * чтобы было видно, как смены переходят через границу.
   */
  const plain = !inMonth;

  /**
   * День, на который графика ещё нет, — базовый календарь: будни одним
   * нейтральным цветом, выходные обычным цветом выходного. Раскладку смен
   * назад график не разворачивает: человек в эти месяцы здесь не работал, и
   * рисовать ему смены значило бы приписать выходы, которых не было.
   */
  const base = inMonth && !counted;
  const weekend = isWeekend(day.date);

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
      : // Выходной базового календаря красится тем же, чем и выходной по
        // графику: заглушка-выходной как раз им и заполнена.
        base && !weekend
        ? theme.colors.baseWeekday
        : shiftColors;

  const dayNumber = Number(day.date.slice(8, 10));

  /**
   * Рамка клетки. Фокус и выбор перекрывают всё, сегодняшний день обводится
   * цветом своей подписи, а у дня без заливки рамка — единственное, чем он
   * вообще виден: соседний месяц и дни до первой смены заливки не имеют и без
   * неё сливались с фоном страницы, особенно в тёмной теме.
   */
  const borderColor = focused
    ? theme.colors.focus
    : isSelected
      ? theme.colors.accent
      : isToday && !plain
        ? colors.on
        : plain
          ? theme.colors.border
          : 'transparent';

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
          ? `${describeDay(day, { isWorked, note, hasPayment })}, соседний месяц`
          : counted
            ? describeDay(day, {
                isToday,
                isShared: highlighted,
                isWorked,
                sharedWith,
                note,
                hasPayment,
              })
            : // Смены здесь нет вовсе: озвучивается день недели, а не заглушка
              // из справочника. Заливка сама по себе этого не скажет.
              [
                describeBaseDay(day.date, { isToday, holiday: day.holiday }),
                hasPayment ? 'есть выплата' : null,
                note,
              ]
                .filter(Boolean)
                .join(', ')
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
        // Толщина рамки одна и та же всегда, меняется только цвет. Прежде она
        // росла при выборе и на фокусе, а вместе с ней ехало внутрь всё, что
        // стоит в клетке по углам: абсолютные координаты значков считаются от
        // внутреннего края рамки, и заметка с выплатой дёргались на каждое
        // нажатие по дню.
        borderWidth: theme.focusRingWidth,
        borderColor,
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
          {/* У буднего дня без графика смены нет — писать в клетку нечего.
              Выходной базового календаря букву оставляет: суббота остаётся
              выходным и до устройства на работу. */}
          {base && !weekend ? '' : day.shiftType.badge}
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
            left: note ? STRIPE_INSET_WITH_MARKERS : 6,
            right: hasPayment ? STRIPE_INSET_WITH_MARKERS : 6,
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
          size={MARKER_ICON_SIZE}
          color={colors.on}
          importantForAccessibility="no"
          style={{ position: 'absolute', top: ICON_INSET, left: ICON_INSET }}
        />
      ) : null}

      {/* Заметка и выплата — значки в нижних углах: их видно, не открывая
          день, и по ним понятно, куда нажимать. Значок берёт цвет подписи
          клетки — ту же проверенную на контраст пару, что и буква-маркер. */}
      {note ? (
        <Ionicons
          name={NOTE_ICON}
          size={MARKER_ICON_SIZE}
          color={colors.on}
          importantForAccessibility="no"
          style={{ position: 'absolute', bottom: ICON_INSET, left: ICON_INSET }}
        />
      ) : null}

      {hasPayment ? (
        <Ionicons
          name={PAYMENT_ICON}
          size={MARKER_ICON_SIZE}
          color={colors.on}
          importantForAccessibility="no"
          style={{ position: 'absolute', bottom: ICON_INSET, right: ICON_INSET }}
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
    before.note === after.note &&
    before.hasPayment === after.hasPayment &&
    before.isSelected === after.isSelected &&
    before.onPress === after.onPress,
);
