import { Linking, View } from 'react-native';
import Constants from 'expo-constants';
import { AppText, IconButton } from '@/ui';
import { useTheme } from '@/theme';

/**
 * Ссылки живут константами в JS, а не в `extra` из app.json: `extra` входит в
 * отпечаток нативной части, и правка ссылки потребовала бы новой сборки APK —
 * при пятнадцати сборках в месяц это непозволительная цена за строку текста.
 */
const REPOSITORY_URL = 'https://github.com/Tro48/jobDatePicker';
const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`;
const PRIVACY_URL = 'https://tro48.github.io/jobDatePicker/privacy';
const STORE_URL = 'https://www.rustore.ru/catalog/app/com.trofimdev.jobdatepicker';

const AUTHOR = 'Андрей Трофимов';
const COPYRIGHT_YEAR = 2026;

/** Версия приложения из app.json. В отладочной сборке её может не быть. */
function appVersion(): string | null {
  const value = Constants.expoConfig?.version;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Собрана ли эта сборка для магазина. Флаг ставит app.config.ts по переменной
 * профиля rustore.
 */
function forStore(): boolean {
  return Constants.expoConfig?.extra?.distribution === 'rustore';
}

/**
 * О приложении: версия, автор, лицензия, политика конфиденциальности.
 *
 * Живёт в карточке «Данные» рядом с версией схемы хранилища: и то и другое —
 * ответ на вопрос «что у меня вообще стоит», который задают, когда что-то
 * пошло не так.
 *
 * В сборке для магазина ссылка на репозиторий заменяется ссылкой на карточку
 * приложения: правила площадки запрещают вести пользователя на сторонние
 * витрины, а страница выпусков на GitHub — ровно такая витрина, там лежат APK.
 * Текст лицензии и политика при этом остаются: они не витрины, а документы.
 */
export function AboutSection() {
  const theme = useTheme();
  const version = appVersion();
  const store = forStore();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText variant="body" tone="muted">
        Версия приложения: {version ?? 'неизвестна'} — бета
      </AppText>
      <AppText variant="body" tone="muted">
        © {COPYRIGHT_YEAR} {AUTHOR}
      </AppText>
      <AppText variant="body" tone="muted">
        Лицензия MIT
      </AppText>
      <AppText variant="body" tone="muted">
        Данные хранятся только на телефоне и никуда не передаются.
      </AppText>

      {/* Иконки, а не кнопки во всю ширину: это не действия экрана, а ссылки
          наружу. Рисунок мелкий, а зона нажатия остаётся полной — по иконке в
          24 пункта пальцем не попасть. */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {store ? (
          <IconButton
            name="storefront-outline"
            label="Страница приложения в RuStore"
            onPress={() => void Linking.openURL(STORE_URL)}
          />
        ) : (
          <IconButton
            name="logo-github"
            label="Исходный код на GitHub"
            onPress={() => void Linking.openURL(REPOSITORY_URL)}
          />
        )}
        <IconButton
          name="shield-checkmark-outline"
          label="Политика конфиденциальности"
          onPress={() => void Linking.openURL(PRIVACY_URL)}
        />
        <IconButton
          name="document-text-outline"
          label="Текст лицензии"
          onPress={() => void Linking.openURL(LICENSE_URL)}
        />
      </View>
    </View>
  );
}
