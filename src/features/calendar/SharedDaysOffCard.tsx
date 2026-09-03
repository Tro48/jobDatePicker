import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { IsoDate } from '@/domain/date.ts';
import { AppText, Card } from '@/ui';
import { useTheme } from '@/theme';
import type { SharedRow } from './useSharedDays.ts';

export interface SharedDaysOffCardProps {
  rows: SharedRow[];
  /** Чьи дни сейчас выделены на календаре. null — никого, сетка обычная. */
  focusedId: string | null;
  onFocus: (id: string | null) => void;
}

/**
 * Совпадающие выходные за открытый месяц.
 *
 * Носитель смысла — текст: список читается скринридером, не зависит от цвета и
 * отвечает на вопрос быстрее, чем разглядывание сетки.
 *
 * Выделение на календаре — ровно одна строка за раз, поэтому это выбор, а не
 * набор переключателей. Так было не сразу: сначала дни всех людей метились
 * разноцветными кольцами одновременно, и по такой клетке нельзя было сказать,
 * чей это выходной, — при трёх людях кольцо превращалось в мусор. Один
 * выделенный за раз снимает вопрос целиком: остальные дни просто гаснут.
 *
 * Чтобы спросить «когда свободны мы все», человека заводят в группу — она стоит
 * в том же списке отдельной строкой.
 */
export function SharedDaysOffCard({ rows, focusedId, onFocus }: SharedDaysOffCardProps) {
  const theme = useTheme();
  if (rows.length === 0) return null;

  return (
    <Card title="Общие выходные">
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Чьи выходные выделить на календаре"
        style={{ gap: theme.spacing.xs }}
      >
        {rows.map((row) => (
          <SharedRowItem
            key={row.id}
            row={row}
            selected={row.id === focusedId}
            onPress={() => onFocus(row.id === focusedId ? null : row.id)}
          />
        ))}
      </View>
    </Card>
  );
}

function SharedRowItem({
  row,
  selected,
  onPress,
}: {
  row: SharedRow;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const days = row.dates.length === 0 ? 'совпадений нет' : dayNumbers(row.dates);
  // Группа без участников — не «нет совпадений», а «сравнивать не с кем».
  const detail = row.people === 0 ? 'некого сравнивать' : days;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={`${row.name}: ${detail}`}
      accessibilityHint={selected ? 'Снять выделение с календаря' : 'Выделить эти дни на календаре'}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight: theme.minTouchTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: focused ? theme.focusRingWidth : 1,
        borderColor: focused ? theme.colors.focus : selected ? theme.colors.accent : 'transparent',
        backgroundColor: selected ? theme.colors.surfaceElevated : 'transparent',
      }}
    >
      {/* Иконка дублирует состояние, уже озвученное accessibilityState. */}
      <Ionicons
        name={selected ? 'eye' : 'eye-outline'}
        size={20}
        color={selected ? theme.colors.accent : theme.colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>
        <AppText variant="body" style={{ fontWeight: selected ? '700' : '400' }}>
          {row.name}
          {row.people > 1 ? ` · ${row.people}` : ''}
        </AppText>
        <AppText variant="caption" tone="muted">
          {detail}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Числа месяца через запятую: «3, 4, 11, 12». */
function dayNumbers(dates: IsoDate[]): string {
  return dates.map((date) => String(Number(date.slice(8, 10)))).join(', ');
}
