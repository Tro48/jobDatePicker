import { NativeModules } from 'react-native';
// Только типы и перечисления: в этом файле пакета нет ни одного вызова,
// который выполнился бы при импорте.
import { UpdateAvailability } from 'react-native-rustore-update/src/types.ts';
import type { AppUpdateInfo } from 'react-native-rustore-update/src/types.ts';
import { forStore } from './distribution.ts';

/**
 * Нативные модули берутся напрямую, минуя JS-обёртки пакетов, по двум
 * причинам. Пакеты ставятся из git, а собранный `lib/` появляется только при
 * публикации в npm — его там нет. И главное: обёртка обновления создаёт
 * `NativeEventEmitter` прямо при импорте, а он падает везде, где нативного
 * модуля нет, — в тестах, в отладке, в любой сборке без RuStore. Событий мы не
 * слушаем: сценарий «немедленное обновление» показывает свой экран сам.
 */
interface UpdateModule {
  init: () => void;
  getAppUpdateInfo: () => Promise<AppUpdateInfo>;
  immediate: () => Promise<number>;
}

interface ReviewModule {
  init: () => void;
  requestReviewFlow: () => Promise<boolean>;
  launchReviewFlow: () => Promise<boolean>;
}

const RustoreUpdate = NativeModules.RustoreUpdate as UpdateModule | undefined;
const RustoreReview = NativeModules.RustoreReview as ReviewModule | undefined;

/**
 * Обёртка над двумя SDK RuStore: обновление приложения и форма оценки.
 *
 * Оба живут за одной дверью, потому что условия у них одни и те же и обоим
 * нечего делать вне магазина: SDK работают, только если на телефоне стоит
 * RuStore, человек в нём авторизован, а само приложение установлено оттуда же.
 * В отладочной сборке и в APK с GitHub любой вызов вернёт отказ — и это
 * нормальный ответ, а не ошибка, которую надо показывать.
 *
 * Отсюда правило всего модуля: наружу уходит либо результат, либо `null`.
 * Ни одно исключение из нативной части не должно всплыть в интерфейс — падение
 * календаря из-за того, что не удалось спросить про обновление, несоразмерно
 * пользе от самого вопроса.
 */

/** Инициализация нужна обоим SDK и ровно один раз за запуск. */
let started = false;

function ready(): boolean {
  if (!forStore()) return false;
  if (started) return true;
  if (!RustoreUpdate || !RustoreReview) return false;

  try {
    RustoreUpdate.init();
    RustoreReview.init();
    started = true;
  } catch {
    // Второй попытки не делаем: она кончится тем же.
    started = false;
  }
  return started;
}

/** Что RuStore знает о новой версии. null — спросить не удалось или незачем. */
export async function checkUpdate(): Promise<AppUpdateInfo | null> {
  if (!ready()) return null;

  try {
    return (await RustoreUpdate?.getAppUpdateInfo()) ?? null;
  } catch {
    return null;
  }
}

/** Есть ли что ставить. Отдельная функция: сравнение с перечислением нужно и экрану, и хуку. */
export function hasUpdate(info: AppUpdateInfo | null): boolean {
  return info?.updateAvailability === UpdateAvailability.UPDATE_AVAILABLE;
}

/**
 * Обновление «немедленно»: RuStore показывает свой полноэкранный экран с
 * прогрессом и сам ставит APK.
 *
 * Из трёх сценариев SDK взят самый простой. Фоновая загрузка с отслеживанием
 * состояния требует собственного экрана прогресса и обработки полудюжины
 * состояний установки — ради приложения, которое обновляется раз в месяц, это
 * лишний код, который некому проверять.
 */
export async function runUpdate(): Promise<boolean> {
  if (!ready()) return false;

  try {
    await RustoreUpdate?.immediate();
    return true;
  } catch {
    return false;
  }
}

/**
 * Форма оценки внутри приложения.
 *
 * Показывается не всем и не всегда: RuStore сам решает, спрашивать ли этого
 * человека, и молча отказывает, если недавно уже спрашивал. Поэтому `false`
 * здесь — обычное дело, а не сбой, и говорить о нём человеку нечего.
 */
export async function askForReview(): Promise<boolean> {
  if (!ready()) return false;

  try {
    if (!(await RustoreReview?.requestReviewFlow())) return false;
    return Boolean(await RustoreReview?.launchReviewFlow());
  } catch {
    return false;
  }
}
