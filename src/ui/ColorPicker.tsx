import { useId, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { AppText } from './AppText.tsx';
import { TextField } from './TextField.tsx';
import { clamp, hexToHsv, hsvToHex, normalizeHex, useTheme } from '@/theme';
import type { Hsv } from '@/theme';

export interface ColorPickerProps {
  /** Текущий цвет, «#RRGGBB». */
  value: string;
  onChange: (hex: string) => void;
  /** Что раскрашивают: уходит в имя полосы тона для озвучки. */
  label: string;
}

/** Насколько двигает полосу тона один жест скринридера. */
const HUE_STEP = 5;

/**
 * Выбор цвета: квадрат оттенка, полоса тона и поле кода.
 *
 * Квадрат — привычный по редакторам картинок: слева направо растёт
 * насыщенность, снизу вверх — яркость, а какой это тон, задаёт полоса под ним.
 * Два движения пальцем вместо трёх отдельных ползунков.
 *
 * Поле кода — не дубликат квадрата, а второй способ, нужный сразу по двум
 * причинам: повторить цвет, который человек уже где-то видел («#1D4ED8» из
 * фирменного стиля пальцем не наводится), и задать цвет вообще без попадания
 * пальцем — квадрат озвучить нечем, у него две величины сразу, а поле ввода
 * читается и заполняется как обычное поле.
 */
export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const theme = useTheme();

  // Тон и насыщенность нельзя вывести из чёрного и серого: у них нет ни того,
  // ни другого. Поэтому выбор помнит своё место, пока цвет остаётся тем же, —
  // иначе, уведя яркость в ноль, человек терял бы набранный оттенок и не смог
  // вернуть его тем же движением обратно.
  const remembered = useRef<Hsv>(hexToHsv(value));
  if (hsvToHex(remembered.current) !== value) remembered.current = hexToHsv(value);
  const hsv = remembered.current;

  const pick = (patch: Partial<Hsv>): void => {
    remembered.current = { ...hsv, ...patch };
    onChange(hsvToHex(remembered.current));
  };

  // Набранное живёт отдельно от цвета: «#12» — это середина набора, а не
  // ошибка, и стирать её под пальцами нельзя. Наружу уходит только готовое.
  const [typed, setTyped] = useState<string | null>(null);
  const submit = (text: string): void => {
    const hex = normalizeHex(text);
    if (hex) onChange(hex);
    setTyped(null);
  };

  return (
    <View style={{ gap: theme.spacing.md }}>
      <TextField
        label="Код цвета"
        value={typed ?? value}
        onChangeText={setTyped}
        onBlur={() => submit(typed ?? value)}
        placeholder="#1D4ED8"
        maxLength={7}
        hint={
          normalizeHex(typed ?? value) === null
            ? 'Шесть цифр после решётки: #1D4ED8'
            : 'Тот же цвет можно выбрать в квадрате ниже'
        }
      />

      <SaturationField hsv={hsv} onPick={pick} />
      <HueSlider hsv={hsv} onPick={pick} label={label} />
    </View>
  );
}

interface ChannelProps {
  hsv: Hsv;
  onPick: (patch: Partial<Hsv>) => void;
}

/** Размер ручки на квадрате и на полосе. */
const THUMB = 24;

/** Высота полосы тона. Зона нажатия добирается отступами до 48 пунктов. */
const TRACK_HEIGHT = 32;

/**
 * Место элемента на экране и жест по нему.
 *
 * Меряется в начале каждого жеста, а не по layout: экран прокручивается, от
 * прокрутки onLayout не приходит, и по старому замеру палец попадал бы мимо
 * ровно на высоту прокрутки.
 */
function useDragArea(onDrag: (ratioX: number, ratioY: number) => void) {
  const area = useRef<View>(null);
  const box = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const latest = useRef(onDrag);
  latest.current = onDrag;

  const moveTo = (pageX: number, pageY: number): void => {
    const { x, y, width, height } = box.current;
    if (width <= 0 || height <= 0) return;
    latest.current(clamp((pageX - x) / width, 0, 1), clamp((pageY - y) / height, 0, 1));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Касание сразу ставит цвет: ждать движения незачем.
        onStartShouldSetPanResponder: () => true,
        // Движение забирается у прокрутки: иначе список цветов уезжал бы
        // из-под пальца, положенного на квадрат.
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { pageX, pageY } = event.nativeEvent;
          area.current?.measureInWindow((x, y, width, height) => {
            box.current = { x, y, width, height };
            moveTo(pageX, pageY);
          });
        },
        onPanResponderMove: (_event, gesture) => moveTo(gesture.moveX, gesture.moveY),
      }),
    [],
  );

  return { ref: area, handlers: responder.panHandlers };
}

