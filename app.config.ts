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

/**
 * Куда едет эта сборка. Задаётся профилем rustore в eas.json.
 *
 * Меняет ровно одно: из сборки для магазина убирается канал доставки APK через
 * GitHub Releases. Правила площадки запрещают вести из приложения на сторонние
 * витрины, а обновляться такое приложение обязано средствами самого магазина.
 */
const STORE_DISTRIBUTION = 'rustore';

/**
 * Разрешения, которые в сборку для магазина не едут.
 *
 * Ни одно из них приложению не нужно — их дописывает prebuild за компанию с
 * инструментами разработки. Найдены не глазами, а сверкой слитого релизного
 * манифеста (`processReleaseMainManifest`) со списком того, что мы объявляем.
 *
 * SYSTEM_ALERT_WINDOW нужен меню разработчика из expo-dev-client. Для площадки
 * это «показ поверх других приложений» — одно из самых придирчиво проверяемых
 * разрешений, и объяснить его в приложении с календарём смен нечем.
 *
 * Доступ к внешнему хранилищу не нужен тем более: файл выбирается системным
 * проводником, а отдаётся через системное «Поделиться» — оба пути работают без
 * единого разрешения.
 *
 * В отладочной и обычной сборке всё остаётся как было: меню разработчика там
 * должно работать.
 */
const STORE_BLOCKED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
] as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const forStore = process.env.APP_DISTRIBUTION === STORE_DISTRIBUTION;
  const isDev = process.env.APP_VARIANT === DEV_VARIANT;

  if (forStore) {
    // Ссылки на список выпусков в сборке для магазина просто нет: без неё
    // useBuildSignal не ходит в сеть вовсе, а кнопка «Скачать APK» не
    // появляется — отключать её отдельной веткой в коде не приходится.
    const { releaseManifestUrl, ...extra } = config.extra ?? {};
    return {
      ...(config as ExpoConfig),
      android: { ...config.android, blockedPermissions: [...STORE_BLOCKED_PERMISSIONS] },
      extra: { ...extra, distribution: STORE_DISTRIBUTION },
    };
  }

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
      package: 'com.trofimdev.jobdatepicker.dev',
      adaptiveIcon: {
        ...config.android?.adaptiveIcon,
        foregroundImage: './assets/android-icon-foreground-dev.png',
      },
    },
  };
};
