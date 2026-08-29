import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/**
 * Генератор иконок приложения.
 *
 * Иконка рисуется кодом, а не лежит бинарником неизвестного происхождения:
 * так её можно поправить в цвете и в пропорциях, а не перерисовывать заново,
 * и видно, из чего она собрана. Внешних зависимостей нет — PNG собирается
 * вручную поверх zlib из стандартной библиотеки.
 *
 * Запуск: npm run icons
 */

// ---------------------------------------------------------------- PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // бит на канал
  header[9] = 6; // RGBA
  // Каждая строка предваряется байтом фильтра: 0 — «без фильтра».
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- Растр

type Rgb = [number, number, number];

/** Знаковое расстояние до фигуры: отрицательное внутри, в пикселях. */
type Sdf = (x: number, y: number) => number;

interface Op {
  sdf: Sdf;
  color: Rgb;
  /** Вырезать вместо заливки: так в монохромной иконке появляются клетки. */
  erase?: boolean;
}

function hex(value: string): Rgb {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

/** Прямоугольник со скруглёнными углами. */
function roundBox(cx: number, cy: number, w: number, h: number, r: number): Sdf {
  const hw = w / 2;
  const hh = h / 2;
  const radius = Math.min(r, hw, hh);
  return (x, y) => {
    const qx = Math.abs(x - cx) - (hw - radius);
    const qy = Math.abs(y - cy) - (hh - radius);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    return outside + Math.min(Math.max(qx, qy), 0) - radius;
  };
}

/** Объединение фигур: нужно, чтобы шапка была скруглена только сверху. */
function union(...shapes: Sdf[]): Sdf {
  return (x, y) => Math.min(...shapes.map((shape) => shape(x, y)));
}

function render(size: number, background: Rgb | null, ops: Op[]): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      let [r, g, b] = background ?? [0, 0, 0];
      let alpha = background ? 1 : 0;

      for (const op of ops) {
        // Сглаживание из самого расстояния: доля пикселя внутри фигуры.
        const coverage = Math.min(Math.max(0.5 - op.sdf(px, py), 0), 1);
        if (coverage <= 0) continue;

        if (op.erase) {
          alpha *= 1 - coverage;
          continue;
        }
        r = op.color[0] * coverage + r * (1 - coverage);
        g = op.color[1] * coverage + g * (1 - coverage);
        b = op.color[2] * coverage + b * (1 - coverage);
        alpha = coverage + alpha * (1 - coverage);
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(r);
      pixels[offset + 1] = Math.round(g);
      pixels[offset + 2] = Math.round(b);
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

// ------------------------------------------------------------ Иконка

const DARK_BACKGROUND = hex('#0F1115');
const WHITE = hex('#FFFFFF');

/** Раскраска календаря. Светлый лист — для тёмного фона, тёмный — для светлого. */
interface Palette {
  sheet: Rgb;
  header: Rgb;
  ring: Rgb;
  cell: Rgb;
  day: Rgb;
  night: Rgb;
}

/** Лист бумаги на тёмном фоне: иконка приложения и заставка тёмной темы. */
const ON_DARK: Palette = {
  sheet: hex('#F5F7FA'),
  header: hex('#1D4ED8'),
  ring: hex('#C7D2E5'),
  cell: hex('#D5DCE8'),
  day: hex('#1D4ED8'),
  night: hex('#6D28D9'),
};

/**
 * Отладочное приложение стоит на телефоне рядом с рабочим, поэтому иконка у
 * него другая: янтарная шапка вместо синей. Различать две одинаковые иконки по
 * подписи под ними — гарантированно запускать не то.
 */
const ON_DEV: Palette = {
  ...ON_DARK,
  header: hex('#D97706'),
  day: hex('#D97706'),
};

/**
 * Тот же календарь для белого фона: светлый лист на белом не виден, поэтому
 * лист тёмный, а клетки — цвета смен из тёмной темы приложения.
 */
const ON_LIGHT: Palette = {
  sheet: hex('#14161A'),
  header: hex('#1D4ED8'),
  ring: hex('#5A6270'),
  cell: hex('#39404E'),
  day: hex('#93B4FF'),
  night: hex('#C4B5FD'),
};

/**
 * Раскладка клеток — настоящий график 2/2 день-ночь: две дневные, два
 * выходных, две ночные. Иконка показывает ровно то, чем занято приложение.
 */
const GRID: Array<Array<'day' | 'night' | 'off'>> = [
  ['day', 'day', 'off'],
  ['off', 'night', 'night'],
  ['off', 'off', 'day'],
];

/**
 * Слои иконки. glyph — доля стороны, которую занимает рисунок: у адаптивной
 * иконки Android обрезает края, поэтому там он меньше.
 */
function calendarOps(size: number, glyph: number, palette: Palette | null): Op[] {
  // palette === null — монохромный силуэт: цвета нет, клетки вырезаются.
  const mono = palette === null;
  const g = size * glyph;
  const cx = size / 2;
  const cy = size / 2;

  const sheetW = 0.92 * g;
  const sheetH = 1.0 * g;
  const sheetTop = cy - sheetH / 2 + 0.05 * g;
  const radius = 0.13 * g;
  const sheet = roundBox(cx, sheetTop + sheetH / 2, sheetW, sheetH, radius);

  const headerH = 0.22 * g;
  const header = union(
    roundBox(cx, sheetTop + headerH / 2, sheetW, headerH, radius),
    // Нижняя половина шапки прямая: скруглять её снизу нечем.
    roundBox(cx, sheetTop + headerH * 0.75, sheetW, headerH / 2, 0),
  );

  const ringW = 0.1 * g;
  const ringH = 0.2 * g;
  const ringY = sheetTop - 0.02 * g;
  const rings: Op[] = [-1, 1].map((side) => ({
    sdf: roundBox(cx + side * 0.26 * g, ringY, ringW, ringH, ringW / 2),
    color: mono ? WHITE : palette.ring,
  }));

  const cellW = 0.18 * g;
  const cellH = 0.14 * g;
  const gapX = 0.075 * g;
  const gapY = 0.065 * g;
  const gridW = 3 * cellW + 2 * gapX;
  const gridTop = sheetTop + headerH + 0.095 * g;

  const cells: Op[] = [];
  GRID.forEach((row, rowIndex) => {
    row.forEach((kind, columnIndex) => {
      const x = cx - gridW / 2 + cellW / 2 + columnIndex * (cellW + gapX);
      const y = gridTop + cellH / 2 + rowIndex * (cellH + gapY);
      cells.push({
        sdf: roundBox(x, y, cellW, cellH, 0.035 * g),
        color: mono
          ? WHITE
          : kind === 'day'
            ? palette.day
            : kind === 'night'
              ? palette.night
              : palette.cell,
        // В монохромной иконке цвета нет: клетки вырезаются насквозь.
        erase: mono,
      });
    });
  });

  if (mono) {
    return [...rings, { sdf: sheet, color: WHITE }, ...cells];
  }
  return [
    ...rings,
    { sdf: sheet, color: palette.sheet },
    { sdf: header, color: palette.header },
    ...cells,
  ];
}

const SIZE = 1024;

const files: Array<{ name: string; pixels: Uint8Array }> = [
  {
    name: 'icon.png',
    pixels: render(SIZE, DARK_BACKGROUND, calendarOps(SIZE, 0.62, ON_DARK)),
  },
  {
    // Адаптивная иконка: система обрезает края маской, рисунок держится
    // внутри безопасной зоны в две трети стороны.
    name: 'android-icon-foreground.png',
    pixels: render(SIZE, null, calendarOps(SIZE, 0.5, ON_DARK)),
  },
  {
    name: 'android-icon-background.png',
    pixels: render(SIZE, DARK_BACKGROUND, []),
  },
  {
    // Тематическая иконка Android 13+: система красит силуэт сама, поэтому
    // здесь важна только альфа.
    name: 'android-icon-monochrome.png',
    pixels: render(SIZE, null, calendarOps(SIZE, 0.5, null)),
  },
  {
    // Отладочное приложение: та же иконка с янтарной шапкой.
    name: 'icon-dev.png',
    pixels: render(SIZE, DARK_BACKGROUND, calendarOps(SIZE, 0.62, ON_DEV)),
  },
  {
    name: 'android-icon-foreground-dev.png',
    pixels: render(SIZE, null, calendarOps(SIZE, 0.5, ON_DEV)),
  },
  {
    // Заставка: Android 12+ обрезает картинку кругом, поэтому запас по краям
    // тот же, что у адаптивной иконки.
    name: 'splash-icon.png',
    pixels: render(SIZE, null, calendarOps(SIZE, 0.5, ON_LIGHT)),
  },
  {
    name: 'splash-icon-dark.png',
    pixels: render(SIZE, null, calendarOps(SIZE, 0.5, ON_DARK)),
  },
];

for (const file of files) {
  writeFileSync(new URL(`../assets/${file.name}`, import.meta.url), encodePng(SIZE, file.pixels));
  console.log(`assets/${file.name}`);
}
