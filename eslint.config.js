const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');
const prettier = require('eslint-config-prettier/flat');

/**
 * Проверка кода.
 *
 * Собрана из typescript-eslint и правил хуков напрямую, без eslint-config-expo:
 * тот тянет eslint-plugin-react версии, несовместимой с ESLint 10 (падает на
 * context.getFilename), а держать ради него ESLint 9, снятый с поддержки, — не
 * та цена. Из выброшенного набора здесь важны ровно две вещи: типы и хуки, обе
 * на месте.
 *
 * Всё, что спорит с форматтером, выключает eslint-config-prettier последним
 * блоком: за переносы и скобки отвечает prettier, линтер занимается смыслом.
 */
module.exports = [
  {
    ignores: ['node_modules/**', '.expo/**', 'android/**', 'ios/**', 'assets/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
        // React Native даёт свой набор глобальных: fetch, console, таймеры,
        // AbortController, __DEV__.
        __DEV__: 'readonly',
      },
    },
    rules: {
      /*
       * Неиспользуемое — ошибка, а не предупреждение: предупреждения в этом
       * проекте некому читать, CI смотрит только на код возврата. Имена с
       * подчёркиванием в начале разрешены — так помечается намеренно
       * неиспользуемый параметр, например _version в миграции состояния.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          // `const { [date]: removed, ...rest } = overrides` — это удаление
          // ключа, а не забытая переменная.
          ignoreRestSiblings: true,
        },
      ],

      // Классика: она ловит настоящие ошибки и молчит на рабочем коде.
      'react-hooks/exhaustive-deps': 'error',

      /*
       * А эти два правила эпохи React Compiler спорят с идиомами React Native
       * и ругаются на рабочий код:
       *
       * refs — на `useRef(new Animated.Value(0)).current` в стиле трансформа и
       * на чтение ref внутри колбэка жеста: анализатор видит обращение в теле
       * useMemo, хотя выполняется оно в момент касания;
       *
       * set-state-in-effect — на синхронизацию поля с изменившимися снаружи
       * данными и на разбор ошибки «нет разрешения на точные будильники».
       *
       * Переписывать ради них работающую шторку и планировщик будильников
       * вслепую, без возможности проверить на телефоне, дороже, чем не иметь
       * этих двух правил.
       */
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },

  {
    // Конфиги и скрипты сборки — обычный CommonJS под Node.
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
    // Конфиг ESLint и настройка отпечатка грузятся Node как CommonJS: другого
    // способа подключить их, кроме require, нет.
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Скрипты и доменные тесты бегут в голом Node, а не в приложении.
    files: ['scripts/**/*.ts', '**/__tests__/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    // Тесты на jest: describe, test, expect и сам jest приходят из окружения.
    files: ['**/*.spec.ts', '**/*.spec.tsx', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  prettier,
];
