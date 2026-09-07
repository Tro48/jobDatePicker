import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { shiftDurationMinutes } from '@/domain/engine.ts';
import { formatDuration, pluralize } from '@/domain/format.ts';
import {
  MAX_BADGE_LENGTH,
  MAX_SHIFT_NAME_LENGTH,
  isBuiltinShiftType,
  shiftTypeUsage,
} from '@/domain/shifts.ts';
import type { ShiftKind, ShiftTypeDraft } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import {
  AppText,
  Button,
  Card,
  ChoiceGroup,
  Select,
  Sheet,
  TextField,
  TimeSelect,
  Toggle,
  useSheetScroll,
} from '@/ui';
import { useTheme } from '@/theme';
import { ColorChoice } from './ColorChoice.tsx';
import { formatMultiplier } from './ShiftTypesScreen.tsx';

/** Смена, с которой начинается заведение новой: обычный рабочий день. */
const BLANK: ShiftTypeDraft = {
  name: '',
  badge: '',
  kind: 'work',
  colorToken: 'shift.extra',
  time: { start: '09:00', end: '18:00', unpaidBreakMinutes: 0 },
  rateMultiplier: 1,
};

const KIND_CHOICES = [
  { value: 'work', label: 'Рабочая смена', hint: 'Часы попадают в сводку' },
  { value: 'rest', label: 'Нерабочий день', hint: 'Выходной, отсыпной, отпуск' },
] as const satisfies ReadonlyArray<{ value: ShiftKind; label: string; hint?: string }>;

/** Шаг перерыва — пять минут; в списке только осмысленные значения. */
const BREAK_CHOICES = [0, 15, 30, 45, 60, 90, 120].map((minutes) => ({
  value: String(minutes),
  label: minutes === 0 ? 'Без перерыва' : `${minutes} мин`,
}));

const MULTIPLIER_CHOICES = [1, 1.15, 1.2, 1.25, 1.5, 2].map((value) => ({
  value: String(value),
  label: value === 1 ? 'Без надбавки' : `×${formatMultiplier(value)}`,
}));

const PLACEHOLDER_TIME = { start: '09:00', end: '18:00', unpaidBreakMinutes: 0 };

/**
 * Правка одного типа смены.
 *
 * Черновик держится в состоянии экрана и уезжает в хранилище одной кнопкой:
 * писать на каждую букву значило бы пересобирать календарь, сводку и весь
 * набор будильников на каждое нажатие клавиши.
 */
