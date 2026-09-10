import { buildSharedTrack, serializeTrackFile } from '@/domain/share.ts';
import type { SharedTrack } from '@/domain/share.ts';
import { applyShiftStarts } from '@/domain/shifts.ts';
import type { ScheduleTrack, ShiftType } from '@/domain/types.ts';
import { shareTextFile } from '@/features/backup/files.ts';

/**
 * Что и как отдаётся с дорожки — в одном месте на все входы.
 *
 * Отдают график из двух мест: значком «файлом» прямо в его карточке и экраном
 * с кодом. Сборка у них общая, иначе один вход рано или поздно начал бы
 * отдавать не то, что другой.
 */

/**
 * Уезжает график, по которому работают сейчас, а не вся история дорожки.
 * Принимающему нужен рабочий календарь, а не чужая трудовая книжка, и в код на
 * экране история просто не влезет.
 *
 * null — отдавать нечего: у дорожки нет ни одного периода.
 */
export function shareOfTrack(track: ScheduleTrack, shiftTypes: ShiftType[]): SharedTrack | null {
  const current = track.schedules.at(-1);
  if (!current) return null;

  return buildSharedTrack({
    name: track.name,
    // Смены уезжают с тем временем, которое человек видит у себя: своё начало
    // смен живёт в графике, а не в справочнике.
    shiftTypes: applyShiftStarts(shiftTypes, current.shiftStarts),
    pattern: current.pattern,
    anchorDate: current.anchorDate,
    overrides: Object.values(track.overrides),
  });
}

/** Имя файла: по нему график узнают в списке загрузок и в мессенджере. */
function fileNameOf(name: string): string {
  return `grafik-${name.trim().toLowerCase().replace(/\s+/g, '-')}.json`;
}

/**
 * Отдать график файлом через системный лист.
 *
 * false — делиться на этом телефоне нечем: экран скажет об этом словами вместо
 * тишины после нажатия.
 */
export async function sendTrackFile(share: SharedTrack): Promise<boolean> {
  return shareTextFile(fileNameOf(share.name), serializeTrackFile(share), 'application/json');
}

/** Одно на оба места: делиться нечем, и сказать об этом надо одинаково. */
export const SHARE_FAILED_TEXT = 'На этом телефоне нечем поделиться файлом.';
