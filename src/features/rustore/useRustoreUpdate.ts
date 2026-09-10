import { useCallback, useEffect, useState } from 'react';
import { checkUpdate, hasUpdate, runUpdate } from './client.ts';

export interface RustoreUpdateState {
  /** Есть ли в магазине версия свежее установленной. */
  available: boolean;
  /** Номер сборки в магазине — им отличают «обновление есть» от «показалось». */
  versionCode: number | null;
  /** Запустить установку. Возвращает false, если RuStore отказал. */
  install: () => Promise<boolean>;
}

/**
 * Есть ли обновление в RuStore.
 *
 * Спрашивается один раз при появлении экрана и больше не переспрашивается:
 * приложение обновляется не чаще раза в месяц, а поход в магазин на каждый
 * заход в настройки — это трафик и задержка ради ответа, который почти всегда
 * «нет».
 *
 * Ошибки сюда не приходят: клиент отвечает `null` и на отсутствие RuStore, и
 * на отказ, и на сборку не для магазина. Показывать нечего — карточка просто
 * не появится.
 */
export function useRustoreUpdate(): RustoreUpdateState {
  const [available, setAvailable] = useState(false);
  const [versionCode, setVersionCode] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    void checkUpdate().then((info) => {
      // Экран мог закрыться, пока ходили в магазин: обновлять состояние
      // размонтированного компонента незачем.
      if (!alive || !hasUpdate(info)) return;
      setAvailable(true);
      setVersionCode(info?.availableVersionCode ?? null);
    });

    return () => {
      alive = false;
    };
  }, []);

  const install = useCallback(async () => {
    const started = await runUpdate();
    // Экран RuStore перекрывает приложение и сам ставит APK: после успешного
    // запуска карточке предлагать больше нечего.
    if (started) setAvailable(false);
    return started;
  }, []);

  return { available, versionCode, install };
}
