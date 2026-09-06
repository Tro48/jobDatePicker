/**
 * Компактная упаковка данных в байты и обратно.
 *
 * Нужна ради QR-кода: JSON того же состояния занимает двадцать килобайт, а
 * упакованное — полкилобайта, и разница здесь не в сжатии, а в способе укладки.
 * Ключи полей не хранятся вовсе — порядок задан версией формата; даты идут
 * дельтами; тип смены — индексом в один байт вместо строки «st-3».
 *
 * Своя реализация UTF-8 и base64, а не глобальные TextEncoder и btoa: в Hermes
 * их наличие зависит от версии React Native, а формат обмена не должен
 * ломаться от обновления рантайма. Заодно всё это гоняется тестами в обычном
 * Node без единой заглушки.
 */

/** Байты кончились раньше, чем формат: обрезанный или битый код. */
export class ByteReadError extends Error {
  constructor(message = 'Данные оборваны') {
    super(message);
    this.name = 'ByteReadError';
  }
}

export class ByteWriter {
  private parts: number[] = [];

  u8(value: number): void {
    this.parts.push(value & 0xff);
  }

  u16(value: number): void {
    this.parts.push((value >>> 8) & 0xff, value & 0xff);
  }

  /**
   * Число переменной длины: маленькие значения занимают один байт.
   *
   * Так уложены счётчики, минуты и дельты дат — почти все они меньше 128, и
   * платить за них четырьмя байтами в коде, который снимают камерой, нельзя.
   */
  varint(value: number): void {
    let rest = Math.max(0, Math.round(value));
    while (rest >= 0x80) {
      this.parts.push((rest & 0x7f) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.parts.push(rest);
  }

  /** Число со знаком: зигзаг превращает −1 в 1, 1 в 2 и так далее. */
  signed(value: number): void {
    const rounded = Math.round(value);
    this.varint(rounded < 0 ? -rounded * 2 - 1 : rounded * 2);
  }

  /** Строка: длина в байтах, затем сами байты UTF-8. */
  text(value: string): void {
    const bytes = encodeUtf8(value);
    this.varint(bytes.length);
    for (const byte of bytes) this.parts.push(byte);
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

export class ByteReader {
  private offset = 0;
  // Поле объявлено отдельно, а не параметром конструктора: доменные тесты
  // бегут в голом Node, а он такого сокращения не понимает.
  private readonly source: Uint8Array;

  constructor(source: Uint8Array) {
    this.source = source;
  }

  private next(): number {
    if (this.offset >= this.source.length) throw new ByteReadError();
    return this.source[this.offset++];
  }

  u8(): number {
    return this.next();
  }

  u16(): number {
    return (this.next() << 8) | this.next();
  }

  varint(): number {
    let result = 0;
    let shift = 1;
    for (let step = 0; step < 8; step += 1) {
      const byte = this.next();
      result += (byte & 0x7f) * shift;
      if ((byte & 0x80) === 0) return result;
      shift *= 0x80;
    }
    throw new ByteReadError('Слишком длинное число');
  }

  signed(): number {
    const value = this.varint();
    return value % 2 === 0 ? value / 2 : -(value + 1) / 2;
  }

  text(): string {
    const length = this.varint();
    if (this.offset + length > this.source.length) throw new ByteReadError();
    const slice = this.source.subarray(this.offset, this.offset + length);
    this.offset += length;
    return decodeUtf8(slice);
  }

  /** Все ли байты разобраны. Хвост — признак того, что формат разошёлся. */
  get done(): boolean {
    return this.offset >= this.source.length;
  }
}

export function encodeUtf8(value: string): Uint8Array {
  const out: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);

    // Суррогатная пара — один символ вне базовой плоскости: эмодзи в названии
    // смены не должно превращаться в два вопросительных знака.
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = (code - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        index += 1;
      }
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return Uint8Array.from(out);
}

export function decodeUtf8(bytes: Uint8Array): string {
  let result = '';

  for (let index = 0; index < bytes.length;) {
    const first = bytes[index];
    let code: number;
    let size: number;

    if (first < 0x80) {
      code = first;
      size = 1;
    } else if ((first & 0xe0) === 0xc0) {
      code = first & 0x1f;
      size = 2;
    } else if ((first & 0xf0) === 0xe0) {
      code = first & 0x0f;
      size = 3;
    } else if ((first & 0xf8) === 0xf0) {
      code = first & 0x07;
      size = 4;
    } else {
      throw new ByteReadError('Испорченный текст');
    }

    if (index + size > bytes.length) throw new ByteReadError('Испорченный текст');
    for (let part = 1; part < size; part += 1) {
      const byte = bytes[index + part];
      if ((byte & 0xc0) !== 0x80) throw new ByteReadError('Испорченный текст');
      code = (code << 6) | (byte & 0x3f);
    }
    index += size;

    if (code > 0xffff) {
      const rest = code - 0x10000;
      result += String.fromCharCode(0xd800 + (rest >> 10), 0xdc00 + (rest & 0x3ff));
    } else {
      result += String.fromCharCode(code);
    }
  }

  return result;
}

/**
 * Алфавит base64url: без «+», «/» и «=».
 *
 * Именно url-вариант, а не обычный base64: строка уезжает в ссылку
 * jobdatepicker://track?v=1&d=…, которую системная камера Android отдаёт
 * приложению как есть. Обычный base64 в ссылке пришлось бы экранировать, и от
 * экономии не осталось бы ничего.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeBase64Url(bytes: Uint8Array): string {
  let result = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : null;
    const c = index + 2 < bytes.length ? bytes[index + 2] : null;

    result += ALPHABET[a >> 2];
    result += ALPHABET[((a & 0x03) << 4) | (b === null ? 0 : b >> 4)];
    if (b === null) break;
    result += ALPHABET[((b & 0x0f) << 2) | (c === null ? 0 : c >> 6)];
    if (c === null) break;
    result += ALPHABET[c & 0x3f];
  }

  return result;
}

export function decodeBase64Url(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new ByteReadError('В коде есть посторонние символы');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(out);
}
