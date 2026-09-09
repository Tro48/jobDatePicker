import { View } from 'react-native';
import { AppText, Button, Card, Screen, Toggle } from '@/ui';
import { useAppStore } from '@/data/store.ts';
import { ThemeList } from '@/features/theme/ThemeList.tsx';
import { DataActions } from '@/features/backup/DataActions.tsx';
import { AboutSection } from '@/features/settings/AboutSection.tsx';
import { UpdateCard } from '@/features/updates/UpdateCard.tsx';
import { useGuardedPush } from '@/navigation/useGuardedPush.ts';
import { useTheme } from '@/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const push = useGuardedPush();
  const tracks = useAppStore((state) => state.tracks);
  const shiftTypeCount = useAppStore((state) => state.shiftTypes.length);
  const own = tracks.filter((track) => track.own);
  const others = tracks.filter((track) => !track.own);
  const holidays = useAppStore((state) => state.holidays);
  const setHolidays = useAppStore((state) => state.setHolidays);
  const shared = useAppStore((state) => state.sharedDaysOff);
  const setSharedDaysOff = useAppStore((state) => state.setSharedDaysOff);
  const groups = useAppStore((state) => state.sharedGroups);

  return (
    <Screen title="Настройки">
      {/* Свои темы стоят в том же списке, что встроенные: выбор оформления
          один, и разносить его по двум местам незачем. */}
      <Card title="Оформление">
        <ThemeList />
      </Card>

      {/* Смены живут в настройках, а не в календаре: их правят один раз при
          заведении графика, а потом почти не трогают. */}
      <Card title="График">
        <Button
          title="Смены"
          accessibilityHint={`Сейчас в справочнике ${shiftTypeCount}. Здесь заводится своя смена: вечерняя, подработка, учёба`}
          onPress={() => push('/settings/shift-types')}
        />
        <Toggle
          label="Отмечать праздники"
          help="Российский производственный календарь: праздник помечается значком в клетке. В графике по дням недели он ещё и делает день нерабочим — на сменные графики не влияет."
          value={holidays.enabled}
          onValueChange={(enabled) => setHolidays({ enabled })}
        />
      </Card>

      {/* Совпадающие выходные показываются, только когда есть с кем совпадать:
          настройка без единого чужого графика ничего бы не включала. */}
      {others.length > 0 ? (
        <Card title="Общие выходные">
          <Toggle
            label="Показывать на календаре"
            hint={`Свободны и ты, и ${others.map((track) => track.name).join(', ')}`}
            help="Под календарём появится список дней, когда свободны все. Нажатие на строку выделяет эти дни в сетке, остальные при этом гаснут. Отсыпной после ночной за общий выходной не считается."
            value={shared.enabled}
            onValueChange={(enabled) => setSharedDaysOff({ enabled })}
          />

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
        {/* Копия и обмен живут здесь же, а не отдельной карточкой: это всё
            про одни и те же данные. Счётчиков — правок, выплат, типов смен и
            версии схемы — здесь больше нет: делать по ним было нечего, а
            место они занимали над кнопками, ради которых сюда и заходят. */}
        <DataActions />

        <AboutSection />
      </Card>
    </Screen>
  );
}
