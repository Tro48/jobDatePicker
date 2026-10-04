import { ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme/ThemeProvider.tsx';

export interface ScreenProps {
  /** Заголовок экрана. Единственный элемент с ролью header на экране. */
  title: string;
  subtitle?: string;
  /** Действие в шапке — справа от заголовка. Для второстепенного: справка, настройки. */
  action?: ReactNode;
  children: ReactNode;
  /** Отключить прокрутку — для экранов с собственным скроллом, например календаря. */
  scrollable?: boolean;
}

export function Screen({ title, subtitle, action, children, scrollable = true }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const header = (
    <View style={{ gap: theme.spacing.xs, marginBottom: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {/* Заголовок забирает всю строку, кнопка прижата к правому краю и не
            сжимается: при крупном системном шрифте переносится текст, а не она. */}
        <AppText variant="display" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AppText>
        {action}
      </View>
      {subtitle ? (
        <AppText variant="body" tone="muted">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );

  const padding = {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  };

  // Верхний отступ — у самой рамки, а не у содержимого: иначе при прокрутке
  // текст заезжает под статусбар. Так же устроена шторка (Sheet).
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      {scrollable ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={padding}
          // Прокрутка обязана работать при увеличенном системном шрифте.
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, padding]}>
          {header}
          {children}
        </View>
      )}
    </View>
  );
}
