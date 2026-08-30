import { useMemo } from 'react';
import { useAppStore } from './store.ts';
import { indexShiftTypes } from '@/domain/shifts.ts';
import type { ScheduleContext } from '@/domain/engine.ts';

/**
 * Мост между хранилищем и доменом: собирает ScheduleContext, который принимают
 * чистые функции движка. Домен ничего не знает ни про zustand, ни про React.
 *
 * Возвращает null, пока график не выбран, — экраны показывают в этом случае
 * предложение выбрать график, а не пустой календарь.
 */
export function useScheduleContext(): ScheduleContext | null {
  const schedule = useAppStore((state) => state.schedule);
  const shiftTypes = useAppStore((state) => state.shiftTypes);
  const overrides = useAppStore((state) => state.overrides);

  return useMemo(() => {
    if (!schedule) return null;
    const index = indexShiftTypes(shiftTypes);

    // Правки на удалённый тип смены отбрасываются здесь, а не в домене.
    // resolveDay намеренно падает на неизвестном id, а календарь разворачивает
    // через него весь месяц — одна битая запись уронила бы экран целиком.
    // Правка без смены (заметка или часы) проходит всегда: смену для такого дня
    // даёт сам график.
    const usable = Object.entries(overrides).filter(
      ([, override]) => override.shiftTypeId === undefined || index.has(override.shiftTypeId),
    );

    return {
      schedule,
      shiftTypes: index,
      overrides: new Map(usable),
    };
  }, [schedule, shiftTypes, overrides]);
}
