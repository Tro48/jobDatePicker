import { View } from 'react-native';
import { AppText, Button, Card, ChoiceGroup, Screen, Toggle } from '@/ui';
import { SCHEMA_VERSION, useAppStore } from '@/data/store.ts';
import type { ThemePreference } from '@/data/store.ts';
import { AboutSection } from '@/features/settings/AboutSection.tsx';
import { UpdateCard } from '@/features/updates/UpdateCard.tsx';
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
  const tracks = useAppStore((state) => state.tracks);
  const shiftTypeCount = useAppStore((state) => state.shiftTypes.length);
  const overrideCount = tracks.reduce(
    (total, track) => total + Object.keys(track.overrides).length,
    0,
  );
  const paymentCount = useAppStore((state) => state.payments.length);
  const own = tracks.filter((track) => track.own);
  const others = tracks.filter((track) => !track.own);
  const shared = useAppStore((state) => state.sharedDaysOff);
  const setSharedDaysOff = useAppStore((state) => state.setSharedDaysOff);
  const groups = useAppStore((state) => state.sharedGroups);

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

      {/* Совпадающие выходные показываются, только когда есть с кем совпадать:
          настройка без единого чужого графика ничего бы не включала. */}
      {others.length > 0 ? (
        <Card title="Общие выходные">
          <Toggle
            label="Показывать на календаре"
            hint={`Блок со списком дней, когда свободны и ты, и ${others.map((track) => track.name).join(', ')}`}
            value={shared.enabled}
            onValueChange={(enabled) => setSharedDaysOff({ enabled })}
          />
          <AppText variant="caption" tone="muted">
            Выделить чьи-то дни на календаре можно прямо в списке: остальные при этом гаснут.
          </AppText>

          {/* Группы отвечают на вопрос, который по одному человеку не задать:
              когда свободны все разом. */}
          {shared.enabled && others.length > 1 ? (
            <View style={{ gap: theme.spacing.sm }}>
              {groups.map((group) => (
                <Button
                  key={group.id}
                  title={`${group.name} · ${group.trackIds.length}`}
                  accessibilityHint="Изменить состав группы"
                  onPress={() => push({ pathname: '/settings/group', params: { group: group.id } })}
                />
              ))}
              <Button
                title="Добавить группу"
                accessibilityHint="Например «друзья»: общие выходные сразу у нескольких человек"
                onPress={() => push('/settings/group')}
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Выплаты — только у своих работ: деньги чужого графика приложение не
          считает, и настраивать там нечего. */}
      {own.length > 0 ? (
        <Card title="Выплаты">
          <View style={{ gap: theme.spacing.md }}>
            {own.map((track) => (
              <View key={track.id} style={{ gap: 4 }}>
                {own.length > 1 ? <AppText variant="heading">{track.name}</AppText> : null}
                <AppText variant="body" tone="muted">
                  {track.payrollRules
                    .map(
                      (rule) =>
                        `${rule.kind === 'advance' ? 'Аванс' : 'Зарплата'} ${rule.dayOfMonth}-го`,
                    )
                    .join(', ')}
                </AppText>
                <Button
                  title={own.length > 1 ? `Настроить: ${track.name}` : 'Настроить выплаты'}
                  onPress={() =>
                    push({ pathname: '/settings/payroll', params: { track: track.id } })
                  }
                />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

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

        <AboutSection />
      </Card>
    </Screen>
  );
}
