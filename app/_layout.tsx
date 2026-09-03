import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { enableFreeze } from 'react-native-screens';
import { AlarmSyncProvider } from '@/features/alarm/AlarmSyncProvider.tsx';
import { AppErrorScreen } from '@/features/errors/AppErrorScreen.tsx';
import { useReduceMotion } from '@/ui';
import { ThemeProvider, useTheme } from '@/theme';

/**
 * Вкладки, на которые сейчас не смотрят, перестают рисоваться.
 *
 * react-native-screens по умолчанию этого не делает: посещённая вкладка
 * остаётся смонтированной и живой, и любое изменение хранилища перерисовывает
 * её вместе с открытой. Нажатие на вкладку графика пересчитывало сразу и
 * календарь с тремя месячными сетками, и сводку с её страницами, и список
 * будильников — при том, что видно из них одно.
 *
 * Вызывается на уровне модуля: флаг читается при первом рендере экрана, и
 * поставить его из эффекта уже поздно.
 */
enableFreeze();

/**
 * Запасной экран вместо белого поля.
 *
 * expo-router подставляет этот экспорт, когда что-то в дереве бросило исключение.
 * Домен бросает намеренно — на неизвестном типе смены и на пустом цикле, — и без
 * этой страховки такая ошибка означала бы приложение, из которого нельзя выйти
 * иначе как переустановкой.
 */
export { AppErrorScreen as ErrorBoundary };

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
        <Stack.Screen name="whats-new" options={sheet} />
        <Stack.Screen name="settings/schedule" options={sheet} />
        <Stack.Screen name="settings/payroll" options={sheet} />
        <Stack.Screen name="settings/group" options={sheet} />
      </Stack>
    </>
  );
}
