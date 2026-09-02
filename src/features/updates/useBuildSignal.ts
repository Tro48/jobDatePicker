import { useCallback, useEffect } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { isNewerBuild, parseReleaseManifest } from '@/domain/release.ts';
import type { ReleaseManifest } from '@/domain/release.ts';
import { useAppStore } from '@/data/store.ts';

/** Список выпусков не должен подвешивать экран, если сеть недоступна. */
const MANIFEST_TIMEOUT_MS = 5000;

/**
 * Как часто ходить за списком выпусков само по себе.
 *
 * Реже, чем открывается календарь: сборки выходят раз в недели, а запрос на
 * каждом запуске — это трафик и задержка ради новости, которая почти всегда
 * «ничего не изменилось». Кнопка в настройках проверяет немедленно.
 */
const REFRESH_MS = 6 * 60 * 60 * 1000;

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
    return parseReleaseManifest(await response.json());
  } catch {
    // Нет сети или список выпусков не настроен — это не ошибка приложения.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface BuildSignal {
  /** Вышедшая сборка новее установленной, или null. */
  build: ReleaseManifest | null;
  /** Показывать ли про неё полоску: про эту сборку человек ещё не сказал «понял». */
  notice: boolean;
  dismiss: () => void;
  /** Сходить за списком выпусков. force — ручная проверка, расписание не смотрим. */
  refresh: (options?: { force?: boolean }) => Promise<void>;
}

/**
 * Вышла ли сборка APK, которую надо ставить руками.
 *
 * Результат живёт в хранилище, а не в состоянии экрана: про новую сборку
 * должны знать и календарь, и настройки, а спрашивать сеть дважды незачем.
 * Это единственный канал доставки, который сам до телефона не доезжает, —
 * поэтому про него и говорит полоска на главном экране.
 */
export function useBuildSignal(): BuildSignal {
  const check = useAppStore((state) => state.buildCheck);
  const markBuildChecked = useAppStore((state) => state.markBuildChecked);
  const setKnownBuild = useAppStore((state) => state.setKnownBuild);
  const dismissBuildNotice = useAppStore((state) => state.dismissBuildNotice);
  const allowBuildNotice = useAppStore((state) => state.allowBuildNotice);

  const refresh = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      // Отпечатка нет только в отладочной сборке: сравнивать не с чем, а звать
      // человека ставить рабочий APK поверх отладочного — вредный совет.
      if (!Updates.runtimeVersion) return;

      const now = Date.now();
      // Отметка ставится до запроса, а не после: два экрана, смонтированные
      // разом, не должны сходить в сеть дважды. Неудачная попытка тоже
      // считается — иначе без сети каждый переход между вкладками начинал бы
      // новый запрос и ждал пять секунд до отмены.
      if (!force && now - useAppStore.getState().buildCheck.checkedAt < REFRESH_MS) return;
      markBuildChecked(now);

      // Ручная проверка снимает молчание: человек сам спросил про обновления,
      // значит, полоску он снова хочет видеть.
      if (force) allowBuildNotice();

      const manifest = await loadManifest();
      // Список выпусков не прочитался — оставляем то, что знали. Иначе уход в
      // самолётный режим стирал бы уже найденную сборку, и человек про неё
      // забывал бы вместе с приложением.
      if (!manifest) return;

      setKnownBuild(isNewerBuild(manifest, Updates.runtimeVersion) ? manifest : null);
    },
    [markBuildChecked, setKnownBuild, allowBuildNotice],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const build = check.build;

  return {
    build,
    notice: build !== null && build.runtimeVersion !== check.dismissedRuntime,
    dismiss: dismissBuildNotice,
    refresh,
  };
}
