import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';

/**
 * Сколько ждать, если переход почему-то не состоялся. Замок снимается по
 * возврату фокуса, но без страховки залипшая блокировка сделала бы экран
 * мёртвым до перезапуска.
 */
const RELEASE_MS = 1500;

/**
 * Переход, который нельзя запустить дважды одним жестом.
 *
 * Двойное нажатие по дате открывало карточку дня двумя экранами подряд: оба
 * нажатия успевают отработать до того, как навигация сменит экран. Замок
 * снимается, когда пользователь возвращается назад.
 */
export function useGuardedPush(): (href: Href) => void {
  const router = useRouter();
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    locked.current = false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useFocusEffect(release);
  useEffect(() => release, [release]);

  return useCallback(
    (href: Href) => {
      if (locked.current) return;
      locked.current = true;
      timer.current = setTimeout(release, RELEASE_MS);
      router.push(href);
    },
    [router, release],
  );
}
