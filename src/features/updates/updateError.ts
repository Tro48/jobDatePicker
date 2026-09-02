/**
 * Почему не получилось проверить обновление.
 *
 * Причин ровно столько, сколько разных советов можно дать человеку: сеть он
 * починит сам, всё остальное — нет. Дробить дальше незачем: expo-updates
 * возвращает английские технические строки, и на экране настроек им делать
 * нечего.
 */
export type UpdateFailure = 'network' | 'unknown';

/**
 * Признаки того, что до сервера обновлений просто не дошёл запрос.
 *
 * Разбор идёт по тексту ошибки: expo-updates не даёт ни кодов, ни типов, а
 * NetInfo — это ещё одна нативная зависимость и пересборка APK ради одной
 * строки на экране. Не опознали — покажем общий текст, он тоже верный.
 */
const NETWORK_MARKERS = [
  'network',
  'internet',
  'offline',
  'unreachable',
  'timeout',
  'timed out',
  'connection',
  'econnrefused',
  'enotfound',
  'unable to resolve host',
  'failed to fetch',
  'could not connect',
];

export function classifyUpdateError(error: unknown): UpdateFailure {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lowered = message.toLowerCase();
  return NETWORK_MARKERS.some((marker) => lowered.includes(marker)) ? 'network' : 'unknown';
}

/**
 * Что видит человек. Техническая строка сюда не попадает: она на английском,
 * ничего не объясняет и выглядит как поломка приложения.
 */
export const UPDATE_FAILURE_TEXT: Record<UpdateFailure, string> = {
  network: 'Не получилось связаться с сервером обновлений. Проверь интернет и попробуй ещё раз.',
  unknown: 'Не удалось проверить обновление. Попробуй позже.',
};
