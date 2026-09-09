import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, Sheet, ColorPicker, useSheetScroll } from '@/ui';
import { darkPalette, findColorSlot, lightPalette, useTheme } from '@/theme';
import type { SchemeName } from '@/theme';
import { PalettePreview } from './PalettePreview.tsx';
import { useEditedPalette } from './useEditedPalette.ts';

/**
 * Правка одного цвета палитры.
 *
 * Цвет живёт в состоянии экрана и уезжает в хранилище одной кнопкой — как и
 * черновик смены: запись в хранилище синхронная, а ползунок под пальцем даёт
 * десятки значений в секунду, и каждое из них перекрашивало бы всё приложение
 * вместе с виджетом.
 *
 * Что получится, видно в образце над выбором: там и сетка месяца, и карточка с
 * текстом и кнопками. Он же заменяет собой любые предупреждения — цвет, на
 * котором ничего не разобрать, видно в образце и без подписи. Сброс на цвет
 * приложения — рядом, на этом же экране.
 */
export function ColorEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ slot?: string; scheme?: string }>();

  const scheme: SchemeName = params.scheme === 'dark' ? 'dark' : 'light';
  const slot = findColorSlot(params.slot ?? '');

  const setThemeColor = useAppStore((state) => state.setThemeColor);
  const resetThemeColor = useAppStore((state) => state.resetThemeColor);
  const custom = useAppStore((state) =>
    slot ? state.themeColors[scheme][slot.id] !== undefined : false,
  );

  const base = scheme === 'dark' ? darkPalette : lightPalette;
  const saved = useEditedPalette(scheme);
  const [color, setColor] = useState(() => (slot ? slot.read(saved) : base.background));

  // Ещё не сохранённый цвет — сразу в образец: человек должен видеть, что
  // получится, до того как нажмёт «Сохранить».
  const draft = useMemo(() => (slot ? { [slot.id]: color } : {}), [slot, color]);
  const preview = useEditedPalette(scheme, draft);

  if (!slot) {
    // Ссылка на цвет, которого больше нет: бывает после отката приложения на
    // прошлую версию, когда экран открыт из истории навигации.
    return (
      <Sheet title="Цвет" onClose={() => router.back()}>
        <View style={{ padding: theme.spacing.lg }}>
          <AppText variant="body">Такого цвета в оформлении нет.</AppText>
        </View>
      </Sheet>
    );
  }

  const original = slot.read(base);

  return (
    <Sheet title={slot.name} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title={scheme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}>
          <AppText variant="caption" tone="muted">
            {slot.hint}
          </AppText>
          <PalettePreview palette={preview} />
        </Card>

        <Card title="Цвет">
          <ColorPicker value={color} onChange={setColor} label={slot.name} />
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Сохранить"
            variant="primary"
            onPress={() => {
              setThemeColor(scheme, slot.id, color);
              router.back();
            }}
          />
          <Button
            title="Вернуть цвет приложения"
            accessibilityHint={`Цвет по умолчанию — ${original}`}
            disabled={!custom && color === original}
            onPress={() => {
              resetThemeColor(scheme, slot.id);
              router.back();
            }}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}
