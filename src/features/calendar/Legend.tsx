import type { ComponentProps } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ShiftTypeTotals } from '@/domain/summary.ts';
import { AppText } from '@/ui';
import { typography, useTheme, useShiftColors } from '@/theme';
import type { ShiftColorSource } from '@/theme';
import { HOLIDAY_ICON, MARKER_ICON_SIZE, NOTE_ICON, PAYMENT_ICON } from './DayCell.tsx';

/** Высота обозначения: буква-маркер плюс её отступы сверху и снизу. */
const ITEM_HEIGHT = typography.badge.lineHeight + 4;

/** Что показывает строка выделения под обозначениями смен. */
export interface SharedHighlight {
  /** Чьи выходные выделены: человек или группа. */
  name: string;
  /** Сколько дней совпало в этом месяце. Ноль — совпадений нет. */
  days: number;
}

/**
 * Легенда показывает только те смены, которые в этом месяце реально есть, —
 * иначе она разрастается справочником на девять строк.
 */
export function Legend({
  totals,
  colors,
  hasHolidays = false,
  hasNotes = false,
  hasPayments = false,
  shared,
  reserveShared = false,
}: {
  totals: ShiftTypeTotals[];
  /** Откуда каждая смена берёт цвет: оттенок палитры или свой. */
  colors: Record<string, ShiftColorSource>;
  /** В месяце есть праздники: объяснить значок в углу клетки больше негде. */
  hasHolidays?: boolean;
  /** В месяце есть заметки: у них свой значок в нижнем углу клетки. */
  hasNotes?: boolean;
  /** В месяце записаны выплаты: значок в другом нижнем углу. */
  hasPayments?: boolean;
  /**
   * Чьи общие выходные сейчас выделены на календаре. Не задано — никого не
   * выделяют, и объяснять нечего.
   */
  shared?: SharedHighlight;
  /**
   * Держать место под строку выделения, даже когда никого не выделили.
   *
   * Включается, пока на экране список совпадений: выделение снимается
   * нажатием и пропадает само при листании в месяц без совпадений, и без
   * зарезервированной строки счётчик смен под легендой прыгал бы на каждое
   * такое изменение.
   */
  reserveShared?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View
        accessibilityRole="list"
        accessibilityLabel="Обозначения смен в этом месяце"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
      >
        {totals.map((item) => (
          <LegendItem
            key={item.shiftTypeId}
            badge={item.badge}
            name={item.name}
            color={colors[item.shiftTypeId] ?? { colorToken: '' }}
          />
        ))}
        {hasHolidays ? <IconLegendItem icon={HOLIDAY_ICON} text="праздник" /> : null}
        {hasNotes ? <IconLegendItem icon={NOTE_ICON} text="заметка" /> : null}
        {hasPayments ? <IconLegendItem icon={PAYMENT_ICON} text="выплата" /> : null}
      </View>

      {/* Выделение — своей строкой под обозначениями, а не в общем ряду с
          ними: в ряду оно то переносило его на вторую строку, то возвращало
          обратно, и всё, что ниже, ездило вверх-вниз. */}
      {reserveShared ? <SharedLegendRow shared={shared} /> : null}
    </View>
  );
}

/**
 * Строка про выделенные дни. Место под неё занято всегда, меняется только
 * содержимое: появляется она по нажатию в списке совпадений, а пропадает и
 * сама — в месяце, где совпадений нет.
 *
 * minHeight, а не height: при системном шрифте в 200% строка переносится, и
 * фиксированная высота её обрежет.
 */
function SharedLegendRow({ shared }: { shared?: SharedHighlight }) {
  return (
    <View
      // Строка меняется от нажатия в списке ниже: без живой области
      // скринридер о ней промолчит.
      accessibilityLiveRegion="polite"
      style={{ justifyContent: 'center', minHeight: ITEM_HEIGHT }}
    >
      {shared ? <SharedLegendItem shared={shared} /> : null}
    </View>
  );
}

/**
 * Заливка выделенных дней и чьи они.
 *
 * Тот же цвет, что в клетке, и имя словами: по одной заливке чей это выходной
 * не узнать ни при дальтонизме, ни скринридером.
 *
 * Совпадений нет — образца цвета тоже нет: на календаре в этот месяц ни одна
 * клетка им не залита, и объяснять нечего. Сказать при этом надо: клетки
 * приглушены, и без строки непонятно, почему.
 */
function SharedLegendItem({ shared }: { shared: SharedHighlight }) {
  const theme = useTheme();
  const empty = shared.days === 0;
  const text = empty ? `общих выходных нет: ${shared.name}` : `общие выходные: ${shared.name}`;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={
        empty
          ? `${shared.name}: общих выходных в этом месяце нет`
          : `Выделены общие выходные: ${shared.name}`
      }
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      {empty ? null : (
        <View
          importantForAccessibility="no-hide-descendants"
          style={{
            minWidth: 20,
            height: ITEM_HEIGHT,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.highlight.surface,
          }}
        />
      )}
      <AppText variant="caption" tone="muted" importantForAccessibility="no">
        {text}
      </AppText>
    </View>
  );
}

/**
 * Значок из угла клетки и подпись к нему: праздник, заметка, выплата.
 *
 * Значок сам по себе смысла не передаёт — рядом всегда стоит слово, и его же
 * читает скринридер вместо картинки.
 */
function IconLegendItem({
  icon,
  text,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  text: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Значок в углу клетки — ${text}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      <Ionicons
        name={icon}
        size={MARKER_ICON_SIZE}
        color={theme.colors.text}
        importantForAccessibility="no"
        style={{ marginHorizontal: 4 }}
      />
      <AppText variant="caption" tone="muted" importantForAccessibility="no">
        {text}
      </AppText>
    </View>
  );
}

function LegendItem({
  badge,
  name,
  color,
}: {
  badge: string;
  name: string;
  color: ShiftColorSource;
}) {
  const theme = useTheme();
  const colors = useShiftColors(color);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${badge} — ${name.toLowerCase()}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          minWidth: 20,
          paddingHorizontal: 4,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
          backgroundColor: colors.surface,
          alignItems: 'center',
        }}
      >
        <AppText variant="badge" color={colors.on} maxFontSizeMultiplier={1.3}>
          {badge}
        </AppText>
      </View>
      <AppText variant="caption" tone="muted" importantForAccessibility="no">
        {name.toLowerCase()}
      </AppText>
    </View>
  );
}
