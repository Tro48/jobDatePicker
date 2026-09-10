import Constants from 'expo-constants';

/**
 * Собрана ли эта сборка для магазина.
 *
 * Флаг ставит `app.config.ts` по переменной профиля `rustore`. Признак нужен в
 * трёх местах сразу — канал обновлений, ссылка «о приложении» и инструменты
 * RuStore, — поэтому живёт отдельным модулем, а не копией условия в каждом.
 */
export function forStore(): boolean {
  return Constants.expoConfig?.extra?.distribution === 'rustore';
}
