import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Weekday } from '@/domain/date.ts';
import {
  MAX_CYCLE_LENGTH,
  MAX_SCHEDULE_NAME_LENGTH,
  MAX_WEEKS,
  MIN_CYCLE_LENGTH,
  blankWeek,
  describePattern,
  resizeCycle,
} from '@/domain/customSchedules.ts';
import { shiftDurationMinutes } from '@/domain/engine.ts';
import {
  SHIFT_FORMS,
  WEEKDAYS_SHORT,
  formatTotalHours,
  formatWeekdayByNumber,
  pluralize,
} from '@/domain/format.ts';
import { indexShiftTypes } from '@/domain/shifts.ts';
import type { SchedulePattern, ShiftType } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ChoiceGroup, Select, Sheet, TextField, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';
import { PatternCell } from './PatternCell.tsx';
import { ShiftBrush } from './ShiftBrush.tsx';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Зазор между клетками раскладки — тот же, что в сетке календаря. */
const CELL_GAP = 4;

/** Клеток в ряду раскладки цикла: семь, как в неделе, — так цикл читается. */
const CELLS_PER_ROW = 7;

const MODE_CHOICES = [
  {
    value: 'cycle',
    label: 'Цикл из дней',
    hint: 'Сменные графики: 2/2, 3/3, сутки через трое',
  },
  {
    value: 'weekly',
    label: 'По дням недели',
    hint: 'Пятидневка и всё, что привязано к субботе с воскресеньем',
  },
] as const satisfies ReadonlyArray<{ value: SchedulePattern['kind']; label: string; hint: string }>;

const CYCLE_LENGTH_CHOICES = Array.from(
  { length: MAX_CYCLE_LENGTH - MIN_CYCLE_LENGTH + 1 },
  (_, index) => {
    const length = MIN_CYCLE_LENGTH + index;
    return { value: String(length), label: `${length}` };
  },
);

/**
 * Конструктор своего графика.
 *
 * Цикл и недельный шаблон — это два готовых генератора движка; экрана к ним не
 * было, и любой график, которого нет в десятке пресетов, приходилось
 * изображать ручными правками по одному дню.
 */
