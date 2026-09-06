import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDays } from '@/domain/date.ts';
import { describePattern } from '@/domain/customSchedules.ts';
import { resolveRange } from '@/domain/engine.ts';
import { formatDayShort, pluralize } from '@/domain/format.ts';
import { indexShiftTypes } from '@/domain/shifts.ts';
import { ShareFormatError, decodeTrack } from '@/domain/share.ts';
import type { SharedTrack } from '@/domain/share.ts';
import { activeTrack, useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/** Сколько дней показывает предпросмотр раскладки. */
const PREVIEW_DAYS = 14;

/**
 * Пришедший график — до того, как он что-то изменил.
 *
 * Один экран на все три входа: файл, свой сканер и ссылку из системной камеры.
 * Разные экраны разошлись бы уже на второй правке, а человеку в любом случае
 * нужно одно и то же — увидеть, что именно пришло, и решить, чьё это.
 */
export function TrackPreviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ d?: string }>();

  const addSharedTrack = useAppStore((state) => state.addSharedTrack);
  const removeTrack = useAppStore((state) => state.removeTrack);
  const current = useAppStore(activeTrack);

  const parsed = useMemo(() => {
    if (!params.d) return { error: 'Ссылка пустая — в ней нет графика.' } as const;
    try {
      return { share: decodeTrack(params.d) } as const;
    } catch (error) {
      const message =
        error instanceof ShareFormatError ? error.message : 'График не удалось разобрать.';
      return { error: message } as const;
    }
  }, [params.d]);

  const [done, setDone] = useState(false);

  if ('error' in parsed) {
    return (
      <Sheet title="График не принят" onClose={() => router.back()}>
        <ScrollView
          {...scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.spacing.lg }}
        >
          <Card title="Не получилось">
            <AppText variant="body">{parsed.error}</AppText>
            <AppText variant="body" tone="muted">
              Попробуй снять код ещё раз или попроси прислать график файлом — файлом уезжает всё и
              всегда.
            </AppText>
            <Button title="Закрыть" variant="primary" onPress={() => router.back()} />
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  const { share } = parsed;

  const accept = (own: boolean): void => {
    // «Заменить свой» — это не слияние: старая дорожка уходит целиком вместе
    // со своими правками, и сказано об этом до нажатия.
    if (own && current) removeTrack(current.id);

    addSharedTrack({
      name: share.name,
      own,
      shiftTypes: share.shiftTypes,
      pattern: share.pattern,
      anchorDate: share.anchorDate,
      overrides: share.overrides,
      payments: share.payments,
    });

    setDone(true);
    router.back();
  };

  return (
    <Sheet title="Пришёл график" onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Что пришло">
          <AppText variant="heading">{share.name || 'Без названия'}</AppText>
          <AppText variant="body" tone="muted">
            {describePattern(share.pattern, share.shiftTypes)}
          </AppText>
          <AppText variant="body" tone="muted">
            С {formatDayShort(share.anchorDate)}
          </AppText>
          <AppText variant="caption" tone="muted">
            Смен: {share.shiftTypes.length} · {pluralize(share.overrides.length, RECORD_FORMS)}{' '}
            вручную
            {share.payments.length > 0
              ? ` · ${pluralize(share.payments.length, PAYMENT_FORMS)}`
              : ''}
          </AppText>
        </Card>

        <SharePreview share={share} />

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Добавить как чужой график"
            variant="primary"
            disabled={done}
            accessibilityHint="Появится отдельной вкладкой. В сводку часов и денег не попадёт"
            onPress={() => accept(false)}
          />
          <Button
            title={current ? `Заменить свой график «${current.name}»` : 'Сделать своим графиком'}
            disabled={done}
            accessibilityHint={
              current
                ? 'Нынешний график и его ручные правки будут удалены — это необратимо'
                : 'График станет основным, его часы попадут в сводку'
            }
            onPress={() => accept(true)}
          />
          {current ? (
            <AppText variant="caption" tone="muted">
              Замена удаляет нынешний график «{current.name}» вместе с его ручными правками.
              Отменить это нельзя — если не уверен, добавь как чужой и посмотри.
            </AppText>
          ) : null}
        </View>
      </ScrollView>
    </Sheet>
  );
}

const RECORD_FORMS = ['правка', 'правки', 'правок'] as const;
const PAYMENT_FORMS = ['выплата', 'выплаты', 'выплат'] as const;

/** Первые две недели пришедшего графика: буквами, как в списке выбора. */
function SharePreview({ share }: { share: SharedTrack }) {
  const theme = useTheme();

  const days = useMemo(() => {
    const context = {
      schedules: [
        {
          presetId: 'incoming',
          pattern: share.pattern,
          anchorDate: share.anchorDate,
          startsOn: share.anchorDate,
        },
      ],
      shiftTypes: indexShiftTypes(share.shiftTypes),
      overrides: new Map<string, never>(),
    };

    try {
      return resolveRange(
        context,
        Array.from({ length: PREVIEW_DAYS }, (_, index) => addDays(share.anchorDate, index)),
      );
    } catch {
      // Раскладка, которую нечем разложить, до сюда доехать не должна — её
      // ловит разбор. Но рисовать предпросмотр ценой аварийного экрана нельзя.
      return [];
    }
  }, [share]);

  if (days.length === 0) return null;

  return (
    <Card title={`Как ляжет: ${PREVIEW_DAYS} дней`}>
      <View
        accessibilityRole="text"
        accessibilityLabel={days
          .map((day) => `${formatDayShort(day.date)} — ${day.shiftType.name.toLowerCase()}`)
          .join('; ')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}
      >
        {days.map((day) => (
          <View
            key={day.date}
            importantForAccessibility="no-hide-descendants"
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <AppText variant="badge">{day.shiftType.badge}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}
