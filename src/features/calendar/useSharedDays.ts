import { useMemo } from 'react';
import { monthDays } from '@/domain/date.ts';
import type { IsoDate } from '@/domain/date.ts';
import { sharedDaysOff } from '@/domain/overlap.ts';
import type { ScheduleContext } from '@/domain/engine.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { useScheduleContexts } from '@/data/selectors.ts';
import { useAppStore } from '@/data/store.ts';
import type { SharedGroup } from '@/data/store.ts';

/**
 * Строка списка совпадений: один человек или группа.
 *
 * И то и другое считается одинаково — «свободны я и все они», — поэтому в
 * списке они стоят рядом и различаются только числом участников.
 */
export interface SharedRow {
  /** Ключ строки: id дорожки или id группы. */
  id: string;
  name: string;
  /** Сколько человек сравнивается. Больше одного — это группа. */
  people: number;
  dates: IsoDate[];
}

/**
 * Совпадающие выходные за месяц: по строке на каждого чужого и на каждую
 * группу.
 *
 * Люди считаются по отдельности: «свободны я и Аня» и «свободны я и Сергей» —
 * разные ответы, и складывать их в один список нельзя. Чтобы спросить «когда
 * свободны мы все», человека заводят в группу.
 */
export function useSharedRows(year: number, month: number): SharedRow[] {
  const tracks = useAppStore((state) => state.tracks);
  const groups = useAppStore((state) => state.sharedGroups);
  const contexts = useScheduleContexts();

  return useMemo(
    () => buildSharedRows(tracks, groups, contexts, year, month),
    [tracks, groups, contexts, year, month],
  );
}

function buildSharedRows(
  tracks: ScheduleTrack[],
  groups: SharedGroup[],
  contexts: Map<string, ScheduleContext>,
  year: number,
  month: number,
): SharedRow[] {
  const mine = tracks
    .filter((track) => track.own)
    .map((track) => contexts.get(track.id))
    .filter((context): context is ScheduleContext => Boolean(context));

  if (mine.length === 0) return [];

  const dates = monthDays(year, month);
  const others = tracks.filter((track) => !track.own && contexts.has(track.id));

  const people: SharedRow[] = others.map((track) => ({
    id: track.id,
    name: track.name,
    people: 1,
    dates: sharedDaysOff(mine, [contexts.get(track.id) as ScheduleContext], dates),
  }));

  const byGroup: SharedRow[] = groups.map((group) => {
    const members = group.trackIds
      .map((id) => contexts.get(id))
      .filter((context): context is ScheduleContext => Boolean(context));

    return {
      id: group.id,
      name: group.name,
      people: members.length,
      dates: sharedDaysOff(mine, members, dates),
    };
  });

  // Группы идут после людей: их меньше, и они сложнее — сначала простой ответ.
  return [...people, ...byGroup];
}
