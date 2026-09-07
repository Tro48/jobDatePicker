import { useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { AppText } from './AppText.tsx';
import { Button } from './Button.tsx';
import { IconButton } from './IconButton.tsx';
import { useReduceMotion } from './useReduceMotion.ts';
import { useTheme } from '@/theme';

export interface HelpButtonProps {
  /** О чём подсказка: заголовок окна и имя кнопки для скринридера. */
  title: string;
  /**
   * Сам текст. Одна-две фразы: объяснению на полэкрана место в отдельном
   * экране помощи, а не во всплывающем окне.
   */
  text: string;
}

/**
 * Пояснение под вопросительным знаком.
 *
 * Экраны приложения были подписаны насквозь: под каждым переключателем стояла
 * строка, объясняющая, что он делает. Читают такое один раз, а место оно
 * занимает всегда — и то, что действительно нужно объяснить, тонуло среди
 * подписей вроде «так график подписан в списке». Поэтому объяснение уходит под
 * знак вопроса: на экране остаётся сам элемент, а текст приходит по нажатию.
 *
 * Окно, а не переход на отдельный экран: подсказка про один переключатель не
 * стоит того, чтобы уводить человека со страницы и возвращать обратно. Длинные
 * инструкции по-прежнему живут своим экраном — например «Будильник не звонит».
 */
export function HelpButton({ title, text }: HelpButtonProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        name="help-circle-outline"
        label={`Подсказка: ${title}`}
        accessibilityHint="Откроет пояснение"
        onPress={() => setOpen(true)}
      />

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть подсказку"
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: theme.spacing.lg,
            backgroundColor: '#00000099',
          }}
        >
          {/* Нажатие внутри окна не должно его закрывать. */}
          <Pressable
            accessibilityViewIsModal
            onPress={() => undefined}
            style={{
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
            }}
          >
            <AppText variant="heading" accessibilityRole="header">
              {title}
            </AppText>
            <AppText variant="body">{text}</AppText>
            <Button title="Понятно" variant="primary" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
