import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { unseenReleases } from '@/domain/releaseNotes.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { useBuildSignal } from './useBuildSignal.ts';

/**
 * Ненавязчивое сообщение об обновлении на календаре.
 *
 * Одна строка, а не окно поверх экрана: приложение открывают, чтобы узнать
 * свою смену, и заставлять человека сначала что-то закрыть — плохая плата за
 * новость, которая может подождать. Закрывается крестиком и больше не
 * возвращается: «что нового» — навсегда, про сборку — до следующей.
 *
 * Кнопки скачивания здесь нет намеренно: APK ставится из настроек, где рядом
 * лежат версия, канал и ручная проверка. Полоска только сообщает и ведёт туда.
 */
export function UpdateNotice() {
  const theme = useTheme();
  const router = useRouter();
  const push = useGuardedPush();
  const lastSeenReleaseId = useAppStore((state) => state.lastSeenReleaseId);
  const markReleasesSeen = useAppStore((state) => state.markReleasesSeen);
  const { build, notice, dismiss } = useBuildSignal();

  const unseen = unseenReleases(lastSeenReleaseId);

  // Сборка вперёд «что нового»: JS-обновление человек уже получил, а APK без
  // него никуда не поедет. Двух полосок разом не бывает — это строка на
  // главном экране, а не список новостей.
  if (notice && build) {
    const version = build.version ? `Вышла версия ${build.version}` : 'Вышла новая сборка';

    return (
      <Notice
        text={build.notes ? `${version}. ${build.notes}` : version}
        hint="Открывает настройки, где лежит кнопка скачивания"
        onPress={() => router.navigate('/settings')}
        onDismiss={dismiss}
        icon="download-outline"
        color={theme.colors.accent}
      />
    );
  }

  if (unseen.length > 0) {
    return (
      <Notice
        text={`Обновление приехало. ${unseen[0].title}`}
        hint="Открывает список изменений"
        onPress={() => push('/whats-new')}
        onDismiss={markReleasesSeen}
        icon="sparkles-outline"
        color={theme.colors.positive}
      />
    );
  }

  return null;
}

function Notice({
  text,
  hint,
  onPress,
  onDismiss,
  icon,
  color,
}: {
  text: string;
  hint: string;
  onPress: () => void;
  onDismiss: () => void;
  icon: 'download-outline' | 'sparkles-outline';
  color: string;
}) {
  const theme = useTheme();

  return (
    <View
      // Полоска появляется и после проверки по расписанию, уже на открытом
      // экране: без живой области скринридер о ней промолчит.
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingLeft: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text}
        accessibilityHint={hint}
        onPress={onPress}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: theme.minTouchTarget,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <Ionicons
          name={icon}
          size={18}
          color={color}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <AppText variant="body" importantForAccessibility="no" style={{ flexShrink: 1 }}>
          {text}
        </AppText>
      </Pressable>

      <IconButton name="close" label="Скрыть сообщение об обновлении" onPress={onDismiss} />
    </View>
  );
}
