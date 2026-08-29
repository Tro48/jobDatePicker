import { Pressable, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText.tsx';
import { IconButton } from './IconButton.tsx';
import { useTheme } from '@/theme';

export interface SheetProps {
  /** Заголовок шторки. Единственный элемент с ролью header на экране. */
  title: string;
  children: ReactNode;
  onClose: () => void;
}

/** Скругление верхних углов и просвет над шторкой. */
const RADIUS = 24;

/**
 * Экран-шторка: выезжает снизу, верхние углы скруглены, сверху виден экран,
 * с которого её открыли.
 *
 * Так открывается всё, что вызывается изнутри вкладок: карточка дня, правка
 * будильника, настройки. Это не отдельный раздел приложения, а работа поверх
 * текущего экрана, и выглядеть она должна соответственно.
 */
export function Sheet({ title, children, onClose }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#00000066' }}>
      {/* Просвет над шторкой закрывает её нажатием — как в системных шторках. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        onPress={onClose}
        style={{ height: insets.top + theme.spacing.xl }}
      />

      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: RADIUS,
          borderTopRightRadius: RADIUS,
          overflow: 'hidden',
        }}
      >
        {/* Полоска-ухватка: подсказывает, что это шторка. Читать её нечего. */}
        <View
          importantForAccessibility="no-hide-descendants"
          style={{
            alignSelf: 'center',
            width: 40,
            height: 4,
            borderRadius: 2,
            marginTop: theme.spacing.sm,
            backgroundColor: theme.colors.border,
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingLeft: theme.spacing.lg,
            paddingRight: theme.spacing.sm,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <AppText variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </AppText>
          <IconButton name="close" label="Закрыть" onPress={onClose} />
        </View>

        {children}
      </View>
    </View>
  );
}
