import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, TextField, Toggle, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Правка группы людей для общих выходных.
 *
 * Группа отвечает на вопрос, который списком по одному не задать: «когда
 * свободны мы все». Поэтому в ней только имя и отметки участников — ни цветов,
 * ни настроек показа: показом управляет сам список под календарём.
 */
export function SharedGroupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ group?: string }>();

  const tracks = useAppStore((state) => state.tracks);
  const groups = useAppStore((state) => state.sharedGroups);
  const addSharedGroup = useAppStore((state) => state.addSharedGroup);
  const updateSharedGroup = useAppStore((state) => state.updateSharedGroup);
  const removeSharedGroup = useAppStore((state) => state.removeSharedGroup);

  const edited = groups.find((group) => group.id === params.group) ?? null;
  // В группу идут только чужие графики: своя работа не «участник», она и так
  // учитывается всегда.
  const people = tracks.filter((track) => !track.own);

  const [name, setName] = useState(edited?.name ?? '');
  const [members, setMembers] = useState<string[]>(edited?.trackIds ?? []);

  const incomplete = name.trim().length === 0 || members.length === 0;

  const save = (): void => {
    if (incomplete) return;
    if (edited) updateSharedGroup(edited.id, { name: name.trim(), trackIds: members });
    else addSharedGroup(name.trim(), members);
    router.back();
  };

  const remove = (): void => {
    if (edited) removeSharedGroup(edited.id);
    router.back();
  };

  const toggle = (trackId: string, on: boolean): void =>
    setMembers((current) =>
      on
        ? // Порядок держится порядком графиков, а не порядком нажатий.
          people
            .filter((track) => track.id === trackId || current.includes(track.id))
            .map((track) => track.id)
        : current.filter((id) => id !== trackId),
    );

  return (
    <Sheet title={edited ? 'Группа' : 'Новая группа'} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Группа">
          <TextField
            label="Название"
            value={name}
            onChangeText={setName}
            placeholder="Друзья"
            hint="Так группа подписана в списке общих выходных"
          />
        </Card>

        <Card title="Кто входит">
          {people.length === 0 ? (
            <AppText variant="body" tone="muted">
              Пока не заведено ни одного чужого графика. Добавь график близкого человека — он
              появится здесь сам.
            </AppText>
          ) : (
            <>
              {people.map((track) => (
                <Toggle
                  key={track.id}
                  label={track.name}
                  value={members.includes(track.id)}
                  onValueChange={(on) => toggle(track.id, on)}
                />
              ))}
              <AppText variant="caption" tone="muted">
                В списке под календарём группа покажет дни, когда свободны все её участники разом.
              </AppText>
            </>
          )}
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Сохранить группу"
            variant="primary"
            disabled={incomplete}
            accessibilityHint={
              incomplete ? 'Впиши название и отметь хотя бы одного человека' : undefined
            }
            onPress={save}
          />
          {edited ? <Button title="Удалить группу" variant="danger" onPress={remove} /> : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}
