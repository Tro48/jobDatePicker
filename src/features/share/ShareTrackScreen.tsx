import { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatDayShort } from '@/domain/format.ts';
import { describePattern } from '@/domain/customSchedules.ts';
import {
  DEFAULT_SHARE_OPTIONS,
  buildSharedTrack,
  encodeTrack,
  fitsInQr,
  serializeTrackFile,
  trackShareUrl,
} from '@/domain/share.ts';
import type { ShareOptions } from '@/domain/share.ts';
import { activeTrack, useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, Toggle, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';
import { shareTextFile } from '@/features/backup/files.ts';
import { QrCode } from './QrCode.tsx';

/** Сколько места отдаём коду: чем крупнее модуль, тем увереннее он снимается. */
const QR_MAX_SIZE = 320;

/**
 * Отдать график другому телефону.
 *
 * Два способа на одном экране и оба полноценные: код снимается камерой прямо с
 * экрана, файл уходит в мессенджер. Ни один из них не запасной вариант для
 * другого — свой сканер может не справиться на дешёвой камере, а файл дойдёт
 * всегда.
 */
export function ShareTrackScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ track?: string }>();

  const tracks = useAppStore((state) => state.tracks);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const allPayments = useAppStore((state) => state.payments);
  const active = useAppStore(activeTrack);

  const track = tracks.find((item) => item.id === params.track) ?? active;
  const [options, setOptions] = useState<ShareOptions>(DEFAULT_SHARE_OPTIONS);
  const [status, setStatus] = useState<string | null>(null);

  /**
   * Уезжает график, по которому человек работает сейчас, а не вся его история.
   * Принимающему нужен рабочий календарь, а не чужая трудовая книжка, и в код
   * на экране история просто не влезет.
   */
  const current = track?.schedules.at(-1) ?? null;

  const share = useMemo(() => {
    if (!track || !current) return null;
    return buildSharedTrack(
      {
        name: track.name,
        shiftTypes,
        pattern: current.pattern,
        anchorDate: current.anchorDate,
        overrides: Object.values(track.overrides),
        payments: allPayments
          .filter((payment) => payment.trackId === track.id)
          .map(({ id, trackId, ...rest }) => rest),
      },
      options,
    );
  }, [track, current, shiftTypes, allPayments, options]);

  const payload = useMemo(() => (share ? encodeTrack(share) : null), [share]);
  const qrFits = payload !== null && fitsInQr(payload);

  if (!track || !current || !share || payload === null) {
    return (
      <Sheet title="Поделиться графиком" onClose={() => router.back()}>
        <ScrollView
          {...scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg }}
        >
          <Card title="Графика нет">
            <AppText variant="body" tone="muted">
              Отдавать нечего: сначала выбери график.
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  const saveFile = async (): Promise<void> => {
    const fileName = `grafik-${track.name.trim().toLowerCase().replace(/\s+/g, '-')}.json`;
    const sent = await shareTextFile(fileName, serializeTrackFile(share), 'application/json');
    setStatus(sent ? null : 'На этом телефоне нечем поделиться файлом.');
  };

  // Ширина кода — по экрану, но не больше разумного: растянутый на планшет код
  // не читается лучше, он просто занимает весь экран.
  const qrSize = Math.min(QR_MAX_SIZE, width - theme.spacing.lg * 4);

  return (
    <Sheet title="Поделиться графиком" onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Что уедет">
          <AppText variant="body">{track.name}</AppText>
          <AppText variant="body" tone="muted">
            {describePattern(current.pattern, shiftTypes)}
          </AppText>
          <AppText variant="caption" tone="muted">
            С {formatDayShort(current.anchorDate)} · смен в графике: {share.shiftTypes.length} ·
            ручных правок: {share.overrides.length}
          </AppText>

          {/* Оба переключателя выключены по умолчанию и по разным причинам:
              заметки — это личный текст, выплаты — суммы зарплат, а фото кода
              легко переслать дальше. */}
          <Toggle
            label="Отдать заметки к дням"
            hint="Личные подписи вроде «вышел за Сергея»"
            value={options.notes}
            onValueChange={(notes) => setOptions((current) => ({ ...current, notes }))}
          />
          <Toggle
            label="Отдать историю выплат"
            hint="Это суммы зарплат. В QR-код они не попадут в любом случае — только в файл"
            value={options.payments}
            onValueChange={(payments) => setOptions((current) => ({ ...current, payments }))}
          />
        </Card>

        <Card title="QR-код">
          {qrFits ? (
            <View style={{ gap: theme.spacing.md }}>
              <QrCode
                value={trackShareUrl(share)}
                size={qrSize}
                label={`QR-код с графиком «${track.name}». Наведи на него камеру другого телефона.`}
              />
              <AppText variant="body" tone="muted">
                Наведи на код камеру другого телефона: подойдёт и обычная камера Android, и кнопка
                «Сканировать QR» в настройках приложения.
              </AppText>
            </View>
          ) : (
            <AppText variant="body">
              Правок слишком много для QR-кода — столько данных в него не влезет так, чтобы код
              снялся камерой. Отдай график файлом: в нём помещается всё.
            </AppText>
          )}
        </Card>

        <Card title="Файл">
          <AppText variant="body" tone="muted">
            Файл уходит куда угодно — в мессенджер, на почту, в облако. На другом телефоне его
            открывают через «Настройки → Данные → Загрузить из файла».
          </AppText>
          <Button title="Отправить файлом" variant="primary" onPress={() => void saveFile()} />
          {status ? (
            <AppText variant="body" color={theme.colors.danger}>
              {status}
            </AppText>
          ) : null}
        </Card>
      </ScrollView>
    </Sheet>
  );
}
