import { useState } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ColorPicker } from './ColorPicker.tsx';
import { ThemeProvider } from '@/theme';

/**
 * Выбор цвета.
 *
 * Проверяется то, ради чего компонент и написан: цвет набирается кодом и
 * меняется полосой тона без единого касания экрана — то есть работает и для
 * того, кто пользуется скринридером. Квадрат оттенка здесь не проверить: в
 * jest у него нет ни размеров, ни места на экране, а без них жест ничего не
 * значит.
 */

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function Harness({ initial = '#1D4ED8' }: { initial?: string }) {
  const [color, setColor] = useState(initial);
  return (
    <ThemeProvider>
      <ColorPicker value={color} onChange={setColor} label="Акцент" />
    </ThemeProvider>
  );
}

test('набранный код становится цветом', async () => {
  const view = await render(<Harness />);
  const field = view.getByLabelText('Код цвета');

  await act(async () => {
    fireEvent.changeText(field, '#b42318');
  });
  await act(async () => {
    fireEvent(field, 'blur');
  });

  expect(view.getByLabelText('Код цвета').props.value).toBe('#B42318');
});

test('короткая запись разворачивается в полную', async () => {
  const view = await render(<Harness />);
  const field = view.getByLabelText('Код цвета');

  await act(async () => {
    fireEvent.changeText(field, '#abc');
  });
  await act(async () => {
    fireEvent(field, 'blur');
  });

  expect(view.getByLabelText('Код цвета').props.value).toBe('#AABBCC');
});

test('недобранный код не стирает цвет под пальцами', async () => {
  const view = await render(<Harness />);
  const field = view.getByLabelText('Код цвета');

  // Половина набора — обычное состояние поля: в нём остаётся то, что набрали,
  // а наружу цвет не уходит.
  await act(async () => {
    fireEvent.changeText(field, '#12');
  });
  expect(view.getByLabelText('Код цвета').props.value).toBe('#12');
  expect(view.getByText('Шесть цифр после решётки: #1D4ED8')).toBeTruthy();

  await act(async () => {
    fireEvent(field, 'blur');
  });
  expect(view.getByLabelText('Код цвета').props.value).toBe('#1D4ED8');
});

test('полоса тона озвучивается значением, а не одним лишь цветом', async () => {
  const view = await render(<Harness initial="#FF0000" />);

  expect(view.getByLabelText('Акцент: тон').props.accessibilityValue).toEqual({
    min: 0,
    max: 360,
    now: 0,
    text: '0 градусов',
  });
});

test('тон меняется жестами скринридера, без попадания пальцем в полосу', async () => {
  const view = await render(<Harness initial="#FF0000" />);

  await act(async () => {
    fireEvent(view.getByLabelText('Акцент: тон'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
  });

  // Шаг тона — пять градусов: красный уходит в оранжевый.
  expect(view.getByLabelText('Код цвета').props.value).toBe('#FF1500');
  expect(view.getByLabelText('Акцент: тон').props.accessibilityValue.now).toBe(5);
});

test('на краю круга тон не уезжает за границу', async () => {
  const view = await render(<Harness initial="#FF0000" />);

  await act(async () => {
    fireEvent(view.getByLabelText('Акцент: тон'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
  });

  expect(view.getByLabelText('Акцент: тон').props.accessibilityValue.now).toBe(0);
  expect(view.getByLabelText('Код цвета').props.value).toBe('#FF0000');
});

test('оттенок не теряется, когда цвет уведён в чёрный', async () => {
  const view = await render(<Harness initial="#000000" />);

  // У чёрного нет тона: полоса стоит на нуле, но набранный цвет от неё не
  // зависит — она задаёт тон будущему цвету, а не переписывает нынешний.
  expect(view.getByLabelText('Акцент: тон').props.accessibilityValue.now).toBe(0);

  await act(async () => {
    fireEvent(view.getByLabelText('Акцент: тон'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
  });

  // Яркость нулевая — цвет остаётся чёрным, каким бы ни был тон.
  expect(view.getByLabelText('Код цвета').props.value).toBe('#000000');
});

test('квадрат оттенка не мешает озвучке: у него две величины сразу', async () => {
  const view = await render(<Harness />);

  // Он скрыт от скринридера намеренно — доступный путь к тому же цвету это
  // поле кода, а не попадание пальцем в точку.
  expect(view.queryByLabelText('Акцент: насыщенность')).toBeNull();
  expect(view.queryByLabelText('Акцент: яркость')).toBeNull();
  expect(view.getByLabelText('Код цвета')).toBeTruthy();
});
