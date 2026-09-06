import { Directory, File, Paths } from 'expo-file-system';
import { StorageAccessFramework as Saf } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Файлы наружу и обратно.
 *
 * Обёртка нужна ровно затем, чтобы весь разговор с файловой системой лежал в
 * одном месте: экраны знают про «отдать текст» и «взять текст», а не про
 * временные каталоги, MIME-типы и системный лист «Поделиться».
 *
 * Отдельного разрешения ничто здесь не требует: файл перед отправкой пишется во
 * временный каталог самого приложения, а выбор чужого файла и папки для
 * сохранения делает системный проводник — доступ он выдаёт сам и только на
 * выбранное.
 */

/** Куда складываются файлы перед отправкой. Каталог временный: система его чистит. */
function outbox(): Directory {
  const directory = new Directory(Paths.cache, 'share');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/**
 * Отдать текст файлом: приложение кладёт его во временный каталог и открывает
 * системный лист «Поделиться».
 *
 * Возвращает false, если делиться на этом устройстве нечем, — экран скажет об
 * этом словами вместо тишины после нажатия.
 */
export async function shareTextFile(
  fileName: string,
  text: string,
  mimeType: string,
): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;

  const file = new File(outbox(), fileName);
  // Каталог временный, но имя файла в нём повторяется от раза к разу: старый
  // файл надо перезаписать, иначе create упадёт на втором нажатии.
  if (file.exists) file.delete();
  file.create();
  file.write(text);

  await Sharing.shareAsync(file.uri, { mimeType, UTI: mimeType });
  return true;
}

/**
 * Чем кончилась попытка сохранить файл на устройство.
 *
 * Отказ и отмена разведены нарочно: человек, закрывший проводник, не должен
 * получать сообщение об ошибке — он передумал, а не сломал.
 */
export type SaveResult = 'saved' | 'canceled' | 'unsupported';

/**
 * Сохранить текст файлом туда, куда укажет человек.
 *
 * Через Storage Access Framework: системный проводник спрашивает папку и сам
 * выдаёт доступ только на неё. Разрешений на хранилище это не требует — те самые,
 * что вырезаны из сборки для магазина, остаются ненужными.
 */
export async function saveTextFile(
  fileName: string,
  text: string,
  mimeType: string,
): Promise<SaveResult> {
  // SAF — чисто андроидный механизм. На всём остальном остаётся «Поделиться».
  if (Platform.OS !== 'android') return 'unsupported';

  const permission = await Saf.requestDirectoryPermissionsAsync();
  if (!permission.granted) return 'canceled';

  // Имя без расширения: его допишет сама система по типу файла. Отдать
  // его вместе с расширением — получить «kopiya.json.json».
  const uri = await Saf.createFileAsync(permission.directoryUri, baseName(fileName), mimeType);
  await Saf.writeAsStringAsync(uri, text);
  return 'saved';
}

/** Имя без последнего расширения: «kopiya-2026-09-06.json» → «kopiya-2026-09-06». */
function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Отдать готовый файл по его адресу — так уходит PDF, собранный expo-print. */
export async function shareExistingFile(uri: string, mimeType: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
  return true;
}

export interface PickedFile {
  name: string;
  text: string;
}

/**
 * Взять текстовый файл через системный проводник.
 *
 * null — человек передумал и закрыл проводник: это не ошибка, и говорить о ней
 * ничего не надо.
 */
export async function pickTextFile(
  mimeTypes: string[] = ['application/json'],
): Promise<PickedFile | null> {
  const picked = await File.pickFileAsync({ mimeTypes });
  if (picked.canceled) return null;

  return { name: picked.result.name, text: await picked.result.text() };
}
