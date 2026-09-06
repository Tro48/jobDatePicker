import type { ReactNode } from 'react';
import { useWidgetSync } from './useWidgetSync.ts';

/**
 * Выкладка снимка для виджета живёт в корне навигации, как и синхронизация
 * будильников.
 *
 * Иначе снимок обновлялся бы только после захода на нужную вкладку: вкладки
 * монтируются лениво, и приложение, открытое ради сводки, оставило бы виджет
 * со вчерашним месяцем.
 */
export function WidgetSyncProvider({ children }: { children: ReactNode }) {
  useWidgetSync();
  return <>{children}</>;
}