/**
 * Квадрат оттенка: насыщенность по горизонтали, яркость по вертикали.
 *
 * Рисуется тремя слоями, как в редакторах картинок: чистый тон, поверх него
 * белый градиент слева направо и чёрный сверху вниз. Считать цвет каждой точки
 * самому не нужно — это делает видеокарта.
 *
 * Озвучке не отдаётся: у элемента две величины сразу, и ни ползунком, ни
 * кнопкой он для скринридера не притворяется. Тот же цвет задаётся полем кода
 * над ним — оно и есть доступный путь.
 */
function SaturationField({ hsv, onPick }: ChannelProps) {
  const theme = useTheme();
  const gradient = useId();
  const { ref, handlers } = useDragArea((ratioX, ratioY) =>
    onPick({ s: ratioX * 100, v: (1 - ratioY) * 100 }),
  );

  const pureHue = hsvToHex({ h: hsv.h, s: 100, v: 100 });

  return (
    <View
      ref={ref}
      {...handlers}
      importantForAccessibility="no-hide-descendants"
      style={{
        aspectRatio: 1,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${gradient}-white`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id={`${gradient}-black`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={pureHue} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradient}-white)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradient}-black)`} />
      </Svg>

      <Thumb left={`${clamp(hsv.s, 0, 100)}%`} top={`${100 - clamp(hsv.v, 0, 100)}%`} />
    </View>
  );
}

interface HueSliderProps extends ChannelProps {
  label: string;
}

/**
 * Полоса тона под квадратом.
 *
 * В отличие от квадрата, у неё одна величина, минимум и максимум — поэтому она
 * остаётся обычным ползунком для системы: TalkBack читает её как ползунок и
 * двигает жестами, не требуя точного попадания пальцем.
 */
function HueSlider({ hsv, onPick, label }: HueSliderProps) {
  const theme = useTheme();
  const gradient = useId();
  const [focused, setFocused] = useState(false);
  const { ref, handlers } = useDragArea((ratioX) => onPick({ h: ratioX * 360 }));

  const hue = Math.round(hsv.h) % 360;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      {/* Тон подписан числом, а не только положением ручки: «где-то в синем»
          не повторить и не записать. */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText variant="label" tone="muted" style={{ flex: 1 }}>
          Тон
        </AppText>
        <AppText variant="label" tone="muted">
          {hue}
        </AppText>
      </View>

      <View
        ref={ref}
        {...handlers}
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}: тон`}
        accessibilityValue={{ min: 0, max: 360, now: hue, text: `${hue} градусов` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          const shift = event.nativeEvent.actionName === 'increment' ? HUE_STEP : -HUE_STEP;
          onPick({ h: clamp(hue + shift, 0, 360) });
        }}
        focusable
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          // Полоса ниже зоны нажатия, поэтому отступы сверху и снизу: палец
          // должен попадать в неё, не целясь.
          paddingVertical: (theme.minTouchTarget - TRACK_HEIGHT) / 2,
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            height: TRACK_HEIGHT,
            borderRadius: theme.radius.md,
            overflow: 'hidden',
            borderWidth: focused ? theme.focusRingWidth : 1,
            borderColor: focused ? theme.colors.focus : theme.colors.border,
          }}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
                {/* Круг тонов, развёрнутый в ленту: от красного до красного. */}
                {[0, 60, 120, 180, 240, 300, 360].map((stop, index) => (
                  <Stop
                    key={stop}
                    offset={index / 6}
                    stopColor={hsvToHex({ h: stop, s: 100, v: 100 })}
                  />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradient})`} />
          </Svg>
        </View>

        <Thumb left={`${(hue / 360) * 100}%`} top="50%" />
      </View>
    </View>
  );
}

/**
 * Ручка в два кольца, белое внутри чёрного.
 *
 * Одноцветная терялась бы то на светлом краю, то на тёмном, а цвета темы здесь
 * брать нельзя: их человек прямо сейчас и правит.
 */
function Thumb({ left, top }: { left: DimensionValue; top: DimensionValue }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        // Ручка стоит центром на выбранной точке, а не углом от неё.
        marginLeft: -THUMB / 2,
        marginTop: -THUMB / 2,
        width: THUMB,
        height: THUMB,
        borderRadius: THUMB / 2,
        borderWidth: 1,
        borderColor: '#000000',
      }}
    >
      <View style={{ flex: 1, borderRadius: THUMB / 2, borderWidth: 2, borderColor: '#FFFFFF' }} />
    </View>
  );
}
