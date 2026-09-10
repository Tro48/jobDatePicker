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
 * Tracer вовсе, — так отладочная сборка на своей машине не требует ни токенов,
 * ни доступа к репозиториям VK.
 *
 * Из шести модулей Tracer подключены два: отчёты о падениях и о падениях
 * нативной части. Второй нужен из-за будильника — он написан на Kotlin, и
 * падение в нём не видно обычному отчёту. Дампы памяти, метрики диска и два
 * профилировщика не подключены намеренно: они собирают заметно больше данных о
 * телефоне, а нам нужен ответ на один вопрос — почему приложение упало.
 */

const TRACER_VERSION = '0.2.7';
const MAVEN = 'https://artifactory-external.vkpartner.ru/artifactory/maven/';

/** Оба токена или ничего: с одним Tracer не настроится. */
function tokens() {
  const plugin = process.env.TRACER_PLUGIN_TOKEN;
  const app = process.env.TRACER_APP_TOKEN;
  return plugin && app ? { plugin, app } : null;
}

/** Репозиторий VK и сам gradle-плагин — в корневой build.gradle. */
function patchProjectGradle(contents) {
  let next = contents;

  if (!next.includes('tracer-plugin')) {
    next = next.replace(
      "    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')",
      `    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n    classpath("ru.ok.tracer:tracer-plugin:${TRACER_VERSION}")`,
    );
  }

  // Репозиторий нужен дважды: buildscript берёт оттуда сам плагин,
  // allprojects — библиотеки, которые он приносит.
  if (!next.includes(MAVEN)) {
    next = next
      .replace(
        'buildscript {\n  repositories {\n    google()\n    mavenCentral()',
        `buildscript {\n  repositories {\n    google()\n    mavenCentral()\n    maven { url '${MAVEN}' }`,
      )
      .replace(
        "allprojects {\n  repositories {\n    google()\n    mavenCentral()\n    maven { url 'https://www.jitpack.io' }",
        `allprojects {\n  repositories {\n    google()\n    mavenCentral()\n    maven { url 'https://www.jitpack.io' }\n    maven { url '${MAVEN}' }`,
      );
  }

  return next;
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

  return withPlugin.replace(
    /dependencies \{/,
    `${config}\ndependencies {\n    implementation "ru.ok.tracer:tracer-crash-report:${TRACER_VERSION}"\n    implementation "ru.ok.tracer:tracer-crash-report-native:${TRACER_VERSION}"`,
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
