import { createContext, useContext, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText.tsx';
import { IconButton } from './IconButton.tsx';
import { useReduceMotion } from './useReduceMotion.ts';
import { useTheme } from '@/theme';

export interface SheetProps {
  /** Заголовок шторки. Единственный элемент с ролью header на экране. */
  title: string;
  children: ReactNode;
  onClose: () => void;
}

/** Скругление верхних углов. */
const RADIUS = 24;

/** Насколько надо утянуть шторку вниз, чтобы она закрылась. */
const CLOSE_DISTANCE = 120;

/** Резкий рывок закрывает и без длинного движения. */
const CLOSE_VELOCITY = 0.7;

/** Ниже этого сдвига жест считается случайным дрожанием пальца. */
const DRAG_SLOP = 8;

/**
 * Прокрутка содержимого шторки: смахивать вниз можно, только когда список уже
 * наверху. Иначе жест отбирал бы у списка обычную прокрутку.
 */
const SheetScrollContext = createContext<((offset: number) => void) | null>(null);

/**
 * Пропсы для прокручиваемого содержимого шторки.
 *
 * Экран внутри шторки обязан их развернуть на свой ScrollView — иначе шторка
 * не знает, наверху ли содержимое, и будет закрываться посреди прокрутки.
 * Вне шторки хук возвращает пустышку, поэтому компонент работает и сам по себе.
 */
export function useSheetScroll(): Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle'> {
  const report = useContext(SheetScrollContext);

  return useMemo(
    () => ({
      onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) =>
        report?.(event.nativeEvent.contentOffset.y),
      scrollEventThrottle: 16,
    }),
    [report],
  );
}

/**
 * Экран-шторка: выезжает снизу, верхние углы скруглены, закрывается смахиванием
 * вниз, крестиком или системной кнопкой «назад».
 *
 * Так открывается всё, что вызывается изнутри вкладок: карточка дня, правка
 * будильника, настройки. Это не отдельный раздел приложения, а работа поверх
 * текущего экрана, и выглядеть она должна соответственно.
 *
 * Смахивание — не единственный способ закрыть: жест недоступен ни с
 * клавиатуры, ни через TalkBack, поэтому крестик в шапке обязателен.
 */
export function Sheet({ title, children, onClose }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { height } = useWindowDimensions();

  const translateY = useRef(new Animated.Value(0)).current;
  const scrollOffset = useRef(0);

  const drag = useMemo(() => {
    const follow = (dy: number): void => translateY.setValue(Math.max(0, dy));

    const release = (dy: number, velocity: number): void => {
      if (dy > CLOSE_DISTANCE || velocity > CLOSE_VELOCITY) {
        Animated.timing(translateY, {
          toValue: height,
          duration: reduceMotion ? 0 : 180,
          useNativeDriver: true,
        }).start(onClose);
        return;
      }
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    };

    const handlers = {
      onPanResponderMove: (_event: unknown, gesture: { dy: number }) => follow(gesture.dy),
      onPanResponderRelease: (_event: unknown, gesture: { dy: number; vy: number }) =>
        release(gesture.dy, gesture.vy),
      onPanResponderTerminate: () => release(0, 0),
    };

    const vertical = (gesture: { dx: number; dy: number }): boolean =>
      gesture.dy > DRAG_SLOP && Math.abs(gesture.dy) > Math.abs(gesture.dx);

    return {
      // Содержимое: жест перехватывается на погружении, до нативного списка, —
      // иначе Android отдаёт движение прокрутке даже в самом верху.
      content: PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          scrollOffset.current <= 0 && vertical(gesture),
        ...handlers,
      }),
      // Шапка тянется всегда: список под ней может быть прокручен куда угодно.
      header: PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => vertical(gesture),
        ...handlers,
      }),
    };
  }, [translateY, height, reduceMotion, onClose]);

  return (
    <View style={{ flex: 1 }}>
      {/* Затемнение гаснет вместе с уходящей шторкой. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#000000',
          opacity: translateY.interpolate({
            inputRange: [0, height],
            outputRange: [0.4, 0],
            extrapolate: 'clamp',
          }),
        }}
      />

      {/* Полоса над шторкой закрывает её нажатием. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        onPress={onClose}
        style={{ height: insets.top }}
      />

      <Animated.View
        {...drag.content.panHandlers}
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: RADIUS,
          borderTopRightRadius: RADIUS,
          overflow: 'hidden',
          transform: [{ translateY }],
        }}
      >
        <View {...drag.header.panHandlers}>
          {/* Ухватка: показывает, что шторку можно утянуть вниз. Читать нечего. */}
          <View
            importantForAccessibility="no-hide-descendants"
            style={{
              alignSelf: 'center',
              width: 44,
              height: 5,
              borderRadius: 3,
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
        </View>

        <SheetScrollContext.Provider
          value={(offset) => {
            scrollOffset.current = offset;
          }}
        >
          {children}
        </SheetScrollContext.Provider>
      </Animated.View>
    </View>
  );
}
