const {
  createRunOncePlugin,
  withAppBuildGradle,
  withMainApplication,
  withProjectBuildGradle,
} = require('expo/config-plugins');

/**
 * Tracer — отчёты о падениях приложения.
 *
 * Своей нативной части у Tracer нет ни в одном npm-пакете: он подключается
 * gradle-плагином и зависимостями, а каталог `android` в репозитории не лежит —
 * его каждый раз заново собирает `expo prebuild`. Отсюда и этот плагин: он
 * правит сгенерированные файлы, а не хранит их.
 *
 * Включается только когда заданы оба токена из кабинета Tracer:
 * TRACER_PLUGIN_TOKEN и TRACER_APP_TOKEN. Без них сборка идёт как раньше, без
 * Tracer вовсе, — отладочная сборка на своей машине токенов не требует.
 *
 * Из шести модулей Tracer подключены два: отчёты о падениях и о падениях
 * нативной части. Второй нужен из-за будильника — он написан на Kotlin, и
 * падение в нём не видно обычному отчёту. Дампы памяти, метрики диска и два
 * профилировщика не подключены намеренно: они собирают заметно больше данных о
 * телефоне, а нам нужен ответ на один вопрос — почему приложение упало.
 */

// Версия и репозиторий взяты не из документации RuStore: она отстала на два
// года и зовёт за 0.2.7 в репозиторий VK. Сам Tracer с 1.x лежит в Maven
// Central, а он в проекте уже подключён — своего репозитория не нужно вовсе.
// Проверено запросами к repo1.maven.org: все четыре артефакта 1.4.0 на месте.
const TRACER_VERSION = '1.4.0';

/** Оба токена или ничего: с одним Tracer не настроится. */
function tokens() {
  const plugin = process.env.TRACER_PLUGIN_TOKEN;
  const app = process.env.TRACER_APP_TOKEN;
  return plugin && app ? { plugin, app } : null;
}

/**
 * Сам gradle-плагин — в корневой build.gradle, через classpath.
 *
 * Не `plugins { id(...) version(...) }`, как в документации: такая запись
 * ищет плагин в pluginManagement.repositories, а в settings.gradle, который
 * пишет Expo, репозиториев нет вовсе — там только includeBuild.
 */
function patchProjectGradle(contents) {
  if (contents.includes('tracer-plugin')) return contents;

  return contents.replace(
    "    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
    `    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath("ru.ok.tracer:tracer-plugin:${TRACER_VERSION}")`,
  );
}

/**
 * Плагин, токены и зависимости — в build.gradle приложения.
 *
 * uploadMapping выключен: маппинг обфускации Tracer забирает сам при сборке, а
 * у нас minify отключён — заливать нечего.
 */
function patchAppGradle(contents, { plugin, app }) {
  if (contents.includes("apply plugin: 'ru.ok.tracer'")) return contents;

  const withPlugin = contents.replace(
    /apply plugin: "com\.facebook\.react"/,
    `apply plugin: "com.facebook.react"\napply plugin: 'ru.ok.tracer'`,
  );

  const config = `
tracer {
  defaultConfig {
    pluginToken = "${plugin}"
    appToken = "${app}"
    uploadMapping = false
  }
}
`;

  // Версии модулей задаёт platform: так их нельзя развести между собой.
  return withPlugin.replace(
    /dependencies \{/,
    [
      config,
      'dependencies {',
      `    implementation platform("ru.ok.tracer:tracer-platform:${TRACER_VERSION}")`,
      '    implementation "ru.ok.tracer:tracer-crash-report"',
      '    implementation "ru.ok.tracer:tracer-crash-report-native"',
    ].join('\n'),
  );
}

/** Application обязан отдать Tracer список включённых модулей. */
function patchMainApplication(contents) {
  if (contents.includes('HasTracerConfiguration')) return contents;

  const withImports = contents.replace(
    'import expo.modules.ApplicationLifecycleDispatcher',
    [
      'import ru.ok.tracer.HasTracerConfiguration',
      'import ru.ok.tracer.TracerConfiguration',
      'import ru.ok.tracer.crash.report.CrashFreeConfiguration',
      'import ru.ok.tracer.crash.report.CrashReportConfiguration',
      '',
      'import expo.modules.ApplicationLifecycleDispatcher',
    ].join('\n'),
  );

  return withImports.replace(
    'class MainApplication : Application(), ReactApplication {',
    [
      'class MainApplication : Application(), ReactApplication, HasTracerConfiguration {',
      '',
      '  override val tracerConfiguration: List<TracerConfiguration>',
      '    get() = listOf(',
      '      CrashReportConfiguration.build { },',
      '      CrashFreeConfiguration.build { },',
      '    )',
    ].join('\n'),
  );
}

const withTracer = (config) => {
  const found = tokens();
  if (!found) return config;

  let next = withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = patchProjectGradle(mod.modResults.contents);
    return mod;
  });

  next = withAppBuildGradle(next, (mod) => {
    mod.modResults.contents = patchAppGradle(mod.modResults.contents, found);
    return mod;
  });

  return withMainApplication(next, (mod) => {
    mod.modResults.contents = patchMainApplication(mod.modResults.contents);
    return mod;
  });
};

module.exports = createRunOncePlugin(withTracer, 'withTracer', '1.0.0');
