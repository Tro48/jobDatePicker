import { Linking, View } from 'react-native';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';
import { adProvider } from './ads.ts';
import { SUPPORT_URL } from './entitlements.ts';
import { useSupportSlot } from './useSupportSlot.ts';

/**
 * Единственное место в приложении, где приложение говорит о себе.
 *
 * Последней карточкой на «Сводке» и больше нигде: ни в календаре, ни в
 * карточке дня, ни в будильнике. Календарь открывают по десять раз в день, а
 * сводку — раз в месяц, и это ровно та разница, из-за которой одно приложение
 * удаляют за рекламу, а другое нет.
 */
export function SupportSlot() {
  const theme = useTheme();
  const mode = useSupportSlot();
  const setSupport = useAppStore((state) => state.setSupport);

  if (mode === 'hidden') return null;

  // Адрес вынут в переменную: без неё сужение типа не доживает до колбэка кнопки.
  const donateUrl = SUPPORT_URL;

  if (mode === 'ads') {
    return <View accessibilityLabel="Реклама">{adProvider.render()}</View>;
  }

  return (
    <Card title="Без рекламы и без подписки">
      <AppText variant="body" tone="muted">
        Приложение ничего не показывает и ничего не собирает: график, деньги и заметки лежат только
        на телефоне и никуда не уходят.
      </AppText>

      <View style={{ gap: theme.spacing.sm }}>
        {/* Кнопка появляется, только когда ей есть куда вести: кнопка,
            которая ничего не открывает, хуже её отсутствия. */}
        {donateUrl !== null ? (
          <Button
            title="Поддержать"
            variant="primary"
            accessibilityHint="Откроется страница в браузере"
            onPress={() => void Linking.openURL(donateUrl)}
          />
        ) : (
          <AppText variant="body">
            Если приложение пригодилось — расскажи о нём тем, кто работает по такому же графику.
          </AppText>
        )}
        {/* Обязательная кнопка: карточка, которую нельзя убрать, — это та же
            реклама, только своя. */}
        <Button
          title="Не показывать"
          accessibilityHint="Карточка исчезнет и больше не появится"
          onPress={() => setSupport({ donationDismissed: true })}
        />
      </View>
    </Card>
  );
}
