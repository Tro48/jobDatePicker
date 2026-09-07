import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { AppText } from './AppText.tsx';
import { useTheme } from '@/theme';

interface IconButtonBaseProps {
  /** Доступное имя обязательно: у иконки нет текста, который мог бы её заменить. */
  label: string;
  onPress: () => void;
  /** Что произойдёт по нажатию, если одного имени мало. */
  accessibilityHint?: string;
  disabled?: boolean;
  /**
   * Цвет значка и кольца фокуса. По умолчанию — обычный текст на фоне страницы.
   *
   * Задаётся там, где кнопка стоит на цветной заливке: значок обязан
   * контрастировать со своей подложкой, и подходит для этого ровно тот цвет,
   * которым на ней пишут текст, — пары «заливка + текст» проверены скриптом
   * контраста. Кольцо фокуса красится тем же цветом по той же причине.
   */
  color?: string;
  /**
   * Счётчик в углу значка: сколько всего того, что откроется по нажатию.
   *
   * Ноль не рисуется — пустой кружок ничего не сообщает. Само число обязано
   * стоять и в доступном имени кнопки: значок с цифрой скринридеру не виден, и
   * «Заметки» без числа скажут меньше, чем видит зрячий.
   */
  badge?: number;
}

/**
 * Значок задаётся именем из Ionicons или готовым узлом.
 *
 * Второе — для того, чего в Ionicons нет: значка PDF, например. Цвет такой
 * значок красит сам, поэтому вместе с ним обычно передаётся и `color`.
 */
export type IconButtonProps = IconButtonBaseProps &
  (
    | { name: ComponentProps<typeof Ionicons>['name']; icon?: never }
    | { icon: ReactNode; name?: never }
  );

/** Кружок счётчика: два знака помещаются, дальше растёт вширь. */
const BADGE_SIZE = 16;

export function IconButton({
  name,
  icon,
  label,
  onPress,
  accessibilityHint,
  disabled = false,
  color,
  badge,
}: IconButtonProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: theme.minTouchTarget,
        height: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        borderWidth: focused ? theme.focusRingWidth : 0,
        borderColor: color ?? theme.colors.focus,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon ?? <Ionicons name={name} size={24} color={color ?? theme.colors.text} />}

      {/* Счётчик — акцентом, а не цветом значка: на заливке смены он иначе
          сливается с самим значком, а акцент проверен на контраст и с
          заливками, и со своей цифрой. */}
      {badge !== undefined && badge > 0 ? (
        <View
          importantForAccessibility="no"
          style={{
            position: 'absolute',
            top: 4,
            right: 2,
            minWidth: BADGE_SIZE,
            height: BADGE_SIZE,
            paddingHorizontal: 3,
            borderRadius: BADGE_SIZE / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
          }}
        >
          <AppText
            variant="badge"
            color={theme.colors.onAccent}
            // Единственное место кнопки, которому некуда расти: кружок стоит в
            // её углу. Потолок тот же, что у клетки календаря.
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
          >
            {badge}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
