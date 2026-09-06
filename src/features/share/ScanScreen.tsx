import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { payloadFromUrl } from '@/domain/share.ts';
import { AppText, Button, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/** Сторона окошка камеры. Больше не нужно: код занимает середину кадра. */
const VIEWFINDER = 280;

/**
 * Свой сканер QR-кода.
 *
 * Разрешение на камеру спрашивается здесь и только здесь — в момент, когда
 * человек сам нажал «Сканировать QR», а не при первом запуске приложения.
 * Отказ ничего не ломает: остаются файл и системная камера Android, которая
 * распознаёт тот же код и открывает ту же ссылку.
 */
export function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const [permission, requestPermission] = useCameraPermissions();

  // Камера отдаёт кадры пачками, и один и тот же код прилетает десятки раз
  // подряд. Без замка предпросмотр открылся бы столько же раз.
  const handled = useRef(false);
  const [foreign, setForeign] = useState(false);

  const onScan = (data: string): void => {
    if (handled.current) return;

    const payload = payloadFromUrl(data);
    if (!payload) {
      // Чужой код — не ошибка: сканер продолжает искать свой, а человеку
      // говорится, что этот не подошёл.
      setForeign(true);
      return;
    }

    handled.current = true;
    // replace, а не push: возвращаться из предпросмотра в открытую камеру
    // незачем, а батарею она ест.
    router.replace({ pathname: '/track', params: { d: payload } });
  };

  const padding = { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl };

  if (!permission) {
    return (
      <Sheet title="Сканировать QR" onClose={() => router.back()}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
          <Card title="Камера">
            <AppText variant="body" tone="muted">
              Проверяем доступ к камере…
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  if (!permission.granted) {
    return (
      <Sheet title="Сканировать QR" onClose={() => router.back()}>
        <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
          <Card title="Нужен доступ к камере">
            <AppText variant="body">
              Камера нужна только чтобы считать QR-код с графиком. Снимки никуда не отправляются и
              не сохраняются.
            </AppText>
            <Button
              title="Разрешить камеру"
              variant="primary"
              onPress={() => void requestPermission()}
            />
            <AppText variant="body" tone="muted">
              Не хочешь давать доступ — не надо: тот же код читает обычная камера Android, а график
              можно прислать файлом.
            </AppText>
          </Card>
        </ScrollView>
      </Sheet>
    );
  }

  return (
    <Sheet title="Сканировать QR" onClose={() => router.back()}>
      <ScrollView {...scroll} style={{ flex: 1 }} contentContainerStyle={padding}>
        <Card title="Наведи на код">
          <View
            accessibilityLabel="Окошко камеры. Наведи телефон на QR-код с графиком"
            style={{
              width: '100%',
              height: VIEWFINDER,
              borderRadius: theme.radius.lg,
              overflow: 'hidden',
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => onScan(data)}
            />
          </View>

          {foreign ? (
            <AppText variant="body" accessibilityLiveRegion="polite">
              Этот код не из приложения. Нужен тот, что показывает экран «Поделиться графиком».
            </AppText>
          ) : (
            <AppText variant="body" tone="muted">
              Код показывается на другом телефоне в «Поделиться графиком». После распознавания
              откроется предпросмотр — до него ничего не изменится.
            </AppText>
          )}
        </Card>
      </ScrollView>
    </Sheet>
  );
}
