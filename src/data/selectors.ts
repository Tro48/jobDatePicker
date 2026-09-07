import { useMemo } from 'react';
import { activeTrack, alarmTrack, summaryTrack, useAppStore } from './store.ts';
import { RU_HOLIDAYS } from '@/domain/holidays.ts';
import type { HolidayCalendar } from '@/domain/holidays.ts';
import { indexShiftTypes } from '@/domain/shifts.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import type { AlarmTrackContext } from '@/domain/alarm.ts';
import type { ScheduleTrack, ShiftType } from '@/domain/types.ts';

/**
 * Мост между хранилищем и доменом: собирает ScheduleContext, который принимают
 * чистые функции движка. Домен ничего не знает ни про zustand, ни про React.
 *
 * Возвращает null, пока график не выбран, — экраны показывают в этом случае
 * предложение выбрать график, а не пустой календарь.
 */
export function buildScheduleContext(
  track: ScheduleTrack | null,
  shiftTypes: ShiftType[],
  holidays: HolidayCalendar | null = null,
): ScheduleContext | null {
  if (!track || track.schedules.length === 0) return null;
  const index = indexShiftTypes(shiftTypes);

  // Правки на удалённый тип смены отбрасываются здесь, а не в домене.
  // resolveDay намеренно падает на неизвестном id, а календарь разворачивает
  // через него весь месяц — одна битая запись уронила бы экран целиком.
  // Правка без смены (заметка или часы) проходит всегда: смену для такого дня
  // даёт сам график.
  const usable = Object.entries(track.overrides).filter(
    ([, override]) => override.shiftTypeId === undefined || index.has(override.shiftTypeId),
  );

  return {
    schedules: track.schedules,
    shiftTypes: index,
    overrides: new Map(usable),
    holidays,
  };
}

/**
 * Производственный календарь или null, если человек его выключил.
 *
 * Хук, а не чтение настройки на месте: контекст графика собирают четыре разных
 * места, и забыть праздники в одном из них — значит получить календарь, где
 * 12 июня выходной, а в сводке за июнь его нет.
 */
export function useHolidayCalendar(): HolidayCalendar | null {
  const enabled = useAppStore((state) => state.holidays.enabled);
  return enabled ? RU_HOLIDAYS : null;
}

/** Дорожка, на которую сейчас смотрит приложение. */
export function useActiveTrack(): ScheduleTrack | null {
  return useAppStore(activeTrack);
}

/** Контекст активной дорожки: то, по чему рисуется календарь и считается сводка. */
export function useScheduleContext(): ScheduleContext | null {
  const track = useActiveTrack();
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const holidays = useHolidayCalendar();

  return useMemo(
    () => buildScheduleContext(track, shiftTypes, holidays),
    [track, shiftTypes, holidays],
  );
}

/**
 * Дорожка, по которой считается сводка: чужие графики в неё не попадают.
 * Подробности — у самого селектора.
 */
export function useSummaryTrack(): ScheduleTrack | null {
  return useAppStore(summaryTrack);
}

/** Дорожка, по которой звонит будильник, если он не выбрал графики сам. */
export function useAlarmTrack(): ScheduleTrack | null {
  return useAppStore(alarmTrack);
}

/**
 * Графики для планирования будильников: контекст плюс имя.
 *
 * Намеренно не зависит от активной вкладки: расписание не должно меняться от
 * того, чей календарь человек сейчас разглядывает. Имя нужно подписи на экране
 * звонка и показывается, только когда графиков больше одного.
 */
export function useAlarmTracks(): Map<string, AlarmTrackContext> {
  const tracks = useAppStore((state) => state.tracks);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const holidays = useHolidayCalendar();

  return useMemo(() => {
    const named = tracks.length > 1;
    const result = new Map<string, AlarmTrackContext>();
    for (const track of tracks) {
      const context = buildScheduleContext(track, shiftTypes, holidays);
      if (context) result.set(track.id, { context, name: track.name, named });
    }
    return result;
  }, [tracks, shiftTypes, holidays]);
}

/**
 * Контексты всех дорожек разом, ключ — id дорожки.
 *
 * Нужен там, где смотрят на несколько графиков сразу: карточка дня говорит,
 * что в этот день у остальных. Дорожки без графика пропускаются — разложить их
 * нечем.
 */
export function useScheduleContexts(): Map<string, ScheduleContext> {
  const tracks = useAppStore((state) => state.tracks);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const holidays = useHolidayCalendar();

  return useMemo(() => {
    const contexts = new Map<string, ScheduleContext>();
    for (const track of tracks) {
      const context = buildScheduleContext(track, shiftTypes, holidays);
      if (context) contexts.set(track.id, context);
    }
    return contexts;
  }, [tracks, shiftTypes, holidays]);
}
