/**
 * Тесты экранов, хуков и хранилища.
 *
 * Второй набор тестов рядом с доменным, а не вместо него. Доменный бежит в
 * голом Node (`npm run test:domain`) и специально ничего не знает ни про React,
 * ни про сборщик — это держит расчёты чистыми и проверяется самой возможностью
 * их так запустить. Здесь же нужен настоящий React Native, поэтому jest.
 *
 * Разделение по имени файла: `*.test.ts` — домен в Node, `*.spec.tsx` — всё,
 * что требует React. Так один прогон не подхватывает чужие тесты.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
  },
  clearMocks: true,
};
