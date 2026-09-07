import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { localDateTimeToMillis, todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { formatDayLong } from '@/domain/format.ts';
import { DEFAULT_REMIND_AT, MAX_NOTE_LENGTH } from '@/domain/notes.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, TextField, TimeSelect, Toggle, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Высота поля заметки в состоянии покоя.
 *
 * Заметка — это абзац, а не строка: поле в одну строку самим своим видом
 * предлагает написать три слова, и тогда весь смысл отдельной заметки теряется.
 */
const TEXT_FIELD_HEIGHT = 160;

/**
 * Правка одной заметки.
 *
 * Форма держит черновик у себя и пишет в хранилище по кнопке «Сохранить»:
 * запись на каждую букву пересобирала бы расписание напоминаний и переставляла
 * бы весь набор звонков в системе.
 */
export function NoteEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ id: string; date?: string }>();
  const isNew = params.id === 'new';

  const existing = useAppStore((state) => state.notes.find((note) => note.id === params.id));
  const addNote = useAppStore((state) => state.addNote);
  const updateNote = useAppStore((state) => state.updateNote);
  const removeNote = useAppStore((state) => state.removeNote);

  // День заметки не правится: заметка привязана к дате, с которой её завели, а
  // перенести её на другой день — это завести другую заметку.
  const date = (existing?.date ?? params.date ?? todayIso()) as IsoDate;

  const [text, setText] = useState(() => existing?.text ?? '');
  const [remindAt, setRemindAt] = useState<string | null>(() => existing?.remindAt ?? null);

  // Момент открытия экрана: подпись под временем не должна смениться под
  // руками у того, кто правит заметку в полночь.
  const now = useMemo(() => new Date(), []);
  const past = remindAt !== null && localDateTimeToMillis(date, remindAt) <= now.getTime();

  const padding = { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl };
  const filled = text.trim().length > 0;

  if (!isNew && !existing) {
    return (
      <Sheet title="Заметка" onClose={() => router.back()}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
          <Card title="Заметка не найдена">
            <AppText variant="body" tone="muted">
              Похоже, её уже удалили.
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  const save = (): void => {
    if (!filled) return;
    if (isNew) addNote({ date, text, remindAt });
    else updateNote(params.id, { text, remindAt });
    router.back();
  };

  return (
    <Sheet title={isNew ? 'Новая заметка' : 'Заметка'} onClose={() => router.back()}>
      <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
        <Card title={formatDayLong(date)}>
          <TextField
            label="Текст заметки"
            value={text}
            onChangeText={setText}
            placeholder="Например: вышел за Сергея, отдать смену в четверг"
            multiline
            minHeight={TEXT_FIELD_HEIGHT}
            maxLength={MAX_NOTE_LENGTH}
          />
        </Card>

        <Card
          title="Напоминание"
          help="Звонит так же, как будильник: своим экраном поверх блокировки. На вкладке «Будильник» такое напоминание не показывается — оно живёт вместе с заметкой."
        >
          <Toggle
            label="Напомнить в этот день"
            value={remindAt !== null}
            onValueChange={(on) => setRemindAt(on ? (remindAt ?? DEFAULT_REMIND_AT) : null)}
          />
          {remindAt !== null ? (
            <TimeSelect
              label="Время"
              value={remindAt}
              onChange={setRemindAt}
              hint={past ? undefined : `Зазвонит ${formatDayLong(date).toLowerCase()}`}
            />
          ) : null}
          {past ? (
            <AppText variant="body" tone="danger">
              Это время уже прошло — напоминание не зазвонит. Заметка сохранится, но звонка не
              будет.
            </AppText>
          ) : null}
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Сохранить"
            variant="primary"
            disabled={!filled}
            accessibilityHint={filled ? undefined : 'Сначала напиши текст заметки'}
            onPress={save}
          />
          {isNew ? null : (
            <Button
              title="Удалить заметку"
              variant="danger"
              onPress={() => {
                removeNote(params.id);
                router.back();
              }}
            />
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}
