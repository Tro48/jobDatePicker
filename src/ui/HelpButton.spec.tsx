import { render, screen, userEvent } from '@testing-library/react-native';
import { Toggle } from './Toggle.tsx';
import { ThemeProvider } from '@/theme';

/**
 * Пояснение под знаком вопроса.
 *
 * Проверяется главное: на экране его не видно, по нажатию оно приходит, а
 * скринридеру достаётся вместе с самим переключателем — искать отдельную
 * кнопку с вопросом, чтобы понять, что делает тумблер, он не должен.
 */

function renderToggle() {
  return render(
    <ThemeProvider>
      <Toggle
        label="Отмечать праздники"
        help="Праздник помечается значком в клетке."
        value={false}
        onValueChange={() => {}}
      />
    </ThemeProvider>,
  );
}

test('пока не спросили, пояснения на экране нет', async () => {
  await renderToggle();

  expect(screen.queryByText('Праздник помечается значком в клетке.')).toBeNull();
  expect(screen.getByLabelText('Подсказка: Отмечать праздники')).toBeTruthy();
});

test('нажатие на знак вопроса показывает пояснение', async () => {
  await renderToggle();

  await userEvent.press(screen.getByLabelText('Подсказка: Отмечать праздники'));

  expect(screen.getByText('Праздник помечается значком в клетке.')).toBeTruthy();
});

test('скринридер получает пояснение вместе с переключателем', async () => {
  await renderToggle();

  const toggle = screen.getByLabelText('Отмечать праздники');
  expect(toggle.props.accessibilityHint).toContain('Праздник помечается значком в клетке.');
});
