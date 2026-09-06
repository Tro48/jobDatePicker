import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import QRCode from 'qrcode';
import { AppText } from '@/ui';
import { useTheme } from '@/theme';

export interface QrCodeProps {
  /** Что кодируем: ссылка jobdatepicker://track?v=1&d=… */
  value: string;
  /** Сторона квадрата в пунктах. */
  size: number;
  /** Что скажет скринридер: сам код ему бесполезен. */
  label: string;
}

/**
 * QR-код одной фигурой.
 *
 * Модули складываются в единственный SVG-путь, а не в тысячу прямоугольников:
 * код двадцатой версии — это 97 на 97 модулей, то есть под девять тысяч
 * элементов, и рисовать их по отдельности на дешёвом телефоне нельзя.
 *
 * Цвета всегда чёрным по белому, независимо от темы: код снимает камера
 * другого телефона, и приглушённый серый по тёмному она не берёт. Белая
 * подложка нарисована явно — в тёмной теме без неё код оказался бы на тёмном
 * фоне экрана.
 */
export function QrCode({ value, size, label }: QrCodeProps) {
  const theme = useTheme();

  // Построение и путь считаются одним хуком: между ними нельзя выйти из
  // компонента, иначе на строке, которая не кодируется, порядок хуков поедет.
  const drawing = useMemo(() => {
    let code: QRCode.QRCode;
    try {
      // Коррекция L: строка и так на пределе читаемости, и лишние
      // восстанавливающие байты сделали бы код только крупнее.
      code = QRCode.create(value, { errorCorrectionLevel: 'L' });
    } catch {
      return null;
    }

    const { size: modules, data } = code.modules;
    // Тихая зона в четыре модуля обязательна по спецификации: без неё сканер
    // не находит границы кода.
    const quiet = 4;
    const parts: string[] = [];

    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (data[row * modules + column]) {
          parts.push(`M${column + quiet} ${row + quiet}h1v1h-1z`);
        }
      }
    }

    return { total: modules + quiet * 2, path: parts.join('') };
  }, [value]);

  if (!drawing) {
    return (
      <AppText variant="body" tone="muted">
        Код не получилось построить — поделись файлом.
      </AppText>
    );
  }

  const { total, path } = drawing;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ alignSelf: 'center', borderRadius: theme.radius.md, overflow: 'hidden' }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`}>
        <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
        <Path d={path} fill="#000000" />
      </Svg>
    </View>
  );
}
