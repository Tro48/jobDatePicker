import { View } from 'react-native';
import { AppText, Card, ChoiceGroup, Placeholder, Screen } from '@/ui';
import { SCHEMA_VERSION, useAppStore } from '@/data/store.ts';
import type { ThemePreference } from '@/data/store.ts';
import { useTheme } from '@/theme';

const THEME_CHOICES = [
  { value: 'system', label: 'Как в системе', hint: 'Следовать настройке телефона' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
] as const satisfies ReadonlyArray<{ value: ThemePreference; label: string; hint?: string }>;

export default function SettingsScreen() {
  const theme = useTheme();
  const appearance = useAppStore((state) => state.appearance);
  const setAppearance = useAppStore((state) => state.setAppearance);
  const schedule = useAppStore((state) => state.schedule);
  const shiftTypeCount = useAppStore((state) => state.shiftTypes.length);
  const overrideCount = useAppStore((state) => Object.keys(state.overrides).length);
  const paymentCount = useAppStore((state) => state.payments.length);

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
        <Placeholder stage="Этап 2 плана работ">
          {schedule
            ? `Выбран график «${schedule.presetId}», первая смена ${schedule.anchorDate}.`
            : 'Выбор графика из списка и дата первой смены с предпросмотром на две недели.'}
        </Placeholder>
      </Card>

      <Card title="Выплаты">
        <Placeholder stage="Этап 3 плана работ">
          Дни аванса и зарплаты, в каком месяце они приходят относительно отработанного.
        </Placeholder>
      </Card>

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
        <Placeholder stage="Этап 5 плана работ">
          Экспорт и импорт всех данных в JSON.
        </Placeholder>
      </Card>
    </Screen>
  );
}
