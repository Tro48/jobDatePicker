/**
 * Заголовок последней записи «что нового» — для списка выпусков. Запуск:
 *   node --experimental-strip-types scripts/release-notes.ts
 *
 * Нужен сборке APK: телефон со старым JS не знает, что изменилось в новой
 * нативной сборке, — списка изменений у него ещё нет. Источник тот же, что и у
 * шторки в приложении, чтобы тексты не разошлись.
 */
import { RELEASE_NOTES } from '../src/domain/releaseNotes.ts';

process.stdout.write(RELEASE_NOTES[0]?.title ?? '');
