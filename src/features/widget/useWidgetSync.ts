import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { todayIso } from '@/domain/date.ts';
import { buildWidgetSnapshot, sameWidgetSnapshot } from '@/domain/widget.ts';
import type { WidgetColorLookup, WidgetSnapshot } from '@/domain/widget.ts';
import { buildScheduleContext, useHolidayCalendar } from '@/data/selectors.ts';
import { alarmTrack, useAppStore } from '@/data/store.ts';
import { isWidgetModuleAvailable, writeWidgetSnapshot } from '@modules/shift-widget';
import { applyOverrides, darkPalette, fadedShiftPair, lightPalette } from '@/theme';
import type { Palette, ThemeColorOverrides } from '@/theme';

/**
 * Цвета смены для обеих тем сразу — вместе с приглушённой заливкой.
 *
 * Виджет получает готовые цвета, а не токены палитры: повторить палитру на
 * Kotlin значило бы разойтись с приложением на первой же правке цвета. По той
 * же причине здесь считается и приглушение отработанной смены — тем же
 * fadedShiftPair, что и в клетке календаря, — и по той же причине сюда
 * заведены цвета, заданные человеком: виджет и календарь на одном экране
 * обязаны показывать одну и ту же смену одинаково.
 */
function lookupFor(colors: ThemeColorOverrides): WidgetColorLookup {
  const light = applyOverrides(lightPalette, colors.light);
  const dark = applyOverrides(darkPalette, colors.dark);
  return (token) => ({ light: pairOf(light, token), dark: pairOf(dark, token) });
}

function pairOf(palette: Palette, token: string) {
  const pair = palette.shifts[token] ?? { surface: palette.surface, on: palette.text };
  return { ...pair, faded: fadedShiftPair(pair, palette.surface).surface };
}

/**
 * Держит снимок для виджета в согласии с графиком.
 *
 * Виджет рисуется процессом лаунчера, когда приложение выгружено из памяти:
 * пересчитать график в этот момент нечем, поэтому приложение выкладывает
 * посчитанный снимок заранее — при каждом изменении графика и правок и при
 * каждом возвращении в приложение.
 *
 * Возвращение важно отдельно от изменений: снимок покрывает три месяца, и
 * когда они кончаются, в самом графике при этом меняться может нечему.
 *
 * Дорожка берётся та же, по которой звонит будильник, — первая своя. Виджет,
 * следующий за открытой вкладкой, показывал бы чужой график ровно потому, что
 * человек однажды заглянул в календарь жены.
 */
export function useWidgetSync(): void {
  const track = useAppStore(alarmTrack);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const trackCount = useAppStore((state) => state.tracks.length);
  const appearance = useAppStore((state) => state.appearance);
  const themeColors = useAppStore((state) => state.themeColors);
  const holidays = useHolidayCalendar();

  const colorsOf = useMemo(() => lookupFor(themeColors), [themeColors]);

  // Метка возвращения в приложение: служит зависимостью пересборки, иначе
  // снимок, сделанный в январе, дожил бы в неизменном виде до апреля.
  const [foregroundAt, setForegroundAt] = useState(() => Date.now());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') setForegroundAt(Date.now());
    });
    return () => subscription.remove();
  }, []);

  // Последний выложенный снимок. Запись в SharedPreferences — это ещё и
  // перерисовка всех виджетов на экране, и делать её на каждое изменение суммы
  // выплаты незачем.
  const written = useRef<WidgetSnapshot | null>(null);

  useEffect(() => {
    if (!isWidgetModuleAvailable) return;

    // Снимок пишется всегда, даже когда виджета на экране ещё нет.
    // Иначе порядок действий человека ломает всё: виджет добавляют на главный
    // экран раньше, чем в следующий раз открывают приложение, и он встречает
    // хозяина надписью «открой приложение» сразу после добавления. Раскладка
    // трёх месяцев по дням — та же работа, что календарь делает на каждом
    // открытии, и экономить на ней незачем.
    const context = buildScheduleContext(track, shiftTypes, holidays);
    const snapshot = buildWidgetSnapshot(context, {
      today: todayIso(),
      // Имя работы подписывается, только когда работ несколько: у человека с
      // одной работой оно ничего не различает.
      trackName: trackCount > 1 ? (track?.name ?? '') : '',
      // Тема берётся из настроек приложения, а не из системы: виджет и
      // приложение на одном экране обязаны выглядеть одинаково.
      appearance,
      colorsOf,
    });

    if (written.current && sameWidgetSnapshot(written.current, snapshot)) return;
    written.current = snapshot;
    writeWidgetSnapshot(JSON.stringify(snapshot));
  }, [track, shiftTypes, trackCount, appearance, holidays, colorsOf, foregroundAt]);
}
