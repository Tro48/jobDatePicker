import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MAX_THEME_NAME_LENGTH, useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, Sheet, TextField, useSheetScroll } from '@/ui';
import { COLOR_GROUPS, CUSTOM_PREFIX, slotsOfGroup, useTheme } from '@/theme';
import type { ColorGroupId, ColorSlot, Palette } from '@/theme';
import { PalettePreview } from './PalettePreview.tsx';

/**
 * Своя тема: имя, цвета и всё, что с ней можно сделать.
 *
 * Тема заводится ещё до открытия этого экрана — копией той, что сейчас
 * показана, — поэтому здесь она всегда настоящая: сразу видно её цвета и сразу
 * можно красить. Экран «сначала назовите и выберите основу, потом мы что-то
 * создадим» не объяснял бы, зачем человеку копия того, что у него и так есть.
 *
 * Цветов смен здесь нет: смену красят в её собственном редакторе, где рядом
 * стоят её буква, время и надбавка.
 *
 * Разделы свёрнуты и открываются по одному: списком в одну простыню экран
 * превращается в стену.
 */
export function ThemeEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const push = useGuardedPush();
  const scroll = useSheetScroll();
  const params = useLocalSearchParams<{ theme?: string }>();

  const themes = useAppStore((state) => state.themes);
  const renameTheme = useAppStore((state) => state.renameTheme);
  const removeTheme = useAppStore((state) => state.removeTheme);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const appearance = useAppStore((state) => state.appearance);

  const edited = themes.find((item) => item.id === params.theme) ?? null;

  const [name, setName] = useState(edited?.name ?? '');
  const [opened, setOpened] = useState<ColorGroupId | null>(null);

  if (!edited) {
    // Тему удалили с другого экрана, а этот остался в истории навигации.
    return (
      <Sheet title="Тема" onClose={() => router.back()}>
        <View style={{ padding: theme.spacing.lg }}>
          <AppText variant="body">Этой темы больше нет.</AppText>
        </View>
      </Sheet>
    );
  }

  const shown = appearance === `${CUSTOM_PREFIX}${edited.id}`;

  return (
    <Sheet title={edited.name} onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Название">
          <TextField
            label="Имя темы"
            value={name}
            onChangeText={setName}
            onBlur={() => renameTheme(edited.id, name)}
            placeholder="Своя тема"
            maxLength={MAX_THEME_NAME_LENGTH}
            hint="Под этим именем тема стоит в списке оформления"
          />
          <PalettePreview palette={edited.colors} />
          <AppText variant="caption" tone="muted">
            {shown
              ? 'Приложение показано в ней: правка цвета видна сразу.'
              : 'Сейчас показана другая тема — образец показывает, что получится в этой.'}
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
                      palette={edited.colors}
                      onPress={() =>
                        push({
                          pathname: '/settings/theme-color',
                          params: { theme: edited.id, slot: slot.id },
                        })
                      }
                    />
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })}

        <Card title="Цвета смен">
          <AppText variant="caption" tone="muted">
            Смены красятся в своём справочнике: «Настройки → График → Смены». Там у каждой свой
            цвет, и виден он рядом с её буквой и временем.
          </AppText>
        </Card>

        <Card title="Эта тема">
          {shown ? null : (
            <Button
              title="Показывать эту тему"
              onPress={() => setAppearance(`${CUSTOM_PREFIX}${edited.id}`)}
            />
          )}
          <Button
            title="Удалить тему"
            variant="danger"
            accessibilityHint="Тема исчезнет из списка оформления"
            onPress={() => {
              removeTheme(edited.id);
              router.back();
            }}
          />
        </Card>
      </ScrollView>
    </Sheet>
  );
}

interface GroupHeaderProps {
  title: string;
  count: number;
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
function GroupHeader({ title, count, open, onPress }: GroupHeaderProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${title}: ${count} цветов`}
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
          {count} цветов
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
  onPress: () => void;
}

/** Строка списка: образец цвета, название и его код. */
function ColorRow({ slot, palette, onPress }: ColorRowProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const color = slot.read(palette);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${slot.name}, ${color}`}
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
      {/* Рамка образца — из палитры самой темы: она у неё своя, и в списке
          цветов этой темы её и надо показывать. */}
      <View
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 32,
          height: 32,
          borderRadius: theme.radius.sm,
          backgroundColor: color,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      />
      <View style={{ flex: 1 }}>
        <AppText variant="body">{slot.name}</AppText>
        <AppText variant="caption" tone="muted">
          {color}
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
