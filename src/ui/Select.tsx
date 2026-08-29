import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppText } from './AppText.tsx';
import { Button } from './Button.tsx';
import { useReduceMotion } from './useReduceMotion.ts';
import { useTheme } from '@/theme';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

/** Высота строки списка фиксирована: по ней считается прокрутка к выбранному. */
const ROW_HEIGHT = 48;

/**
 * Выпадающий список.
 *
 * Своё окно вместо нативного пикера: тот тянет отдельную нативную зависимость
 * и не подчиняется теме приложения. Список открывается системной модалкой,
 * поэтому кнопка «назад» его закрывает, а фокус скринридера не убегает на
 * экран под ним.
 */
export function Select({ label, value, options, onChange }: SelectProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const listRef = useRef<ScrollView>(null);

  const selectedIndex = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  const current = options[selectedIndex];

  return (
    <View style={{ flex: 1, gap: theme.spacing.xs }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? value}`}
        accessibilityHint="Открывает список"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
          minHeight: theme.minTouchTarget,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: focused ? theme.focusRingWidth : 1,
          borderColor: focused ? theme.colors.focus : theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
        }}
      >
        <AppText variant="title" importantForAccessibility="no">
          {current?.label ?? value}
        </AppText>
        <Ionicons
          name="chevron-down"
          size={20}
          color={theme.colors.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть список"
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: '#00000099',
          }}
        >
          {/* Нажатие внутри окна не должно его закрывать. */}
          <Pressable
            onPress={() => undefined}
            style={{
              maxHeight: '70%',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
            }}
          >
            <AppText variant="heading" accessibilityRole="header">
              {label}
            </AppText>

            <ScrollView
              ref={listRef}
              // Список открывается на выбранном значении, а не на первом:
              // иначе до 18 часов надо докручивать каждый раз.
              onLayout={() =>
                listRef.current?.scrollTo({ y: selectedIndex * ROW_HEIGHT, animated: false })
              }
            >
              <View accessibilityRole="radiogroup" accessibilityLabel={label}>
                {options.map((option) => {
                  const selected = option.value === value;

                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected }}
                      accessibilityLabel={option.label}
                      onPress={() => {
                        onChange(option.value);
                        setOpen(false);
                      }}
                      style={{
                        height: ROW_HEIGHT,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: theme.spacing.md,
                      }}
                    >
                      <AppText
                        variant="body"
                        importantForAccessibility="no"
                        style={{ fontWeight: selected ? '700' : '400' }}
                      >
                        {option.label}
                      </AppText>
                      {/* Галочка дублирует состояние, уже озвученное ролью. */}
                      {selected ? (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={theme.colors.accent}
                          accessibilityElementsHidden
                          importantForAccessibility="no"
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Button title="Закрыть" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
