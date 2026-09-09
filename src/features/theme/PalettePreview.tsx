import { Text, View } from 'react-native';
import { fadedShiftPair, radius, spacing, typography } from '@/theme';
import type { ColorPair, Palette } from '@/theme';

export interface PalettePreviewProps {
  /** Палитра, которую показываем, — не обязательно та, что сейчас на экране. */
  palette: Palette;
}

/**
 * Образец: календарь и экран вокруг него в этих цветах.
 *
 * Нужен потому, что правят обычно не ту тему, что сейчас на экране, — и потому,
 * что цвет в отрыве от соседей ничего не говорит: заливка смены становится
 * понятной, только когда рядом стоят соседние дни, отработанные приглушены, а
 * поверх лежат число и буква-маркер.
 *
 * Рисуется переданной палитрой, а не темой приложения: в этом весь смысл.
 * Свои размеры и свой Text вместо AppText по той же причине — AppText берёт
 * цвет из темы, а здесь тема другая.
 */
export function PalettePreview({ palette }: PalettePreviewProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Образец: сетка месяца, карточка с текстом и кнопки в выбранных цветах"
      style={{
        backgroundColor: palette.background,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: palette.border,
        padding: spacing.md,
        gap: spacing.md,
      }}
    >
      {/* Содержимое озвучке не отдаётся: подписи здесь — рыба, читать её
          вслух незачем, обёртка уже сказала, что это образец. */}
      <View importantForAccessibility="no-hide-descendants" style={{ gap: spacing.md }}>
        <MonthGrid palette={palette} />

        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: radius.md,
            padding: spacing.md,
            gap: spacing.xs,
          }}
        >
          <Text style={[typography.heading, { color: palette.text }]}>15 смен, 168 часов</Text>
          <Text style={[typography.caption, { color: palette.textMuted }]}>
            Переработка <Text style={{ color: palette.positive }}>+6 ч</Text> к графику
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
            <View
              style={{
                backgroundColor: palette.accent,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={[typography.label, { color: palette.onAccent }]}>Сохранить</Text>
            </View>
            <View
              style={{
                backgroundColor: palette.surfaceElevated,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: palette.border,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={[typography.label, { color: palette.danger }]}>Удалить</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * День образцовой сетки.
 *
 * Сетка не берётся из настоящего графика намеренно: цвета правят и те, у кого
 * график ещё не заведён, а образец обязан показывать все виды клеток разом —
 * отработанную, запланированную, выделенную и день месяца, до которого график
 * не дотянулся.
 */
interface PreviewDay {
  day: number;
  /** Токен смены или null — тогда клетка берёт пару «день без графика». */
  token: string | null;
  badge: string;
  /** Отработанный день: заливка приглушена. */
  worked: boolean;
  /** Совпавший выходной: заливка заменяется на выделение. */
  marked?: boolean;
  deviation?: 'over' | 'under';
}

/** Цикл «день — ночь — отсыпной — выходной»: один из готовых графиков. */
const CYCLE = [
  { token: 'shift.day', badge: 'Д' },
  { token: 'shift.night', badge: 'Н' },
  { token: 'shift.sleep', badge: 'О' },
  { token: 'shift.off', badge: 'В' },
];

/** Сколько дней месяца уже прожито: до этого числа смены отработаны. */
const WORKED_UNTIL = 9;

/**
 * Сентябрь 2026: тридцать дней, первое число — вторник.
 *
 * Пустая клетка в начале — понедельник прошлого месяца, четыре в конце —
 * октябрь, до которого график не дотянулся: там и живёт «день без графика».
 */
const SAMPLE_MONTH: (PreviewDay | null)[] = [
  null,
  ...Array.from({ length: 30 }, (_, index): PreviewDay => {
    const day = index + 1;
    const slot = CYCLE[index % CYCLE.length];
    return {
      day,
      token: slot.token,
      badge: slot.badge,
      worked: day < WORKED_UNTIL,
      // Совпавший выходной: так помечены дни, когда свободны все выбранные.
      marked: day === 19 || day === 20,
      // Отклонение от графика — на одном дне в плюс, на другом в минус.
      deviation: day === 3 ? 'over' : day === 6 ? 'under' : undefined,
    };
  }),
  ...Array.from({ length: 4 }, (_, index): PreviewDay => ({
    day: index + 1,
    token: null,
    badge: '',
    worked: false,
  })),
];

/** Сетка месяца: то, ради чего цвета и правят. */
function MonthGrid({ palette }: { palette: Palette }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {WEEKDAYS.map((name) => (
          <Text
            key={name}
            style={[typography.badge, { flex: 1, textAlign: 'center', color: palette.textMuted }]}
          >
            {name}
          </Text>
        ))}
      </View>

      {Array.from({ length: SAMPLE_MONTH.length / 7 }, (_, week) => (
        <View key={week} style={{ flexDirection: 'row', gap: 2 }}>
          {SAMPLE_MONTH.slice(week * 7, week * 7 + 7).map((day, index) => (
            <PreviewCell
              key={day ? `${day.day}-${index}` : `empty-${index}`}
              day={day}
              palette={palette}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Клетка календаря в образце: число, буква-маркер и точка отклонения. */
function PreviewCell({ day, palette }: { day: PreviewDay | null; palette: Palette }) {
  if (!day) return <View style={{ flex: 1 }} />;

  const colors = cellColors(day, palette);

  return (
    <View
      style={{
        flex: 1,
        aspectRatio: 0.85,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: palette.border,
        paddingHorizontal: 2,
        paddingVertical: 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Text style={[typography.badge, { flex: 1, color: colors.on }]}>{day.day}</Text>
        {day.deviation ? (
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              marginTop: 3,
              backgroundColor: day.deviation === 'over' ? palette.positive : palette.danger,
            }}
          />
        ) : null}
      </View>
      <Text style={[typography.badge, { color: colors.on, textAlign: 'center' }]}>{day.badge}</Text>
    </View>
  );
}

/**
 * Чем залита клетка и каким цветом на ней написано.
 *
 * Порядок тот же, что в настоящем календаре: выделение совпавшего выходного
 * заменяет заливку смены, отработанная смена приглушается, а день без графика
 * берёт свою пару.
 */
function cellColors(day: PreviewDay, palette: Palette): ColorPair {
  if (day.token === null) return palette.baseWeekday;
  if (day.marked) return palette.highlight;

  const pair = palette.shifts[day.token] ?? { surface: palette.surface, on: palette.text };
  return day.worked ? fadedShiftPair(pair, palette.surface) : pair;
}
