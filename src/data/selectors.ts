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
    return {
      schedule,
      shiftTypes: indexShiftTypes(shiftTypes),
      overrides: new Map(Object.entries(overrides)),
    };
  }, [schedule, shiftTypes, overrides]);
}
