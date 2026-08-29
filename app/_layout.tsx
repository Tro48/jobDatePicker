import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlarmSyncProvider } from '@/features/alarm/AlarmSyncProvider.tsx';
import { ThemeProvider, useTheme } from '@/theme';

/**
 * Корень навигации. Табы лежат в группе (tabs), карточка дня открывается
 * модалкой поверх любой вкладки — она правит день, а не является отдельным
 * разделом приложения.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AlarmSyncProvider>
          <RootStack />
        </AlarmSyncProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const theme = useTheme();

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="day/[date]"
          options={{ presentation: 'modal', headerShown: false }}
        />
        <Stack.Screen
          name="alarm/[id]"
          options={{
            headerShown: true,
            title: 'Будильник',
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
          }}
        />
        <Stack.Screen
          name="summary/year"
          options={{
            headerShown: true,
            title: 'Деньги по месяцам',
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
          }}
        />
        <Stack.Screen
          name="settings/schedule"
          options={{
            headerShown: true,
            title: 'График',
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
          }}
        />
        <Stack.Screen
          name="settings/payroll"
          options={{
            headerShown: true,
            title: 'Выплаты',
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
          }}
        />
      </Stack>
    </>
  );
}
