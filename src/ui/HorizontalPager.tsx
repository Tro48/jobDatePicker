import { useCallback, useEffect, useRef } from 'react';
import { FlatList } from 'react-native';
import type { ListRenderItemInfo, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { ReactElement } from 'react';
import { useReduceMotion } from './useReduceMotion.ts';

export interface HorizontalPagerProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  index: number;
  onIndexChange: (index: number) => void;
  width: number;
  /** Фиксированная высота страницы. Без неё пейджер занимает всё доступное место. */
  height?: number;
  /**
   * Отрисовка страницы. Обязана быть стабильной между рендерами — иначе
   * пейджер перерисовывает все страницы разом, см. комментарий ниже.
   */
  renderPage: (item: T) => ReactElement;
}

/**
 * Горизонтальное листание страниц одинаковой ширины.
 *
 * Индексом владеет родитель: то же значение двигают и свайп, и стрелки в
 * шапке. Стрелки обязательны — свайп недоступен ни с клавиатуры, ни через
 * TalkBack, и подменять их жестом нельзя.
 *
 * Все колбэки, уходящие в FlatList, стабильны намеренно. Ячейку списка
 * VirtualizedList рисует через PureComponent, и `renderItem` — её проп: новая
 * функция на каждый рендер означает перерисовку всех страниц, которые сейчас
 * в памяти. На календаре это три месяца по сорок с лишним клеток, и платить
 * ими приходилось за каждое движение соседа по экрану — за листание месяца,
 * за смену графика, за любой тик состояния выше по дереву.
 */
export function HorizontalPager<T>({
  items,
  keyOf,
  index,
  onIndexChange,
  width,
  height,
  renderPage,
}: HorizontalPagerProps<T>) {
  const listRef = useRef<FlatList<T>>(null);
  const currentIndex = useRef(index);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (currentIndex.current === index) return;
    currentIndex.current = index;
    listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
  }, [index, reduceMotion]);

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next === currentIndex.current) return;
      currentIndex.current = next;
      onIndexChange(next);
    },
    [width, onIndexChange],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<T>) => renderPage(item),
    [renderPage],
  );

  // Без getItemLayout initialScrollIndex промахивается: FlatList не знает
  // ширину ещё не отрисованных страниц.
  const getItemLayout = useCallback(
    (_: ArrayLike<T> | null | undefined, itemIndex: number) => ({
      length: width,
      offset: width * itemIndex,
      index: itemIndex,
    }),
    [width],
  );

  const style = height === undefined ? { flex: 1, width } : { width, height };

  return (
    <FlatList
      ref={listRef}
      data={items}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={keyOf}
      initialScrollIndex={index}
      style={style}
      getItemLayout={getItemLayout}
      onMomentumScrollEnd={handleMomentumEnd}
      // Окно рендера узкое намеренно: страница тяжёлая, а держать в памяти
      // десятки месяцев незачем.
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      removeClippedSubviews
      renderItem={renderItem}
    />
  );
}
