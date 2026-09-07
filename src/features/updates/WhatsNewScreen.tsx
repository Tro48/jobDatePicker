import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDayShort } from '@/domain/format.ts';
import { RELEASE_NOTES } from '@/domain/releaseNotes.ts';
import type { ReleaseNote } from '@/domain/releaseNotes.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Что делает свежее обновление.
 *
 * Ровно одна запись — последняя. Раньше сюда сваливалось всё непрочитанное, а
 * при повторном открытии и вся история целиком: человек, обновившийся через
 * три выпуска, читал простыню, где давно приехавшее стояло вперемешку с новым.
 * Вопрос у шторки один — «что изменилось сейчас», и ответ на него один.
 *
 * Открывается только по нажатию на полоску календаря: само по себе окно
 * поверх экрана не вылезает никогда. Прочитанным выпуск считается по факту
 * открытия — человек его увидел, второй раз звать незачем.
 */
export function WhatsNewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useSheetScroll();
  const markReleasesSeen = useAppStore((state) => state.markReleasesSeen);

  // Снимка непрочитанного здесь больше нет: запись всегда одна и та же, и
  // отметка «прочитано» ниже её не вычищает.
  const latest = RELEASE_NOTES[0] ?? null;

  // Прочитанным выпуск считается по факту открытия: человек его увидел.
  useEffect(() => {
    markReleasesSeen();
  }, [markReleasesSeen]);

  return (
    <Sheet title="Что нового" onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xxl,
        }}
      >
        {latest ? <NoteCard note={latest} /> : null}

        <Button title="Понятно" variant="primary" onPress={() => router.back()} />
      </ScrollView>
    </Sheet>
  );
}

function NoteCard({ note }: { note: ReleaseNote }) {
  const theme = useTheme();

  return (
    <Card title={note.title}>
      {/* Дата выпуска — по ней видно, насколько давно это приехало. */}
      <AppText variant="caption" tone="muted">
        {formatDayShort(note.id)}
      </AppText>

      <View
        accessibilityRole="list"
        accessibilityLabel="Изменения"
        style={{ gap: theme.spacing.sm }}
      >
        {note.items.map((item) => (
          <View
            key={item}
            accessibilityRole="text"
            accessibilityLabel={item}
            style={{ flexDirection: 'row', gap: theme.spacing.sm }}
          >
            {/* Точка списка — оформление: скринридеру она читалась бы как «маркер». */}
            <AppText variant="body" tone="muted" importantForAccessibility="no">
              •
            </AppText>
            <AppText variant="body" importantForAccessibility="no" style={{ flex: 1 }}>
              {item}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}
