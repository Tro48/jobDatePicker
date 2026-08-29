import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText.tsx';
import { IconButton } from './IconButton.tsx';
import { useTheme } from '@/theme';

type Mode = 'hours' | 'minutes';

/** Позиции на циферблате: 12 сверху, дальше по часовой стрелке. */
const POSITIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const DEGREES_PER_POSITION = 360 / POSITIONS.length;
const DEGREES_PER_MINUTE = 6;
const RADIAN = Math.PI / 180;

/** Сколько должно оставаться до края экрана: отступы карточки и экрана. */
const SCREEN_GUTTER = 64;

const pad = (value: number): string => String(value).padStart(2, '0');

function parse(value: string): { hours: number; minutes: number } {
  return { hours: Number(value.slice(0, 2)) || 0, minutes: Number(value.slice(3, 5)) || 0 };
}

/**
 * Выбор времени циферблатом.
 *
 * Сначала часы, потом минуты — как в системных часах Android. Каждое число на
 * циферблате отдельная кнопка: нажатие работает без всякого перетаскивания,
 * поэтому выбор доступен и с клавиатуры, и скринридеру. Перетаскивание по
 * циферблату — добавка сверху, а не единственный способ.
 *
 * Часы разложены одним кольцом из двенадцати чисел с переключателем половины
 * суток, а не двумя кольцами, как в Material: во внутреннее кольцо не влезают
 * зоны нажатия по 48 dp, а ужимать их до 36 нельзя.
 */
