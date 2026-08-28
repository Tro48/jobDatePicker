import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '@/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Вкладка с иконкой описывается одной строкой — состав меняется в одном месте. */
const TABS: Array<{ name: string; title: string; icon: IoniconName }> = [
  { name: 'index', title: 'Календарь', icon: 'calendar-outline' },
  { name: 'summary', title: 'Сводка', icon: 'stats-chart-outline' },
  { name: 'alarm', title: 'Будильник', icon: 'alarm-outline' },
  { name: 'settings', title: 'Настройки', icon: 'settings-outline' },
];

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        // Подпись под иконкой обязательна: одна иконка без текста читается
        // по-разному и не даёт скринридеру осмысленного имени.
        tabBarShowLabel: true,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, size }) => <Ionicons name={icon} size={size} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
