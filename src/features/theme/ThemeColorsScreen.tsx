import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Card, ChoiceGroup, Sheet, useSheetScroll } from '@/ui';
import { COLOR_GROUPS, readableOn, slotsOfGroup, useTheme } from '@/theme';
import type { ColorGroupId, ColorSlot, Palette, SchemeName } from '@/theme';
import { PalettePreview } from './PalettePreview.tsx';
import { RescueButton } from './RescueButton.tsx';
import { useEditedPalette } from './useEditedPalette.ts';

const SCHEME_CHOICES = [
  { value: 'light', label: 'Светлая', hint: 'Цвета для дневной темы' },
  { value: 'dark', label: 'Тёмная', hint: 'Цвета для ночной темы' },
] as const satisfies ReadonlyArray<{ value: SchemeName; label: string; hint?: string }>;

/**
 * Свои цвета оформления.
 *
 * Темы правятся по отдельности: цвет, читаемый на белом фоне, на чёрном не
 * читается, и общий набор означал бы, что одна из двух тем всегда испорчена.
 * Открывается сразу на той теме, что сейчас на экране, — с неё человек и
 * пришёл.
 *
 * Разделы свёрнуты: цветов два десятка, и списком в одну простыню экран
 * превращается в стену, по которой непонятно, куда идти. Свёрнутый раздел
 * показывает, сколько в нём цветов и сколько из них правлено, — этого хватает,
 * чтобы решить, открывать ли его.
 *
 * Экран ничего не запрещает и ни на что не жалуется: что получилось, видно в
 * образце. Цвет буквы на заливке, подпись на акценте и кольцо фокуса здесь не
 * спрашиваются вовсе — они считаются от заданного (см. src/theme/slots.ts).
 */
export function ThemeColorsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const push = useGuardedPush();
  const scroll = useSheetScroll();

  const [scheme, setScheme] = useState<SchemeName>(theme.scheme);
  // Открыт всегда один раздел: держать раскрытыми сразу все — это та же стена,
  // от которой раздел и спасает.
  const [opened, setOpened] = useState<ColorGroupId | null>(null);
  const changed = useAppStore((state) => state.themeColors[scheme]);
  const resetThemeColors = useAppStore((state) => state.resetThemeColors);
  const palette = useEditedPalette(scheme);

  const changedCount = Object.keys(changed).length;

  return (
    <Sheet title="Цвета" onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Какую тему красим">
          <ChoiceGroup
            label="Тема для правки"
            choices={SCHEME_CHOICES}
            value={scheme}
            onChange={setScheme}
          />
          <AppText variant="caption" tone="muted">
            {scheme === theme.scheme
              ? 'Это тема, которая сейчас на экране: правка видна сразу.'
              : 'Сейчас на экране другая тема. Образец ниже показывает, что получится в выбранной.'}
          </AppText>
          <PalettePreview palette={palette} />
          <AppText variant="caption" tone="muted">
            {changedCount > 0
              ? `Своих цветов в этой теме: ${changedCount}. Остальные — как в приложении.`
              : 'Пока все цвета — как в приложении. Нажми на любой, чтобы задать свой.'}
          </AppText>
        </Card>

        {COLOR_GROUPS.map((group) => {
          const slots = slotsOfGroup(group.id);
          const open = opened === group.id;

          return (
            <Card key={group.id}>
              <GroupHeader
                title={group.title}
                count={slots.length}
                customCount={slots.filter((slot) => changed[slot.id] !== undefined).length}
                open={open}
                onPress={() => setOpened(open ? null : group.id)}
              />

              {open ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <AppText variant="caption" tone="muted">
                    {group.hint}
                  </AppText>

                  {slots.map((slot) => (
                    <ColorRow
                      key={slot.id}
                      slot={slot}
                      palette={palette}
                      custom={changed[slot.id] !== undefined}
                      onPress={() =>
                        push({
                          pathname: '/settings/theme-color',
                          params: { slot: slot.id, scheme },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })}

        <Card title="Сброс">
          <AppText variant="caption" tone="muted">
            Вернуть цвета приложения. Кнопка нарисована чёрным или белым — тем, что виден на текущем
            фоне: из неудачного оформления должен быть выход.
          </AppText>
          <RescueButton
            title={`Сбросить ${scheme === 'dark' ? 'тёмную' : 'светлую'} тему`}
            accessibilityHint="Убирает все свои цвета выбранной темы"
            disabled={changedCount === 0}
            onPress={() => resetThemeColors(scheme)}
          />
          <RescueButton
            title="Сбросить обе темы"
            accessibilityHint="Убирает все свои цвета и в светлой, и в тёмной теме"
            onPress={() => resetThemeColors()}
          />
        </Card>
      </ScrollView>
    </Sheet>
  );
}

interface GroupHeaderProps {
  title: string;
  count: number;
  customCount: number;
  open: boolean;
  onPress: () => void;
}

/**
 * Заголовок раздела: он же кнопка, которая его раскрывает.
 *
 * Состояние передаётся озвучке через accessibilityState, а глазу — стрелкой и
 * подписью со счётчиком: «свёрнуто» не должно узнаваться только по тому, что
 * под заголовком пусто.
 */
function GroupHeader({ title, count, customCount, open, onPress }: GroupHeaderProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const summary =
    customCount > 0
      ? `${count} цветов, свой ${customCount}`
      : `${count} цветов, все как в приложении`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}: ${summary}`}
      accessibilityHint={open ? 'Свернуть раздел' : 'Раскрыть раздел'}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.minTouchTarget,
        borderRadius: theme.radius.md,
        borderWidth: theme.focusRingWidth,
        borderColor: focused ? theme.colors.focus : 'transparent',
      }}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="caption" tone="muted">
          {summary}
        </AppText>
      </View>
      <Ionicons
        name={open ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={theme.colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

interface ColorRowProps {
  slot: ColorSlot;
  palette: Palette;
  custom: boolean;
  onPress: () => void;
}

/** Строка списка: образец цвета, название и его код. */
function ColorRow({ slot, palette, custom, onPress }: ColorRowProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const color = slot.read(palette);
  // «Свой цвет» — словом, а не оттенком строки: по цвету строки в списке
  // цветов не понять вообще ничего.
  const details = custom ? `${color} · свой цвет` : color;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${slot.name}, ${details}`}
      accessibilityHint={slot.hint}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.minTouchTarget,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.md,
        borderWidth: theme.focusRingWidth,
        borderColor: focused ? theme.colors.focus : 'transparent',
        backgroundColor: theme.colors.surfaceElevated,
      }}
    >
      {/* Рамка образца — чёрная или белая по самому цвету: рамка из палитры
          пропала бы ровно тогда, когда человек покрасил границы в цвет фона. */}
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 32,
          height: 32,
          borderRadius: theme.radius.sm,
          backgroundColor: color,
          borderWidth: 1,
          borderColor: readableOn(color),
        }}
      />
      <View style={{ flex: 1 }}>
        <AppText variant="body">{slot.name}</AppText>
        <AppText variant="caption" tone="muted">
          {details}
        </AppText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={theme.colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}
