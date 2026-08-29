import { useEffect, useRef } from 'react';
import { FlatList } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
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
  renderPage: (item: T) => ReactElement;
}

/**
 * Горизонтальное листание страниц одинаковой ширины.
 *
 * Индексом владеет родитель: то же значение двигают и свайп, и стрелки в
 * шапке. Стрелки обязательны — свайп недоступен ни с клавиатуры, ни через
 * TalkBack, и подменять их жестом нельзя.
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

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next === currentIndex.current) return;
    currentIndex.current = next;
    onIndexChange(next);
  };

  return (
    <FlatList
      ref={listRef}
      data={items}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      keyExtractor={keyOf}
      initialScrollIndex={index}
      style={height === undefined ? { flex: 1, width } : { width, height }}
      // Без getItemLayout initialScrollIndex промахивается: FlatList не знает
      // ширину ещё не отрисованных страниц.
      getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
      onMomentumScrollEnd={handleMomentumEnd}
      // Окно рендера узкое намеренно: страница тяжёлая, а держать в памяти
      // десятки месяцев незачем.
      windowSize={3}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      removeClippedSubviews
      renderItem={({ item }) => renderPage(item)}
    />
  );
}
