import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDayShort } from '@/domain/format.ts';
import { RELEASE_NOTES, unseenReleases } from '@/domain/releaseNotes.ts';
import type { ReleaseNote } from '@/domain/releaseNotes.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Что изменилось в последних выпусках.
 *
 * Открывается только по нажатию на полоску календаря: само по себе окно
 * поверх экрана не вылезает никогда. Прочитанным список считается по факту
 * открытия — человек его увидел, второй раз звать незачем.
 */
export function WhatsNewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scroll = useSheetScroll();
  const lastSeenReleaseId = useAppStore((state) => state.lastSeenReleaseId);
  const markReleasesSeen = useAppStore((state) => state.markReleasesSeen);

  /**
   * Снимок непрочитанного на момент открытия. Без него отметка «прочитано»
   * ниже вычистила бы список в том же кадре — человек увидел бы, как текст
   * исчезает у него на глазах.
   *
   * Всё прочитано (открыли повторно) — показываем историю целиком: пустая
   * шторка «Что нового» выглядит как поломка.
   */
  const [notes] = useState(() => {
    const unseen = unseenReleases(lastSeenReleaseId);
    return unseen.length > 0 ? unseen : RELEASE_NOTES;
  });

  // Прочитанным список считается по факту открытия: человек его увидел.
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
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}

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
