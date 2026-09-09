import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, ColorPicker, Sheet, useSheetScroll } from '@/ui';
import { findColorSlot, paintSlot, useTheme } from '@/theme';
import { PalettePreview } from './PalettePreview.tsx';

/**
 * Правка одного цвета своей темы.
 *
 * Цвет живёт в состоянии экрана и уезжает в хранилище одной кнопкой — как и
 * черновик смены: запись в хранилище синхронная, а палец на квадрате оттенка
 * даёт десятки значений в секунду, и каждое из них перекрашивало бы всё
 * приложение вместе с виджетом.
 *
 * Что получится, видно в образце: там и сетка месяца, и карточка с текстом и
 * кнопками. Он же заменяет собой любые предупреждения — цвет, на котором
 * ничего не разобрать, видно в образце и без подписи.
 */
export function ColorEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ theme?: string; slot?: string }>();

  const themes = useAppStore((state) => state.themes);
  const setThemeColor = useAppStore((state) => state.setThemeColor);

  const edited = themes.find((item) => item.id === params.theme) ?? null;
  const slot = findColorSlot(params.slot ?? '');

  const [color, setColor] = useState(() => (edited && slot ? slot.read(edited.colors) : '#FFFFFF'));

  // Ещё не сохранённый цвет — сразу в образец: человек должен видеть, что
  // получится, до того как нажмёт «Сохранить».
  const preview = useMemo(
    () => (edited && slot ? paintSlot(edited.colors, slot.id, color) : null),
    [edited, slot, color],
  );

  if (!edited || !slot || !preview) {
    // Тему удалили с другого экрана или цвета больше нет в палитре: второе
    // бывает после отката приложения на прошлую версию.
    return (
      <Sheet title="Цвет" onClose={() => router.back()}>
        <View style={{ padding: theme.spacing.lg }}>
          <AppText variant="body">Этот цвет больше не правится: темы или цвета нет.</AppText>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet title={slot.name} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title={edited.name}>
          <AppText variant="caption" tone="muted">
            {slot.hint}
          </AppText>
          <PalettePreview palette={preview} />
        </Card>

        <Card title="Цвет">
          <ColorPicker value={color} onChange={setColor} label={slot.name} />
        </Card>

        <Button
          title="Сохранить"
          variant="primary"
          onPress={() => {
            setThemeColor(edited.id, slot.id, color);
            router.back();
          }}
        />
      </ScrollView>
    </Sheet>
  );
}
