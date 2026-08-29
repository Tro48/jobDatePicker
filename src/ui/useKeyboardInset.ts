import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Высота системной клавиатуры, ноль — когда она убрана.
 *
 * Нужна потому, что с Android 15 приложение всегда рисуется под системными
 * панелями, и старый `adjustResize` окно больше не ужимает: клавиатура
 * выезжает поверх содержимого и накрывает то самое поле, в которое нажали.
 * Значит, ужимать область должен сам интерфейс.
 *
 * События `keyboardDidShow`/`keyboardDidHide`, а не `WillShow`: на Android
 * «will»-варианты не приходят вовсе.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) =>
      setInset(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () => setInset(0));

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return inset;
}
