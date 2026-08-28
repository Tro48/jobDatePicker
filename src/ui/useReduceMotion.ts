import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Включён ли системный режим уменьшения движения.
 *
 * Подписка обязательна, а не однократное чтение: пользователь может включить
 * настройку, не закрывая приложение, и анимации должны выключиться сразу.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
