import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { todayIso } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { formatDayLong } from '@/domain/format.ts';
import { useDayNotes } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Card, Fab, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';
import { NoteRow } from './NoteRow.tsx';

/** Запас снизу под круглой кнопкой: последняя заметка не должна уезжать под неё. */
const FAB_CLEARANCE = 96;

/**
 * Заметки одного дня.
 *
 * Устроены как список будильников: карточки подряд и круглая кнопка «плюс»
 * внизу. Это знакомая форма для «список вещей, которые я сам завёл», и второй
 * такой же список незачем делать по-другому.
 */
export function DayNotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const push = useGuardedPush();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ date: string }>();
  const date = (params.date ?? todayIso()) as IsoDate;

  const notes = useDayNotes(date);
  const removeNote = useAppStore((state) => state.removeNote);

  const padding = {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.lg + FAB_CLEARANCE,
  };

  return (
    <Sheet title={`Заметки · ${formatDayLong(date).toLowerCase()}`} onClose={() => router.back()}>
      <View style={{ flex: 1 }}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
          {notes.length === 0 ? (
            <Card title="Заметок нет">
              <AppText variant="body" tone="muted">
                Заметка — это просто текст к этому дню: что не забыть, за кого вышел, о чём
                договорились. К ней можно поставить напоминание — тогда телефон зазвонит в этот
                день.
              </AppText>
            </Card>
          ) : (
            <View accessibilityRole="list" style={{ gap: theme.spacing.md }}>
              {notes.map((note) => (
                <NoteRow
                  key={note.id}
                  note={note}
                  onEdit={() => push({ pathname: '/note/[id]', params: { id: note.id, date } })}
                  onDelete={() => removeNote(note.id)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <Fab
          name="add"
          label="Добавить заметку"
          onPress={() => push({ pathname: '/note/[id]', params: { id: 'new', date } })}
        />
      </View>
    </Sheet>
  );
}
