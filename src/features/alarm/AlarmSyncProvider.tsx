import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useAlarmSync } from './useAlarmSync.ts';
import type { AlarmSyncState } from './useAlarmSync.ts';

const AlarmSyncContext = createContext<AlarmSyncState | null>(null);

/**
 * Синхронизация будильников живёт в корне навигации, а не на своём экране.
 *
 * Иначе расписание переставлялось бы только после захода на вкладку
 * «Будильник»: вкладки монтируются лениво, и приложение, открытое ради
 * календаря, оставляло бы систему со вчерашним набором.
 */
export function AlarmSyncProvider({ children }: { children: ReactNode }) {
  const value = useAlarmSync();
  return <AlarmSyncContext.Provider value={value}>{children}</AlarmSyncContext.Provider>;
}

export function useAlarmSyncState(): AlarmSyncState {
  const value = useContext(AlarmSyncContext);
  if (!value) throw new ReferenceError('useAlarmSyncState вне AlarmSyncProvider');
  return value;
}
