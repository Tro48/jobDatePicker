import { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Что известно про новую сборку APK.
 *
 * По воздуху приезжает только JS: нативный код Android разрешает менять
 * исключительно установкой подписанного APK. Значит, приложению нужен внешний
 * список выпусков, иначе оно молча останется на старом отпечатке и человек не
 * поймёт, почему правки не приезжают.
 */
export interface ReleaseManifest {
  /** Отпечаток нативной части последней сборки. */
  runtimeVersion: string;
  /** Прямая ссылка на APK. */
  url: string;
  version?: string;
  /** Когда собран APK. Показывается рядом с версией, чтобы было видно, что приехало. */
  builtAt?: string;
}

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
  | { kind: 'failed'; message: string };

export interface AppUpdateState {
  status: UpdateStatus;
  /** Отпечаток нативной части этой сборки. null в отладочной сборке. */
  runtimeVersion: string | null;
  channel: string | null;
  /** Когда собран установленный сейчас JS-бандл. */
  bundleCreatedAt: Date | null;
  /** Вышла сборка с другой нативной частью — по воздуху её не доставить. */
  newBuild: ReleaseManifest | null;
  check: () => void;
  apply: () => void;
}

/** Список выпусков не должен подвешивать экран, если сеть недоступна. */
const MANIFEST_TIMEOUT_MS = 5000;

function manifestUrl(): string | null {
  const value = Constants.expoConfig?.extra?.releaseManifestUrl;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function loadManifest(): Promise<ReleaseManifest | null> {
  const url = manifestUrl();
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<ReleaseManifest>;
    if (typeof data.runtimeVersion !== 'string' || typeof data.url !== 'string') return null;
    // Схема проверяется, а не только тип: ссылку приложение отдаёт наружу через
    // Linking.openURL, а тот на Android открывает и intent://, и схемы чужих
    // приложений. Список выпусков приходит из сети — верить ему на слово нельзя.
    if (!data.url.startsWith('https://')) return null;

    return {
      runtimeVersion: data.runtimeVersion,
      url: data.url,
      version: data.version,
      builtAt: data.builtAt,
    };
  } catch {
    // Нет сети или список выпусков не настроен — это не ошибка приложения.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Обновления приложения: JS по воздуху и сигнал о новой сборке APK.
 *
 * Проверка руками, а не при каждом запуске: обновление и так скачивается в
 * фоне при старте, а кнопка нужна, чтобы получить его немедленно и увидеть
 * результат, а не гадать.
 */
export function useAppUpdate(): AppUpdateState {
  const [status, setStatus] = useState<UpdateStatus>(() =>
    Updates.isEnabled ? { kind: 'idle' } : { kind: 'disabled' },
  );
  const [newBuild, setNewBuild] = useState<ReleaseManifest | null>(null);

  const checkNewBuild = useCallback(async () => {
    // Отпечатка нет только в отладочной сборке: сравнивать не с чем, а звать
    // человека ставить рабочий APK поверх отладочного — вредный совет.
    if (!Updates.runtimeVersion) return;

    const manifest = await loadManifest();
    // Отпечаток совпал — установлена свежая нативная часть.
    setNewBuild(manifest && manifest.runtimeVersion !== Updates.runtimeVersion ? manifest : null);
  }, []);

  useEffect(() => {
    void checkNewBuild();
  }, [checkNewBuild]);

  const check = useCallback(() => {
    if (!Updates.isEnabled) return;

    setStatus({ kind: 'checking' });
    void (async () => {
      try {
        const result = await Updates.checkForUpdateAsync();
        await checkNewBuild();

        if (!result.isAvailable) {
          setStatus({ kind: 'current' });
          return;
        }
        setStatus({ kind: 'downloading' });
        await Updates.fetchUpdateAsync();
        setStatus({ kind: 'ready' });
      } catch (error) {
        setStatus({
          kind: 'failed',
          message: error instanceof Error ? error.message : 'Не удалось проверить обновление',
        });
      }
    })();
  }, [checkNewBuild]);

  const apply = useCallback(() => {
    void Updates.reloadAsync();
  }, []);

  return {
    status,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    bundleCreatedAt: Updates.createdAt,
    newBuild,
    check,
    apply,
  };
}
