import { Linking } from 'react-native';
import { Button } from '@/ui';
import { askForReview } from './client.ts';
import { forStore } from './distribution.ts';

/** Карточка приложения в магазине: туда уходим, когда встроенная форма недоступна. */
const STORE_URL = 'https://www.rustore.ru/catalog/app/com.trofimdev.jobdatepicker';

/**
 * «Оценить приложение» — встроенная форма оценки RuStore.
 *
 * Ответы конкурентам под отзывами и сами отзывы — то, чем карточки с рейтингом
 * 4,8 отличаются от карточек с 3,4, поэтому спросить оценку стоит. Но спросить
 * один раз и в спокойном месте: кнопка живёт в карточке поддержки на «Сводке»,
 * которую открывают раз в месяц, и никогда не всплывает сама.
 *
 * Отказ формы — обычное дело: RuStore сам решает, спрашивать ли этого человека,
 * и молчит, если недавно уже спрашивал. Тогда открывается карточка приложения
 * в магазине — оценку там можно поставить руками, а нажатие без ответа
 * выглядело бы поломкой.
 *
 * Вне сборки для магазина кнопки нет вовсе: вести человека в RuStore из APK,
 * скачанного с GitHub, некуда.
 */
export function ReviewButton() {
  if (!forStore()) return null;

  const rate = async (): Promise<void> => {
    const shown = await askForReview();
    if (!shown) await Linking.openURL(STORE_URL);
  };

  return (
    <Button
      title="Оценить приложение"
      accessibilityHint="Форма оценки RuStore. Если она недоступна, откроется карточка приложения в магазине"
      onPress={() => void rate()}
    />
  );
}
