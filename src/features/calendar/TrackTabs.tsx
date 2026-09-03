import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useAppStore } from '@/data/store.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { AppText } from '@/ui';
import { useTheme } from '@/theme';

/** Высота самой вкладки. Зону нажатия до нормы добирает hitSlop. */
const TAB_HEIGHT = 34;

/** Ключ фокуса для кнопки «+»: у неё нет id дорожки. */
const ADD_KEY = '__add__';

export interface TrackTabsProps {
  tracks: ScheduleTrack[];
  /** Id дорожки, на которую смотрят. Уже разрешённый, а не сырой из хранилища. */
  activeTrackId: string | null;
  /** Задан — в конце ряда появляется кнопка «+». */
  onAdd?: () => void;
}

/**
 * Переключение между графиками над календарём.
 *
 * Сами вкладки появляются со второго графика: переключать нечего, пока он
 * один, а имя первой работы человек не выбирал. Кнопка «+» стоит всегда:
 * в настройках графиков больше нет, заводят их отсюда. Подписи у неё нет —
 * рядом с именами графиков любое слово читалось бы как ещё один график.
 *
 * Выбранная вкладка помечена не только цветом: у неё жирное начертание и
 * accessibilityState, по которому TalkBack говорит «выбрано».
 *
 * Ряд прокручивается: имена задаёт человек, а системный шрифт может быть
 * увеличен вдвое — три вкладки в ширину экрана не влезут ни при каких отступах.
 *
 * Вкладка низкая, но нажимается по-прежнему на 48 dp: до нормы её добирает
 * hitSlop сверху и снизу. Уменьшать саму зону нажатия нельзя, а вот занимать
 * ею высоту над календарём — незачем.
 */
export function TrackTabs({ tracks, activeTrackId, onAdd }: TrackTabsProps) {
  const theme = useTheme();
  // Сколько добрать до нормы зоны нажатия сверху и снизу.
  const slop = Math.max(0, Math.round((theme.minTouchTarget - TAB_HEIGHT) / 2));
  const setActiveTrack = useAppStore((state) => state.setActiveTrack);
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.xs, paddingBottom: theme.spacing.sm }}
    >
      <View
        accessibilityRole="tablist"
        accessibilityLabel="Графики"
        style={{ flexDirection: 'row', gap: theme.spacing.xs }}
      >
        {(tracks.length > 1 ? tracks : []).map((track) => {
          const selected = track.id === activeTrackId;
          const hasFocus = focused === track.id;

          return (
            <Pressable
              key={track.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={track.name}
              accessibilityHint={selected ? undefined : 'Показать этот график в календаре'}
              onPress={() => setActiveTrack(track.id)}
              onFocus={() => setFocused(track.id)}
              onBlur={() => setFocused(null)}
              hitSlop={{ top: slop, bottom: slop }}
              style={{
                minHeight: TAB_HEIGHT,
                justifyContent: 'center',
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radius.pill,
                borderWidth: hasFocus ? theme.focusRingWidth : 1,
                borderColor: hasFocus
                  ? theme.colors.focus
                  : selected
                    ? theme.colors.accent
                    : theme.colors.border,
                backgroundColor: selected ? theme.colors.accent : theme.colors.surfaceElevated,
              }}
            >
              <AppText
                variant="label"
                color={selected ? theme.colors.onAccent : theme.colors.text}
                style={{ fontWeight: selected ? '700' : '400' }}
              >
                {track.name}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Кнопка вне tablist: это не вкладка, и объявлять её вкладкой значит
          соврать скринридеру про число графиков. Правка живёт не здесь, а
          внизу страницы графика: она относится к открытому календарю целиком,
          а не к переключателю. */}
      {onAdd ? (
        <RowButton
          id={ADD_KEY}
          label="Добавить график"
          hint="Вторая работа или график близкого человека"
          icon="add"
          focused={focused === ADD_KEY}
          slop={slop}
          onPress={onAdd}
          onFocusChange={setFocused}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * Кнопка ряда: только иконка, зона нажатия добирается тем же hitSlop, что и у
 * вкладок. Смысл несёт accessibilityLabel — рядом с именами графиков любое
 * слово читалось бы как ещё один график.
 */
function RowButton({
  id,
  label,
  hint,
  icon,
  focused,
  slop,
  onPress,
  onFocusChange,
}: {
  id: string;
  label: string;
  hint: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  focused: boolean;
  slop: number;
  onPress: () => void;
  onFocusChange: (id: string | null) => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      onFocus={() => onFocusChange(id)}
      onBlur={() => onFocusChange(null)}
      hitSlop={{ top: slop, bottom: slop }}
      style={{
        minHeight: TAB_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        borderWidth: focused ? theme.focusRingWidth : 1,
        borderColor: focused ? theme.colors.focus : theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
      }}
    >
      <Ionicons
        name={icon}
        size={18}
        color={theme.colors.text}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}
