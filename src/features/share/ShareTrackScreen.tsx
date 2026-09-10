import { useMemo } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatDayShort } from '@/domain/format.ts';
import { describePattern } from '@/domain/customSchedules.ts';
import { encodeTrack, fitsInQr, trackShareUrl } from '@/domain/share.ts';
import { activeTrack, useAppStore } from '@/data/store.ts';
import { AppText, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';
import { shareOfTrack } from './trackShare.ts';
import { QrCode } from './QrCode.tsx';

/** Сколько места отдаём коду: чем крупнее модуль, тем увереннее он снимается. */
const QR_MAX_SIZE = 320;

/**
 * Код графика на экране.
 *
 * Экран показывает ровно одно — код, который снимают камерой другого телефона.
 * Файлом график уходит значком в его собственной карточке: тот путь никуда не
 * ведёт, он открывает системный лист прямо на месте, и держать ради него
 * отдельный экран незачем.
 *
 * Уезжает только календарь: раскладка, смены и ручные правки. Заметки,
 * напоминания и выплаты не уезжают — своё целиком переносит резервная копия.
 */
export function ShareTrackScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ track?: string }>();

  const tracks = useAppStore((state) => state.tracks);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const active = useAppStore(activeTrack);

  const track = tracks.find((item) => item.id === params.track) ?? active;
  const current = track?.schedules.at(-1) ?? null;

  const share = useMemo(
    () => (track ? shareOfTrack(track, shiftTypes) : null),
    [track, shiftTypes],
  );
  const payload = useMemo(() => (share ? encodeTrack(share) : null), [share]);

  const padding = { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl };

  if (!track || !current || !share || payload === null) {
    return (
      <Sheet title="QR-код графика" onClose={() => router.back()}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
          <Card title="Графика нет">
            <AppText variant="body" tone="muted">
              Отдавать нечего: сначала выбери график.
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  // Ширина кода — по экрану, но не больше разумного: растянутый на планшет код
  // не читается лучше, он просто занимает весь экран.
  const qrSize = Math.min(QR_MAX_SIZE, width - theme.spacing.lg * 4);

  return (
    <Sheet title="QR-код графика" onClose={() => router.back()}>
      <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
        <Card
          title="Наведи камеру"
          help="Подойдёт и обычная камера Android, и значок QR в окне нового графика — «+» над календарём. До предпросмотра на том телефоне ничего не изменится."
        >
          {fitsInQr(payload) ? (
            <QrCode
              value={trackShareUrl(share)}
              size={qrSize}
              label={`QR-код с графиком «${track.name}». Наведи на него камеру другого телефона.`}
            />
          ) : (
            <AppText variant="body">
              Правок слишком много для QR-кода — столько данных в него не влезет так, чтобы код
              снялся камерой. Отдай график файлом: в нём помещается всё.
            </AppText>
          )}
        </Card>

        <Card title="Что уедет">
          <AppText variant="body">{track.name}</AppText>
          <AppText variant="body" tone="muted">
            {describePattern(current.pattern, shiftTypes)}
          </AppText>
          <AppText variant="caption" tone="muted">
            С {formatDayShort(current.anchorDate)} · смен в графике: {share.shiftTypes.length} ·
            ручных правок: {share.overrides.length}
          </AppText>
          {/* Сказано прямо, а не подразумевается: человек показывает свой
              календарь чужой камере и должен видеть, что личное на ней не
              окажется. */}
          <AppText variant="body" tone="muted">
            Только график. Заметки, напоминания и выплаты остаются на этом телефоне.
          </AppText>
        </Card>
      </ScrollView>
    </Sheet>
  );
}
