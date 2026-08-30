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

const AUTHOR = 'Андрей Трофимов';
const COPYRIGHT_YEAR = 2026;

/** Версия приложения из app.json. В отладочной сборке её может не быть. */
function appVersion(): string | null {
  const value = Constants.expoConfig?.version;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * О приложении: версия, автор, лицензия, исходный код.
 *
 * Живёт в карточке «Данные» рядом с версией схемы хранилища: и то и другое —
 * ответ на вопрос «что у меня вообще стоит», который задают, когда что-то
 * пошло не так.
 */
export function AboutSection() {
  const theme = useTheme();
  const version = appVersion();

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

      {/* Иконки, а не кнопки во всю ширину: это не действия экрана, а две
          ссылки наружу. Рисунок мелкий, а зона нажатия остаётся полной — по
          иконке в 24 пункта пальцем не попасть. */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <IconButton
          name="logo-github"
          label="Исходный код на GitHub"
          onPress={() => void Linking.openURL(REPOSITORY_URL)}
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
