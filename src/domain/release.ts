/**
 * Список выпусков APK: то, что приложение читает из сети.
 *
 * По воздуху приезжает только JS. Нативный код Android разрешает менять
 * исключительно установкой подписанного APK, поэтому приложению нужен внешний
 * файл с отпечатком последней сборки — иначе оно молча останется на старом и
 * человек не поймёт, почему правки не приезжают.
 */
export interface ReleaseManifest {
  /** Отпечаток нативной части последней сборки. */
  runtimeVersion: string;
  /** Прямая ссылка на APK. */
  url: string;
  version?: string;
  /** Когда собран APK. Показывается рядом с версией, чтобы было видно, что приехало. */
  builtAt?: string;
  /** Заголовок последней записи «что нового»: его кладёт в файл сборка. */
  notes?: string;
}

/**
 * Разбор списка выпусков.
 *
 * Проверяется не только тип, но и схема ссылки: приложение отдаёт её наружу
 * через Linking.openURL, а тот на Android открывает и intent://, и схемы чужих
 * приложений. Файл приходит из сети — верить ему на слово нельзя.
 *
 * Отдельно от загрузки, чтобы проверку можно было прогнать тестами, а не
 * выяснять на телефоне.
 */
export function parseReleaseManifest(data: unknown): ReleaseManifest | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = data as Partial<Record<keyof ReleaseManifest, unknown>>;

  if (typeof value.runtimeVersion !== 'string' || value.runtimeVersion.length === 0) return null;
  if (typeof value.url !== 'string' || !value.url.startsWith('https://')) return null;

  const optional = (field: unknown): string | undefined =>
    typeof field === 'string' && field.length > 0 ? field : undefined;

  return {
    runtimeVersion: value.runtimeVersion,
    url: value.url,
    version: optional(value.version),
    builtAt: optional(value.builtAt),
    notes: optional(value.notes),
  };
}

/**
 * Вышла ли сборка новее установленной.
 *
 * Сравниваются отпечатки, а не версии: версия поднимается на каждом выпуске, в
 * том числе на тех, что уехали по воздуху, а установки APK требует только
 * разошедшийся отпечаток. Пустой отпечаток — это отладочная сборка, ей сравнивать
 * не с чем.
 */
export function isNewerBuild(
  manifest: ReleaseManifest | null,
  runtimeVersion: string | null,
): boolean {
  if (!manifest || !runtimeVersion) return false;
  return manifest.runtimeVersion !== runtimeVersion;
}
