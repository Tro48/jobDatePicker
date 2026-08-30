import { Linking, View } from 'react-native';
import { formatDayShort } from '@/domain/format.ts';
import { toIsoDateLocal } from '@/domain/date.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';
import { useAppUpdate } from './useAppUpdate.ts';
import type { ReleaseManifest, UpdateStatus } from './useAppUpdate.ts';

/** Отпечаток длинный и целиком не нужен: он опознаётся по началу. */
const FINGERPRINT_LENGTH = 8;

/**
 * Ход проверки. Новая сборка сюда не попадает: про неё говорит отдельная
 * строка, иначе карточка одновременно писала бы «установлена последняя версия»
 * и предлагала скачать APK.
 */
function statusText(status: UpdateStatus): string | null {
  switch (status.kind) {
    case 'disabled':
      return 'В отладочной сборке обновления по воздуху выключены: JS приезжает с Metro.';
    case 'checking':
      return 'Проверяю…';
    case 'downloading':
      return 'Скачиваю обновление…';
    case 'ready':
      return 'Обновление скачано и применится после перезапуска.';
    case 'current':
      return 'Установлена последняя версия.';
    case 'failed':
      return `Не получилось: ${status.message}`;
    default:
      return null;
  }
}

/** Дата сборки приходит из сети: битую строку показывать нельзя. */
function releaseDate(builtAt: string | undefined): string | null {
  if (!builtAt) return null;
  const date = new Date(builtAt);
  return Number.isNaN(date.getTime()) ? null : formatDayShort(toIsoDateLocal(date));
}

function newBuildText(build: ReleaseManifest): string {
  const title = build.version ? `Вышла версия ${build.version}` : 'Вышла новая сборка';
  const date = releaseDate(build.builtAt);
  return `${date ? `${title} от ${date}` : title}. Ставится поверх текущей, данные сохранятся.`;
}

/**
 * Версия приложения и обновления.
 *
 * Одна карточка на оба канала доставки: пока обновлять нечего — кнопка
 * проверки, как только вышла сборка с другой нативной частью — та же кнопка
 * ведёт за APK. Человеку важно, есть ли что ставить, а не то, каким путём это
 * приезжает.
 */
export function UpdateCard() {
  const theme = useTheme();
  const { status, runtimeVersion, channel, bundleCreatedAt, newBuild, check, apply } =
    useAppUpdate();

  const message = newBuild ? newBuildText(newBuild) : statusText(status);

  return (
    <Card title="Обновления">
      {message ? (
        // Текст меняется по нажатию кнопки, а фокус остаётся на ней: без живой
        // области скринридер промолчит и о ходе проверки, и о результате.
        <AppText
          variant="body"
          tone={newBuild ? 'default' : 'muted'}
          accessibilityLiveRegion="polite"
        >
          {message}
        </AppText>
      ) : null}

      <View style={{ gap: theme.spacing.xs }}>
        {channel ? (
          <AppText variant="caption" tone="muted">
            Канал обновлений: {channel}
          </AppText>
        ) : null}
        {runtimeVersion ? (
          <AppText variant="caption" tone="muted">
            Нативная часть: {runtimeVersion.slice(0, FINGERPRINT_LENGTH)}
          </AppText>
        ) : null}
        {bundleCreatedAt ? (
          <AppText variant="caption" tone="muted">
            Текущий выпуск от {formatDayShort(toIsoDateLocal(bundleCreatedAt))}
          </AppText>
        ) : null}
      </View>

      {newBuild ? (
        <Button
          title="Скачать APK"
          variant="primary"
          onPress={() => void Linking.openURL(newBuild.url)}
        />
      ) : status.kind === 'ready' ? (
        <Button title="Перезапустить и применить" variant="primary" onPress={apply} />
      ) : (
        <Button
          title="Проверить обновление"
          onPress={check}
          disabled={
            status.kind === 'disabled' || status.kind === 'checking' || status.kind === 'downloading'
          }
        />
      )}
    </Card>
  );
}
