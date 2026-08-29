import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Два приложения из одного кода: отладочное и рабочее.
 *
 * Различаются идентификатором пакета, поэтому стоят на телефоне рядом и не
 * затирают данные друг друга. Отладочное подписано как отдельное приложение,
 * запускается с Metro и живёт вместе с рабочим, которое собирается в CI при
 * попадании изменений в main.
 *
 * Вариант выбирается переменной APP_VARIANT: её задают профиль development в
 * eas.json и npm-скрипты запуска. Без неё собирается рабочее приложение —
 * значение по умолчанию должно быть безопасным.
 */
const DEV_VARIANT = 'development';

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDev = process.env.APP_VARIANT === DEV_VARIANT;
  if (!isDev) return config as ExpoConfig;

  return {
    ...(config as ExpoConfig),
    name: 'Смены dev',
    // Своя схема: с одинаковой Android спрашивал бы, какое из двух приложений
    // открыть по ссылке.
    scheme: 'jobdatepickerdev',
    icon: './assets/icon-dev.png',
    android: {
      ...config.android,
      package: 'com.andrey.jobdatepicker.dev',
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage: './assets/android-icon-foreground-dev.png',
      },
    },
  };
};
