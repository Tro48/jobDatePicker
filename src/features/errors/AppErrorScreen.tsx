import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ErrorBoundaryProps } from 'expo-router';
import { useAppStore } from '@/data/store.ts';
import { MIN_TOUCH_TARGET, darkPalette, lightPalette, radius, spacing } from '@/theme';
import type { Palette } from '@/theme';

/**
 * Экран, который остаётся, когда всё остальное упало.
 *
 * Своя вёрстка на голых View и Text, без общих компонентов и без useTheme: этот
 * экран подставляется вместо всего дерева навигации, то есть провайдеры темы
 * над ним уже не работают. Тащить сюда Card и AppText значит рисковать тем, что
 * сломается и запасной экран тоже.
 *
 * Кнопка сброса графика здесь не для красоты: график хранит копию паттерна, а
 * справочник смен приезжает с кодом, и это единственное состояние, из которого
 * приложение само выбраться не может.
 */
export function AppErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  const colors = useColorScheme() === 'dark' ? darkPalette : lightPalette;

  const resetSchedule = (): void => {
    useAppStore.getState().clearSchedule();
    void retry();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + spacing.lg,
      }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, fontWeight: '700', color: colors.text }}
      >
        Приложение споткнулось
      </Text>

      <Text style={{ fontSize: 16, lineHeight: 24, color: colors.text }}>
        Данные никуда не делись — сломался только показ. Попробуй открыть заново. Если не помогает,
        сбрось график: календарь соберётся заново, а правки дней, выплаты и будильники останутся на
        месте.
      </Text>

      <ErrorButton label="Открыть заново" onPress={() => void retry()} primary colors={colors} />
      <ErrorButton label="Сбросить график" onPress={resetSchedule} colors={colors} />

      {/* Текст ошибки внизу и мелким: он нужен для отчёта, а не для чтения. */}
      <Text
        accessibilityLabel={`Текст ошибки: ${error.message}`}
        style={{ fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: spacing.md }}
      >
        {error.message}
      </Text>
    </ScrollView>
  );
}

function ErrorButton({
  label,
  onPress,
  primary,
  colors,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  colors: Palette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: primary ? colors.accent : colors.border,
        backgroundColor: primary ? colors.accent : 'transparent',
      }}
    >
      <View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '600',
            color: primary ? colors.onAccent : colors.text,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
