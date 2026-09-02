import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';
import { classifyUpdateError } from './updateError.ts';
import type { UpdateFailure } from './updateError.ts';

export type UpdateStatus =
  /** Модуль выключен: отладочная сборка берёт JS с Metro. */
  | { kind: 'disabled' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading' }
  /** Обновление скачано, применится после перезапуска. */
  | { kind: 'ready' }
  /** Проверили — обновлять нечего. */
  | { kind: 'current' }
  /** Причина, а не текст ошибки: что показать человеку, решает карточка. */
  | { kind: 'failed'; reason: UpdateFailure };

export interface AppUpdateState {
  status: UpdateStatus;
  /** Отпечаток нативной части этой сборки. null в отладочной сборке. */
  runtimeVersion: string | null;
  channel: string | null;
  /** Когда собран установленный сейчас JS-бандл. */
  bundleCreatedAt: Date | null;
  check: () => void;
  apply: () => void;
}

/**
 * Обновление по воздуху: только JS. Про вышедшую сборку APK знает
 * useBuildSignal — это другой канал доставки и другой источник данных.
 *
 * Проверка руками, а не при каждом запуске: обновление и так скачивается в
 * фоне при старте, а кнопка нужна, чтобы получить его немедленно и увидеть
 * результат, а не гадать.
 */
export function useAppUpdate(): AppUpdateState {
  const [status, setStatus] = useState<UpdateStatus>(() =>
    Updates.isEnabled ? { kind: 'idle' } : { kind: 'disabled' },
  );

  const check = useCallback(() => {
    if (!Updates.isEnabled) return;

    setStatus({ kind: 'checking' });
    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();

        if (!result.isAvailable) {
          setStatus({ kind: 'current' });
          return;
        }
        setStatus({ kind: 'downloading' });
        await Updates.fetchUpdateAsync();
        setStatus({ kind: 'ready' });
      } catch (error) {
        setStatus({ kind: 'failed', reason: classifyUpdateError(error) });
      }
    })();
  }, []);

  const apply = useCallback(() => {
    void Updates.reloadAsync();
  }, []);

  return {
    status,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    bundleCreatedAt: Updates.createdAt,
    check,
    apply,
  };
}
