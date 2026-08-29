import { View } from 'react-native';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { formatDayShort } from '@/domain/format.ts';
import { AppText, Button, Card, ChoiceGroup, Screen } from '@/ui';
import { SCHEMA_VERSION, useAppStore } from '@/data/store.ts';
import type { ThemePreference } from '@/data/store.ts';
import { UpdateCard } from '@/features/settings/UpdateCard.tsx';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { useTheme } from '@/theme';

const THEME_CHOICES = [
  { value: 'system', label: 'Как в системе', hint: 'Следовать настройке телефона' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string; hint?: string }>;

export default function SettingsScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
  const appearance = useAppStore((state) => state.appearance);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const schedule = useAppStore((state) => state.schedule);
  const shiftTypeCount = useAppStore((state) => state.shiftTypes.length);
  const overrideCount = useAppStore((state) => Object.keys(state.overrides).length);
  const paymentCount = useAppStore((state) => state.payments.length);
  const payroll = useAppStore((state) => state.payroll);

  return (
    <Screen title="Настройки">
      <Card title="Оформление">
        <ChoiceGroup
          label="Тема оформления"
          choices={THEME_CHOICES}
          value={appearance}
          onChange={setAppearance}
        />
        <AppText variant="caption" tone="muted">
          Сейчас применена {theme.scheme === 'dark' ? 'тёмная' : 'светлая'} тема.
        </AppText>
      </Card>

      <Card title="График">
        <AppText variant="body">
          {schedule
            ? `${SCHEDULE_PRESETS.find((item) => item.id === schedule.presetId)?.name ?? schedule.presetId}, первая смена ${formatDayShort(schedule.anchorDate)}`
            : 'График не выбран — календарь пуст.'}
        </AppText>
        <Button
          title={schedule ? 'Изменить график' : 'Выбрать график'}
          variant={schedule ? 'secondary' : 'primary'}
          onPress={() => push('/settings/schedule')}
        />
      </Card>

      <Card title="Выплаты">
        <AppText variant="body">
          {payroll.rules
            .map((rule) => `${rule.kind === 'advance' ? 'Аванс' : 'Зарплата'} ${rule.dayOfMonth}-го`)
            .join(', ')}
        </AppText>
        <Button title="Настроить выплаты" onPress={() => push('/settings/payroll')} />
      </Card>

      <UpdateCard />

      <Card title="Данные">
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="body" tone="muted">
            Версия схемы хранилища: {SCHEMA_VERSION}
          </AppText>
          <AppText variant="body" tone="muted">
            Типов смен: {shiftTypeCount}
          </AppText>
          <AppText variant="body" tone="muted">
            Ручных правок: {overrideCount}
          </AppText>
          <AppText variant="body" tone="muted">
            Внесённых выплат: {paymentCount}
          </AppText>
        </View>
      </Card>
    </Screen>
  );
}
