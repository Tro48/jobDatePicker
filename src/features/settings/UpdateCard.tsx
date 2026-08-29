import { Linking, View } from 'react-native';
import { formatDayShort } from '@/domain/format.ts';
import { toIsoDateLocal } from '@/domain/date.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';
import { useAppUpdate } from './useAppUpdate.ts';
import type { UpdateStatus } from './useAppUpdate.ts';

/** Отпечаток длинный и целиком не нужен: он опознаётся по началу. */
const FINGERPRINT_LENGTH = 8;

function statusText(status: UpdateStatus): string {
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
      return 'Правки экранов и расчётов приезжают по воздуху, обычно при запуске.';
  }
}

/**
 * Версия приложения и обновления.
 *
 * Показывает и то, что приезжает по воздуху, и то, что не может: нативная
 * часть меняется только установкой APK. Без этой карточки старая сборка молча
 * перестала бы получать обновления, и было бы непонятно, почему правок нет.
 */
export function UpdateCard() {
  const theme = useTheme();
  const { status, runtimeVersion, channel, bundleCreatedAt, newBuild, check, apply } =
    useAppUpdate();

  return (
    <>
      <Card title="Обновления">
        <AppText variant="body" tone="muted">
          {statusText(status)}
        </AppText>

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

        {status.kind === 'ready' ? (
          <Button title="Перезапустить и применить" variant="primary" onPress={apply} />
        ) : (
          <Button
            title="Проверить обновление"
            onPress={check}
            disabled={status.kind === 'disabled' || status.kind === 'checking' || status.kind === 'downloading'}
          />
        )}
      </Card>

      {newBuild ? (
        // Нативную часть Android разрешает менять только установкой APK —
        // по воздуху такое обновление не доставить в принципе.
        <Card title="Вышла новая сборка">
          <AppText variant="body">
            Изменилась нативная часть приложения{newBuild.version ? `, версия ${newBuild.version}` : ''}.
            По воздуху она не приезжает — нужно поставить APK поверх текущего. Данные
            сохранятся.
          </AppText>
          <Button
            title="Скачать APK"
            variant="primary"
            onPress={() => void Linking.openURL(newBuild.url)}
          />
        </Card>
      ) : null}
    </>
  );
}
