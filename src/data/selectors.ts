import { useMemo } from 'react';
import { activeTrack, alarmTrack, useAppStore } from './store.ts';
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
): ScheduleContext | null {
  if (!track?.schedule) return null;
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
    schedule: track.schedule,
    shiftTypes: index,
    overrides: new Map(usable),
  };
}

/** Дорожка, на которую сейчас смотрит приложение. */
export function useActiveTrack(): ScheduleTrack | null {
  return useAppStore(activeTrack);
}

/** Контекст активной дорожки: то, по чему рисуется календарь и считается сводка. */
export function useScheduleContext(): ScheduleContext | null {
  const track = useActiveTrack();
  const shiftTypes = useAppStore((state) => state.shiftTypes);

  return useMemo(() => buildScheduleContext(track, shiftTypes), [track, shiftTypes]);
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

  return useMemo(() => {
    const named = tracks.length > 1;
    const result = new Map<string, AlarmTrackContext>();
    for (const track of tracks) {
      const context = buildScheduleContext(track, shiftTypes);
      if (context) result.set(track.id, { context, name: track.name, named });
    }
    return result;
  }, [tracks, shiftTypes]);
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

  return useMemo(() => {
    const contexts = new Map<string, ScheduleContext>();
    for (const track of tracks) {
      const context = buildScheduleContext(track, shiftTypes);
      if (context) contexts.set(track.id, context);
    }
    return contexts;
  }, [tracks, shiftTypes]);
}