export function ScheduleBuilderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ schedule?: string }>();

  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const customSchedules = useAppStore((state) => state.customSchedules);
  const addCustomSchedule = useAppStore((state) => state.addCustomSchedule);
  const updateCustomSchedule = useAppStore((state) => state.updateCustomSchedule);
  const removeCustomSchedule = useAppStore((state) => state.removeCustomSchedule);

  const edited = customSchedules.find((schedule) => schedule.id === params.schedule) ?? null;

  // Рисовать начинают с выходного: график — это в первую очередь дни, когда не
  // работаешь, а смены расставляют поверх.
  const restId = shiftTypes.find((type) => type.kind === 'rest')?.id ?? shiftTypes[0].id;
  const workId = shiftTypes.find((type) => type.kind === 'work')?.id ?? restId;

  const [name, setName] = useState(edited?.name ?? '');
  const [mode, setMode] = useState<SchedulePattern['kind']>(edited?.pattern.kind ?? 'cycle');
  const [brush, setBrush] = useState(workId);

  const [slots, setSlots] = useState<string[]>(() =>
    edited?.pattern.kind === 'cycle' ? [...edited.pattern.slots] : [workId, workId, restId, restId],
  );
  const [weeks, setWeeks] = useState<Array<Record<Weekday, string>>>(() =>
    edited?.pattern.kind === 'weekly'
      ? edited.pattern.weeks.map((week) => ({ ...week }))
      : [{ ...blankWeek(workId), 6: restId, 7: restId }],
  );

  const index = useMemo(() => indexShiftTypes(shiftTypes), [shiftTypes]);
  const brushType = index.get(brush) ?? shiftTypes[0];

  const pattern: SchedulePattern = useMemo(
    () => (mode === 'cycle' ? { kind: 'cycle', slots } : { kind: 'weekly', weeks }),
    [mode, slots, weeks],
  );

  const incomplete = name.trim().length === 0;

  // Клетки во всю ширину карточки, семь в ряду: так цикл видно неделями, и
  // «2/2» читается тем же взглядом, что и календарь.
  const inner = width - theme.spacing.lg * 4;
  const cellSize = Math.max(
    32,
    Math.floor((inner - CELL_GAP * (CELLS_PER_ROW - 1)) / CELLS_PER_ROW),
  );

  const totals = useMemo(() => summarizePattern(pattern, index), [pattern, index]);

  const paintSlot = (position: number): void =>
    setSlots((current) => current.map((id, i) => (i === position ? brush : id)));

  const paintWeekday = (weekIndex: number, day: Weekday): void =>
    setWeeks((current) =>
      current.map((week, i) => (i === weekIndex ? { ...week, [day]: brush } : week)),
    );

  const save = (): void => {
    if (incomplete) return;
    if (edited) updateCustomSchedule(edited.id, { name: name.trim(), pattern });
    else addCustomSchedule(name.trim(), pattern);
    router.back();
  };

  const remove = (): void => {
    if (!edited) return;
    removeCustomSchedule(edited.id);
    router.back();
  };

  return (
    <Sheet title={edited ? 'Свой график' : 'Новый график'} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Название">
          <TextField
            label="Название графика"
            value={name}
            onChangeText={setName}
            placeholder="Мой график"
            maxLength={MAX_SCHEDULE_NAME_LENGTH}
            hint="Так график будет подписан в списке выбора"
          />
        </Card>

        <Card title="Как считать">
          <ChoiceGroup label="Вид графика" choices={MODE_CHOICES} value={mode} onChange={setMode} />
        </Card>

        <Card title="Раскладка">
          <AppText variant="caption" tone="muted">
            Выбери смену и нажимай на дни — они закрасятся ею.
          </AppText>
          <ShiftBrush shiftTypes={shiftTypes} value={brush} onChange={setBrush} />

          {mode === 'cycle' ? (
            <>
              <Select
                label="Дней в цикле"
                value={String(slots.length)}
                options={CYCLE_LENGTH_CHOICES}
                onChange={(value) =>
                  setSlots((current) => resizeCycle(current, Number(value), restId))
                }
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP }}>
                {slots.map((id, position) => (
                  <PatternCell
                    key={position}
                    shiftType={index.get(id) ?? shiftTypes[0]}
                    label={`День ${position + 1}`}
                    brushName={brushType.name}
                    size={cellSize}
                    onPress={() => paintSlot(position)}
                  />
                ))}
              </View>
              <AppText variant="caption" tone="muted">
                Цикл повторяется от даты первой смены — её спросят на следующем экране.
              </AppText>
            </>
          ) : (
            <>
              {weeks.map((week, weekIndex) => (
                <View key={weekIndex} style={{ gap: theme.spacing.xs }}>
                  {weeks.length > 1 ? (
                    <AppText variant="label">Неделя {weekIndex + 1}</AppText>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: CELL_GAP }}>
                    {WEEKDAYS.map((day) => (
                      <View key={day} style={{ gap: 2, alignItems: 'center' }}>
                        <AppText
                          variant="caption"
                          tone={day >= 6 ? 'muted' : 'default'}
                          maxFontSizeMultiplier={1.3}
                          // Подпись дублирует то, что уже сказано в подписи
                          // самой клетки: скринридеру она ни к чему.
                          importantForAccessibility="no"
                          style={{ width: cellSize, textAlign: 'center' }}
                        >
                          {WEEKDAYS_SHORT[day - 1]}
                        </AppText>
                        <PatternCell
                          shiftType={index.get(week[day]) ?? shiftTypes[0]}
                          label={
                            weeks.length > 1
                              ? `Неделя ${weekIndex + 1}, ${formatWeekdayByNumber(day)}`
                              : formatWeekdayByNumber(day)
                          }
                          brushName={brushType.name}
                          size={cellSize}
                          onPress={() => paintWeekday(weekIndex, day)}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              {/* Вторая неделя — это «через субботу»: без чередования такой
                  график недельным шаблоном не выражается вовсе. */}
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                {weeks.length < MAX_WEEKS ? (
                  <Button
                    title="Добавить неделю"
                    style={{ flex: 1 }}
                    accessibilityHint="Недели будут чередоваться по кругу"
                    onPress={() => setWeeks((current) => [...current, { ...current[0] }])}
                  />
                ) : null}
                {weeks.length > 1 ? (
                  <Button
                    title="Убрать последнюю"
                    style={{ flex: 1 }}
                    onPress={() => setWeeks((current) => current.slice(0, -1))}
                  />
                ) : null}
              </View>
            </>
          )}
        </Card>

        <Card title="Что получилось">
          <AppText variant="body">{describePattern(pattern, shiftTypes)}</AppText>
          <AppText variant="body" tone="muted">
            {totals.shifts > 0
              ? `За цикл — ${pluralize(totals.shifts, SHIFT_FORMS)}, ${formatTotalHours(totals.minutes)}`
              : 'В графике нет ни одной рабочей смены'}
          </AppText>
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Сохранить график"
            variant="primary"
            disabled={incomplete}
            accessibilityHint={
              incomplete ? 'Сначала впиши название' : 'График появится в списке выбора'
            }
            onPress={save}
          />
          {/* Удаление убирает график только из списка выбора: дорожки,
              которые по нему живут, держат собственную копию раскладки. */}
          {edited ? <Button title="Удалить график" variant="danger" onPress={remove} /> : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}

/** Сколько смен и часов даёт один оборот графика. */
function summarizePattern(
  pattern: SchedulePattern,
  index: Map<string, ShiftType>,
): { shifts: number; minutes: number } {
  const ids =
    pattern.kind === 'cycle'
      ? pattern.slots
      : pattern.weeks.flatMap((week) => WEEKDAYS.map((day) => week[day]));

  return ids.reduce(
    (total, id) => {
      const type = index.get(id);
      if (!type || type.kind !== 'work') return total;
      return { shifts: total.shifts + 1, minutes: total.minutes + shiftDurationMinutes(type) };
    },
    { shifts: 0, minutes: 0 },
  );
}
