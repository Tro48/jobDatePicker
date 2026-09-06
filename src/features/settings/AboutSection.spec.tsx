import { render } from '@testing-library/react-native';
import { AboutSection } from './AboutSection.tsx';
import { ThemeProvider } from '@/theme';

/**
 * Ссылки в «О приложении».
 *
 * Проверяется правило площадки, которое ломается молча: в сборке для магазина
 * из приложения нельзя вести на страницу выпусков GitHub — там лежат APK, и
 * для RuStore это сторонняя витрина. Заметить такую ошибку глазами можно
 * только в готовой сборке, а стоит она отказом в публикации.
 */

const mockExtra: { distribution?: string } = {};
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { version: '0.1.6', extra: mockExtra };
    },
  },
}));

function renderAbout() {
  return render(
    <ThemeProvider>
      <AboutSection />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  delete mockExtra.distribution;
});

test('обычная сборка ведёт на исходный код', async () => {
  const view = await renderAbout();

  expect(view.getByLabelText('Исходный код на GitHub')).toBeTruthy();
  expect(view.queryByLabelText('Страница приложения в RuStore')).toBeNull();
});

test('в сборке для магазина ссылки на GitHub нет, а на карточку — есть', async () => {
  mockExtra.distribution = 'rustore';
  const view = await renderAbout();

  expect(view.queryByLabelText('Исходный код на GitHub')).toBeNull();
  expect(view.getByLabelText('Страница приложения в RuStore')).toBeTruthy();
});

test('политика конфиденциальности доступна в любой сборке', async () => {
  const plain = await renderAbout();
  expect(plain.getByLabelText('Политика конфиденциальности')).toBeTruthy();
  await plain.unmount();

  mockExtra.distribution = 'rustore';
  const store = await renderAbout();
  expect(store.getByLabelText('Политика конфиденциальности')).toBeTruthy();
});
