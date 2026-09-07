import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { noteTitle } from '@/domain/notes.ts';
import type { DayNote } from '@/domain/types.ts';
import { AppText, IconButton } from '@/ui';
import { useTheme } from '@/theme';

/** Сколько строк заметки видно в списке. Дальше — открыть и прочитать целиком. */
const PREVIEW_LINES = 3;

/**
 * Строка списка заметок.
 *
 * Кнопка удаления вынесена из нажимаемой области намеренно: вложенная в неё,
 * она дала бы два элемента с одной зоной нажатия — скринридер читает такое как
 * одну кнопку с непонятным действием.
 */
export function NoteRow({
  note,
  onEdit,
  onDelete,
}: {
  note: DayNote;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const remind = note.remindAt === null ? null : `Напомнить в ${note.remindAt}`;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[note.text, remind].filter(Boolean).join(', ')}
        accessibilityHint="Открывает заметку целиком"
        onPress={onEdit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          minHeight: theme.minTouchTarget,
          justifyContent: 'center',
          gap: 2,
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.md,
          borderWidth: focused ? theme.focusRingWidth : 0,
          borderColor: theme.colors.focus,
        }}
      >
        <View importantForAccessibility="no-hide-descendants">
          <AppText variant="body" numberOfLines={PREVIEW_LINES}>
            {note.text}
          </AppText>
          {remind ? (
            <AppText variant="caption" tone="muted">
              {remind}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <IconButton
        name="trash-outline"
        label={`Удалить заметку: ${noteTitle(note)}`}
        onPress={() =>
          // Удаление руками не отменить, поэтому спрашиваем. Диалог системный:
          // он читается скринридером и закрывается кнопкой «назад».
          Alert.alert('Удалить заметку?', noteTitle(note), [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: onDelete },
          ])
        }
      />
    </View>
  );
}
