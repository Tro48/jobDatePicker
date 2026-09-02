import { Linking, View } from 'react-native';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { formatDayShort } from '@/domain/format.ts';
import { toIsoDateLocal } from '@/domain/date.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';
import type { ReleaseManifest } from '@/domain/release.ts';
import { useAppUpdate } from './useAppUpdate.ts';
import { useBuildSignal } from './useBuildSignal.ts';
import { UPDATE_FAILURE_TEXT } from './updateError.ts';
import type { UpdateStatus } from './useAppUpdate.ts';

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
      return UPDATE_FAILURE_TEXT[status.reason];
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
  const notes = build.notes ? ` ${build.notes}.` : '';
  return `${date ? `${title} от ${date}` : title}.${notes} Ставится поверх текущей, данные сохранятся.`;
}

/**
 * Версия приложения и обновления.
 *
 * Одна карточка на оба канала доставки: обновление по воздуху и сборка APK,
 * которую надо ставить руками. Человеку важно, есть ли что ставить, а не то,
 * каким путём это приезжает.
 *
 * Все кнопки, что-то делающие с обновлениями, живут здесь: полоска на
 * календаре только сообщает и приводит сюда.
 */
export function UpdateCard() {
  const theme = useTheme();
  const push = useGuardedPush();
  const { status, runtimeVersion, channel, bundleCreatedAt, check, apply } = useAppUpdate();
  // Кнопка скачивания живёт только здесь: полоска на календаре про сборку
  // рассказывает, но ставить APK человек приходит в настройки.
  const { build: newBuild, refresh } = useBuildSignal();

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
      ) : null}

      {status.kind === 'ready' ? (
        <Button title="Перезапустить и применить" variant="primary" onPress={apply} />
      ) : null}

      {/* Полоску на календаре можно закрыть не глядя — тогда список изменений
          ищут здесь. */}
      <Button
        title="Что нового"
        onPress={() => push('/whats-new')}
        accessibilityHint="Открывает список изменений в последних выпусках"
      />

      {/* Ручная проверка остаётся всегда, даже когда есть что скачивать: это
          единственный способ спросить об обновлениях самому, не дожидаясь
          расписания. */}
      <Button
        title="Проверить обновление"
        // Проверяются оба канала разом: по воздуху приезжает JS, а список
        // выпусков знает про сборку, которую надо ставить руками.
        onPress={() => {
          check();
          void refresh({ force: true });
        }}
        disabled={
          status.kind === 'disabled' || status.kind === 'checking' || status.kind === 'downloading'
        }
      />
    </Card>
  );
}
