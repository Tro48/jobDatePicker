import { payloadFromFile } from '@/domain/share.ts';
import { pickTextFile } from '@/features/backup/files.ts';

/**
 * Выбрать файл и понять, график ли это.
 *
 * Один вход на два экрана: график принимают и из карточки «Данные», где рядом
 * лежит резервная копия, и прямо в окне нового графика, где копию открывать
 * незачем. Разбор общий, а что делать с «не графиком», решает вызывающий: в
 * одном месте это копия, в другом — ошибка.
 */
export type PickedShareFile =
  /** Проводник закрыли, не выбрав ничего. Это не ошибка, говорить нечего. */
  | { kind: 'canceled' }
  /** Присланный график: данные для экрана предпросмотра. */
  | { kind: 'track'; payload: string }
  /** Файл прочитан, но графиком не является. */
  | { kind: 'other'; text: string }
  | { kind: 'error'; message: string };

export async function pickShareFile(): Promise<PickedShareFile> {
  let picked;
  try {
    picked = await pickTextFile();
  } catch {
    return { kind: 'error', message: 'Не получилось открыть файл. Попробуй выбрать его ещё раз.' };
  }
  if (!picked) return { kind: 'canceled' };

  const payload = payloadFromFile(picked.text);
  return payload === null ? { kind: 'other', text: picked.text } : { kind: 'track', payload };
}
