import { useEffect, useState } from 'react';

/** Подписи о времени точнее минуты не бывают — чаще будить React незачем. */
const MINUTE_MS = 60_000;

/**
 * Текущий момент, который обновляется сам.
 *
 * Нужен строкам вида «звонок через 8 ч 20 мин»: `Date.now()` в теле рендера
 * считается один раз и после этого врёт, пока экран не перерисуется по другой
 * причине. Строка, которая показывает время и не меняется, читается как
 * зависшая.
 */
export function useNow(intervalMs: number = MINUTE_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
