import { Linking, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  isAlarmModuleAvailable,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  openNotificationSettings,
} from '@modules/shift-alarm';
import { AppText, Button, Card, Sheet, useSheetScroll } from '@/ui';
import { useTheme } from '@/theme';

/**
 * «Будильник не звонит».
 *
 * Самая частая жалоба на приложения-будильники, и почти никогда она не про
 * будильник: оболочки Xiaomi, Huawei, Oppo и Vivo выгружают приложение из
 * памяти вместе с его расписанием, а обратно не пускают, пока не разрешишь
 * автозапуск руками. Android такого экрана не показывает и такого разрешения
 * не спрашивает — рассказать об этом может только само приложение.
 *
 * Инструкции текстом, а не одними кнопками: путь к автозапуску у каждой
 * оболочки свой и системным intent'ом не открывается. Кнопки ведут туда, куда
 * Android пускает всех: точные будильники, уведомления, экономия батареи.
 */
export function AlarmHelpScreen() {
  const theme = useTheme();
  const router = useRouter();
  const scroll = useSheetScroll();

  return (
    <Sheet title="Будильник не звонит" onClose={() => router.back()}>
      <ScrollView
        {...scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}
      >
        <Card title="Сначала — разрешения">
          <AppText variant="body">
            Без точных будильников Android не даст поставить расписание вовсе, а без уведомлений не
            покажет звонок. Эти два разрешения слетают после обновления приложения чаще всего.
          </AppText>
          {isAlarmModuleAvailable ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Button title="Точные будильники" onPress={openExactAlarmSettings} />
              <Button title="Уведомления" onPress={openNotificationSettings} />
              <Button title="Экран поверх блокировки" onPress={openFullScreenIntentSettings} />
            </View>
          ) : (
            <AppText variant="body" tone="muted">
              В этой сборке нативной части будильника нет — кнопки появятся после обновления
              приложения.
            </AppText>
          )}
        </Card>

        <Card title="Потом — экономия батареи">
          <AppText variant="body">
            Android усыпляет приложения, которыми давно не пользовались. Будильник от этого не
            звонит или звонит с опозданием на несколько минут. Лечится одним переключателем: в
            списке «Батарея» найди «Смены» и поставь «Без ограничений».
          </AppText>
          <Button
            title="Открыть список батареи"
            variant="primary"
            accessibilityHint="Системный список приложений и ограничений батареи"
            onPress={openBatterySettings}
          />
        </Card>

        <Card title="Оболочка телефона">
          <AppText variant="body" tone="muted">
            Xiaomi, Huawei, Oppo, Vivo и Samsung поверх Android ставят собственную экономию памяти.
            Она выгружает приложение целиком, и вместе с ним пропадает поставленный будильник.
            Системными настройками это не чинится — только настройками самой оболочки.
          </AppText>

          <View style={{ gap: theme.spacing.md }}>
            {SHELL_STEPS.map((shell) => (
              <View key={shell.brand} style={{ gap: 2 }}>
                <AppText variant="heading" accessibilityRole="header">
                  {shell.brand}
                </AppText>
                {shell.steps.map((step) => (
                  <AppText key={step} variant="body" tone="muted">
                    {step}
                  </AppText>
                ))}
              </View>
            ))}
          </View>

          <AppText variant="caption" tone="muted">
            Названия пунктов отличаются от версии к версии оболочки: ищи по словам «автозапуск»,
            «фоновая работа» и «энергосбережение».
          </AppText>
        </Card>

        <Card title="Если всё равно молчит">
          <AppText variant="body" tone="muted">
            Проверь, что будильник включён, что у него стоят нужные дни, а телефон не в режиме «Не
            беспокоить» без исключения для будильников. Ближайший звонок и его дата написаны прямо в
            строке будильника — если там пусто, дело в самом расписании, а не в системе.
          </AppText>
          <Button
            title="Открыть настройки приложения"
            onPress={() => void Linking.openSettings()}
          />
        </Card>
      </ScrollView>
    </Sheet>
  );
}

/**
 * Пути в оболочках. Обычный текст, а не intent: экраны автозапуска у
 * производителей закрыты для сторонних приложений, открыть их можно только
 * руками.
 */
const SHELL_STEPS: ReadonlyArray<{ brand: string; steps: readonly string[] }> = [
  {
    brand: 'Xiaomi, Redmi, POCO',
    steps: [
      'Настройки → Приложения → Смены → Автозапуск — включить.',
      'Там же «Контроль активности» → «Нет ограничений».',
      'В списке недавних приложений потяни карточку вниз и нажми на замок — тогда оболочка не выгрузит приложение.',
    ],
  },
  {
    brand: 'Huawei, Honor',
    steps: [
      'Настройки → Батарея → Запуск приложений → Смены — выключить «Управлять автоматически».',
      'Включить все три: автозапуск, косвенный запуск и работу в фоне.',
    ],
  },
  {
    brand: 'Oppo, Realme, OnePlus',
    steps: [
      'Настройки → Батарея → Экономия энергии → Смены — «Не ограничивать».',
      'Настройки → Приложения → Смены → Разрешить автозапуск.',
    ],
  },
  {
    brand: 'Vivo, iQOO',
    steps: [
      'Настройки → Батарея → Высокое потребление в фоне — разрешить для «Смен».',
      'Настройки → Приложения → Автозапуск — включить.',
    ],
  },
  {
    brand: 'Samsung',
    steps: [
      'Настройки → Батарея → Ограничения в фоне → Приложения в спящем режиме — убрать «Смены» из списка.',
      'Там же выключить «Перевод в спящий режим неиспользуемых приложений».',
    ],
  },
];

/**
 * Системный список ограничений батареи.
 *
 * sendIntent, а не нативный модуль: экран стандартный для Android, и ради него
 * незачем менять нативную часть и платить сборкой APK. Если оболочка такого
 * экрана не держит, открываются настройки самого приложения — оттуда до
 * батареи один шаг.
 */
function openBatterySettings(): void {
  Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS').catch(() => {
    void Linking.openSettings();
  });
}