export function TimeDial({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { hours, minutes } = parse(value);

  const [mode, setMode] = useState<Mode>('hours');
  const [half, setHalf] = useState(hours >= 12 ? 1 : 0);
  const [focused, setFocused] = useState<number | null>(null);

  // Циферблат растёт вместе с системным размером шрифта, иначе при 150 %
  // числа вылезают из своих кружков.
  const scale = Math.min(Math.max(fontScale, 1), 1.5);
  const button = Math.round(theme.minTouchTarget * scale);
  const available = width - SCREEN_GUTTER;
  const diameter = Math.min(available, Math.round(button * 4.9));
  const center = diameter / 2;
  const ring = (diameter - button) / 2;

  const commit = (nextHours: number, nextMinutes: number): void =>
    onChange(`${pad(nextHours)}:${pad(nextMinutes)}`);

  /** Часы половины суток: 00–11 или 12–23. Позиция 12 — это 0 и 12. */
  const hourAt = (position: number): number => (position % 12) + half * 12;

  const items = POSITIONS.map((position) => {
    const angle = position * DEGREES_PER_POSITION;
    const itemValue = mode === 'hours' ? hourAt(position) : (position % 12) * 5;
    return {
      position,
      value: itemValue,
      x: center + ring * Math.sin(angle * RADIAN),
      y: center - ring * Math.cos(angle * RADIAN),
      selected: mode === 'hours' ? itemValue === hours : itemValue === minutes,
    };
  });

  const handAngle =
    mode === 'hours'
      ? (hours % 12 === 0 ? 12 : hours % 12) * DEGREES_PER_POSITION
      : minutes * DEGREES_PER_MINUTE;

  // Пересчёт касания в значение читает свежие данные из ссылки: PanResponder
  // создаётся один раз и замкнул бы на себе состояние первого рендера.
  const stateRef = useRef({ mode, half, hours, minutes, center, ring });
  stateRef.current = { mode, half, hours, minutes, center, ring };

  const dialRef = useRef<View>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Нажатия достаются числам-кнопкам, перетаскивание — циферблату.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          // Координаты касания приходят в системе окна, а циферблат едет
          // вместе с прокруткой — его начало меряется на каждый жест заново.
          originRef.current = null;
          dialRef.current?.measureInWindow((x, y) => {
            originRef.current = { x, y };
          });
        },
        onPanResponderMove: (event) => {
          const origin = originRef.current;
          if (!origin) return;

          const state = stateRef.current;
          const dx = event.nativeEvent.pageX - origin.x - state.center;
          const dy = event.nativeEvent.pageY - origin.y - state.center;
          const degrees = (Math.atan2(dx, -dy) / RADIAN + 360) % 360;

          if (state.mode === 'minutes') {
            commit(state.hours, Math.round(degrees / DEGREES_PER_MINUTE) % 60);
            return;
          }
          const position = Math.round(degrees / DEGREES_PER_POSITION) % 12;
          commit((position % 12) + state.half * 12, state.minutes);
        },
        // Часы выбраны — дальше сразу минуты, как в системных часах.
        onPanResponderRelease: () => setMode((current) => (current === 'hours' ? 'minutes' : current)),
      }),
    // Пустые зависимости намеренно: обработчик берёт значения из stateRef, а
    // onChange во всех вызовах правит черновик функцией от прошлого состояния.
    [],
  );

  const select = (itemValue: number): void => {
    if (mode === 'hours') {
      commit(itemValue, minutes);
      setMode('minutes');
      return;
    }
    commit(hours, itemValue);
  };

  const shiftMinutes = (delta: number): void => commit(hours, (minutes + delta + 60) % 60);

  const modeButton = (target: Mode, text: string, spoken: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: mode === target }}
      accessibilityLabel={spoken}
      accessibilityHint="Переключает циферблат"
      onPress={() => setMode(target)}
      style={{
        minHeight: theme.minTouchTarget,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: mode === target ? theme.colors.accent : 'transparent',
        backgroundColor: mode === target ? theme.colors.surfaceElevated : 'transparent',
      }}
    >
      <AppText variant="display" tone={mode === target ? 'accent' : 'default'}>
        {text}
      </AppText>
    </Pressable>
  );

  const halfButton = (target: 0 | 1, text: string) => (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: half === target, checked: half === target }}
      accessibilityLabel={target === 0 ? 'Часы с нуля до одиннадцати' : 'Часы с двенадцати до двадцати трёх'}
      onPress={() => {
        setHalf(target);
        commit((hours % 12) + target * 12, minutes);
      }}
      style={{
        flex: 1,
        minHeight: theme.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: half === target ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
      }}
    >
      <AppText variant="label" style={{ fontWeight: half === target ? '700' : '400' }}>
        {text}
      </AppText>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.md }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {modeButton('hours', pad(hours), `Часы, ${hours}`)}
        <AppText variant="display" importantForAccessibility="no">
          :
        </AppText>
        {modeButton('minutes', pad(minutes), `Минуты, ${minutes}`)}
      </View>

      {mode === 'hours' ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Половина суток"
          style={{ flexDirection: 'row', gap: theme.spacing.sm }}
        >
          {halfButton(0, '00–11')}
          {halfButton(1, '12–23')}
        </View>
      ) : null}

      <View
        ref={dialRef}
        {...pan.panHandlers}
        accessibilityRole="radiogroup"
        accessibilityLabel={mode === 'hours' ? `${label}: часы` : `${label}: минуты`}
        style={{
          width: diameter,
          height: diameter,
          alignSelf: 'center',
          borderRadius: diameter / 2,
          backgroundColor: theme.colors.surfaceElevated,
        }}
      >
        {/* Стрелка и ось — украшение поверх уже озвученного состояния. */}
        <View
          pointerEvents="none"
          importantForAccessibility="no"
          style={{
            position: 'absolute',
            left: center - 1,
            top: center - ring,
            width: 2,
            height: ring,
            backgroundColor: theme.colors.accent,
            transformOrigin: 'bottom',
            transform: [{ rotate: `${handAngle}deg` }],
          }}
        />
        <View
          pointerEvents="none"
          importantForAccessibility="no"
          style={{
            position: 'absolute',
            left: center - 5,
            top: center - 5,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.colors.accent,
          }}
        />

        {items.map((item) => (
          <Pressable
            key={item.position}
            accessibilityRole="radio"
            accessibilityState={{ selected: item.selected, checked: item.selected }}
            accessibilityLabel={mode === 'hours' ? `${item.value} часов` : `${item.value} минут`}
            onPress={() => select(item.value)}
            onFocus={() => setFocused(item.position)}
            onBlur={() => setFocused(null)}
            style={{
              position: 'absolute',
              left: item.x - button / 2,
              top: item.y - button / 2,
              width: button,
              height: button,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: button / 2,
              backgroundColor: item.selected ? theme.colors.accent : 'transparent',
              borderWidth: focused === item.position ? theme.focusRingWidth : 0,
              borderColor: theme.colors.focus,
            }}
          >
            <AppText
              variant="body"
              color={item.selected ? theme.colors.onAccent : undefined}
              style={{ fontWeight: item.selected ? '700' : '400' }}
            >
              {pad(item.value)}
            </AppText>
          </Pressable>
        ))}
      </View>

      {mode === 'minutes' ? (
        // На кольце подписаны пятиминутки; любая минута набирается шагами,
        // а не только протяжкой — иначе точное время недоступно без мыши.
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}>
          <IconButton name="remove" label="Минута назад" onPress={() => shiftMinutes(-1)} />
          <AppText variant="caption" tone="muted">
            минуты по одной
          </AppText>
          <IconButton name="add" label="Минута вперёд" onPress={() => shiftMinutes(1)} />
        </View>
      ) : null}
    </View>
  );
}