export function ShiftTypeEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ type?: string }>();

  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const tracks = useAppStore((state) => state.tracks);
  const addShiftType = useAppStore((state) => state.addShiftType);
  const updateShiftType = useAppStore((state) => state.updateShiftType);
  const removeShiftType = useAppStore((state) => state.removeShiftType);

  const edited = shiftTypes.find((type) => type.id === params.type) ?? null;
  const builtin = edited !== null && isBuiltinShiftType(edited);

  const [draft, setDraft] = useState<ShiftTypeDraft>(() => (edited ? { ...edited } : BLANK));
  const patch = (next: Partial<ShiftTypeDraft>): void =>
    setDraft((current) => ({ ...current, ...next }));

  const time = draft.time ?? PLACEHOLDER_TIME;
  const isWork = draft.kind === 'work';
  // Название обязательно: смена без него неотличима в списке и не озвучивается.
  const incomplete = draft.name.trim().length === 0;

  const usage = useMemo(
    () => (edited ? shiftTypeUsage(tracks, edited.id) : { schedules: [], overrides: 0 }),
    [tracks, edited],
  );
  const blockedBySchedule = usage.schedules.length > 0;

  const duration = isWork
    ? shiftDurationMinutes({
        ...draft,
        id: edited?.id ?? 'draft',
        builtinId: edited?.builtinId ?? null,
        time,
      })
    : 0;

  const save = (): void => {
    if (incomplete) return;
    // Нерабочий день времени не хранит: у выходного нет ни начала, ни конца,
    // а оставленное поле потом посчиталось бы часами.
    const next: ShiftTypeDraft = isWork
      ? { ...draft, time }
      : { ...draft, time: undefined, rateMultiplier: 0 };

    if (edited) updateShiftType(edited.id, next);
    else addShiftType(next);
    router.back();
  };

  const remove = (): void => {
    if (!edited) return;
    removeShiftType(edited.id);
    router.back();
  };

  return (
    <Sheet title={edited ? edited.name : 'Новая смена'} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Название">
          <TextField
            label="Название смены"
            value={draft.name}
            onChangeText={(name) => patch({ name })}
            placeholder="Вечерняя смена"
            maxLength={MAX_SHIFT_NAME_LENGTH}
          />
          <TextField
            label="Буква в календаре"
            value={draft.badge}
            onChangeText={(badge) => patch({ badge })}
            placeholder={draft.name.slice(0, 1).toUpperCase() || 'В'}
            maxLength={MAX_BADGE_LENGTH}
            help="Одна-три буквы. По ней день читается в календаре, даже когда цвет не различить."
          />
          <ColorChoice
            value={draft.colorToken}
            onChange={(colorToken) => patch({ colorToken })}
            badge={draft.badge.trim() || draft.name.slice(0, 1).toUpperCase() || 'В'}
          />
        </Card>

        <Card title="Вид">
          {builtin ? (
            // У встроенной смены вид задан кодом: на «Выходном» стоят все
            // готовые графики, а отпуск, ставший рабочим днём, испортил бы
            // сводку часов. Строкой, а не выключенным переключателем: серая
            // недоступная кнопка объясняет меньше, чем одно предложение.
            <AppText variant="body" tone="muted">
              {isWork ? 'Рабочая смена' : 'Нерабочий день'} — у встроенной смены это не меняется.
              Всё остальное правится.
            </AppText>
          ) : (
            <ChoiceGroup
              label="Вид смены"
              choices={KIND_CHOICES}
              value={draft.kind}
              onChange={(kind) => patch({ kind })}
            />
          )}

          {/* Многодневность спрашивается только у своих нерабочих смен:
              «учебный отпуск» ставится периодом ровно так же, как обычный. */}
          {!isWork && !builtin ? (
            <Toggle
              label="Ставится сразу на несколько дней"
              help="Как отпуск: карточка дня спросит, сколько дней подряд заполнить, и проставит их разом."
              value={draft.multiDay === true}
              onValueChange={(multiDay) => patch({ multiDay: multiDay ? true : undefined })}
            />
          ) : null}
        </Card>

        {isWork ? (
          <Card title="Время">
            {/* Начало и конец друг под другом, а не в одну строку: вчетвером
                часы и минуты делят ширину экрана так, что от подписи «Минуты»
                остаётся столбик из букв. */}
            <TimeSelect
              label="Начало"
              value={time.start}
              onChange={(start) => patch({ time: { ...time, start } })}
            />
            <TimeSelect
              label="Конец"
              value={time.end}
              onChange={(end) => patch({ time: { ...time, end } })}
            />
            <Select
              label="Неоплачиваемый перерыв"
              value={String(time.unpaidBreakMinutes)}
              options={BREAK_CHOICES}
              onChange={(value) => patch({ time: { ...time, unpaidBreakMinutes: Number(value) } })}
            />
            <AppText variant="body">
              В сводку попадёт {formatDuration(duration)} за смену
              {time.unpaidBreakMinutes > 0 ? ' — перерыв вычтен' : ''}.
            </AppText>
            {time.start === time.end ? (
              <AppText variant="caption" tone="muted">
                Начало и конец совпадают — это суточная смена, ровно 24 часа.
              </AppText>
            ) : null}

            <Select
              label="Надбавка к ставке"
              value={String(draft.rateMultiplier)}
              options={MULTIPLIER_CHOICES}
              onChange={(value) => patch({ rateMultiplier: Number(value) })}
            />
            <AppText variant="caption" tone="muted">
              Надбавка нужна, чтобы ставка за час считалась честно: месяц с одними ночными не
              выглядел бы прибавкой к окладу.
            </AppText>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Сохранить смену"
            variant="primary"
            disabled={incomplete}
            accessibilityHint={incomplete ? 'Сначала впиши название' : undefined}
            onPress={save}
          />

          {edited && !builtin ? (
            <>
              <Button
                title="Удалить смену"
                variant="danger"
                disabled={blockedBySchedule}
                accessibilityHint={
                  blockedBySchedule
                    ? `Смена стоит в графике: ${usage.schedules.join(', ')}`
                    : 'Смена исчезнет из списка, заметки в днях останутся'
                }
                onPress={remove}
              />
              {blockedBySchedule ? (
                <AppText variant="caption" tone="muted">
                  Эту смену не удалить: на ней стоит график «{usage.schedules.join('», «')}».
                  Сначала поменяй график, иначе календарь станет нечем раскладывать.
                </AppText>
              ) : usage.overrides > 0 ? (
                <AppText variant="caption" tone="muted">
                  Смена стоит в {pluralize(usage.overrides, ['дне', 'днях', 'днях'])} вручную. После
                  удаления эти дни вернутся к графику, заметки и часы останутся.
                </AppText>
              ) : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}
