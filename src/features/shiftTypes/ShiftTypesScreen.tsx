import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { shiftDurationMinutes } from '@/domain/engine.ts';
import { formatDuration, formatTimeRange } from '@/domain/format.ts';
import { isBuiltinShiftType } from '@/domain/shifts.ts';
import type { ShiftType } from '@/domain/types.ts';
import { useAppStore } from '@/data/store.ts';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { AppText, Button, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';
import { ShiftBadge } from './ShiftBadge.tsx';

/**
 * Справочник смен целиком: и встроенные, и заведённые руками.
 *
 * Отдельный экран, а не блок в настройках: смен десяток, у каждой время,
 * перерыв и цвет, и в карточку настроек это не помещается.
 */
export function ShiftTypesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const push = useGuardedPush();
  const scroll = useSheetScroll();
  const shiftTypes = useAppStore((state) => state.shiftTypes);

  const own = shiftTypes.filter((type) => !isBuiltinShiftType(type));

  return (
    <Sheet title="Смены" onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Все смены">
          <AppText variant="caption" tone="muted">
            Нажми на смену, чтобы поменять название, время или цвет. Встроенные смены правятся так
            же, но не удаляются: на них стоят готовые графики.
          </AppText>

          <View style={{ gap: theme.spacing.sm }}>
            {shiftTypes.map((type) => (
              <ShiftTypeRow
                key={type.id}
                shiftType={type}
                onPress={() =>
                  push({ pathname: '/settings/shift-type', params: { type: type.id } })
                }
              />
            ))}
          </View>
        </Card>

        <View style={{ gap: theme.spacing.md }}>
          <Button
            title="Добавить смену"
            variant="primary"
            accessibilityHint="Например вечерняя с 16:00 до 00:00"
            onPress={() => push({ pathname: '/settings/shift-type', params: { type: 'new' } })}
          />
          <AppText variant="caption" tone="muted">
            {own.length > 0
              ? `Своих смен: ${own.length}. Их можно ставить на день и собирать из них свой график.`
              : 'Своих смен пока нет. Заведённая смена появится и в карточке дня, и в конструкторе графика.'}
          </AppText>
        </View>
      </ScrollView>
    </Sheet>
  );
}

interface ShiftTypeRowProps {
  shiftType: ShiftType;
  onPress: () => void;
}

/** Строка списка: значок, название и то, чем эта смена отличается от соседних. */
function ShiftTypeRow({ shiftType, onPress }: ShiftTypeRowProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const details = describeShiftType(shiftType);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shiftType.name}, ${details}`}
      accessibilityHint="Открывает правку смены"
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
      <ShiftBadge shiftType={shiftType} />
      <View style={{ flex: 1 }}>
        <AppText variant="body">{shiftType.name}</AppText>
        <AppText variant="caption" tone="muted">
          {details}
        </AppText>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={theme.colors.textMuted}
        // Стрелка ничего не добавляет к озвучке строки: она уже прочитана целиком.
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

/** Чем смена отличается от соседних: время, длительность, надбавка. */
function describeShiftType(shiftType: ShiftType): string {
  if (shiftType.kind === 'rest') {
    return shiftType.multiDay ? 'Нерабочий день, ставится периодом' : 'Нерабочий день';
  }

  const parts: string[] = [];
  if (shiftType.time) parts.push(formatTimeRange(shiftType.time.start, shiftType.time.end));
  parts.push(formatDuration(shiftDurationMinutes(shiftType)));
  if (shiftType.time && shiftType.time.unpaidBreakMinutes > 0) {
    parts.push(`перерыв ${shiftType.time.unpaidBreakMinutes} мин`);
  }
  if (shiftType.rateMultiplier !== 1) {
    parts.push(`надбавка ×${formatMultiplier(shiftType.rateMultiplier)}`);
  }
  return parts.join(' · ');
}

/** «1,2» вместо «1.2»: в остальном приложении числа тоже с запятой. */
export function formatMultiplier(value: number): string {
  return String(value).replace('.', ',');
}
