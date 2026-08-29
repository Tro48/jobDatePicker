import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlarmSyncProvider } from '@/features/alarm/AlarmSyncProvider.tsx';
import { useReduceMotion } from '@/ui';
import { ThemeProvider, useTheme } from '@/theme';

/**
 * Корень навигации. Табы лежат в группе (tabs); всё, что вызывается изнутри
 * вкладок, открывается шторкой поверх текущего экрана — это работа поверх
 * него, а не отдельный раздел приложения.
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
  const reduceMotion = useReduceMotion();

  /**
   * Общие настройки шторки: выезжает снизу, фон прозрачный — скругления и
   * подложку рисует сам экран через компонент Sheet. Анимация снимается, когда
   * система просит уменьшить движение.
   */
  const sheet = {
    presentation: 'transparentModal',
    animation: reduceMotion ? 'none' : 'slide_from_bottom',
    headerShown: false,
    contentStyle: { backgroundColor: 'transparent' },
  } as const;

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
        <Stack.Screen name="day/[date]" options={sheet} />
        <Stack.Screen name="alarm/[id]" options={sheet} />
        <Stack.Screen name="summary/year" options={sheet} />
        <Stack.Screen name="settings/schedule" options={sheet} />
        <Stack.Screen name="settings/payroll" options={sheet} />
      </Stack>
    </>
  );
}
