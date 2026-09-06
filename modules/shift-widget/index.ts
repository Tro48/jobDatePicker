import { requireOptionalNativeModule } from 'expo';

interface ShiftWidgetNativeModule {
  /** Кладёт снимок в SharedPreferences и просит систему перерисовать виджеты. */
  write(snapshot: string): void;
}

/**
 * Мост к виджету на главном экране.
 *
 * Через requireOptional, а не requireNativeModule: в сборке без нативной части
 * приложение обязано работать и просто не иметь виджета, а не падать на
 * старте.
 */
const native = requireOptionalNativeModule<ShiftWidgetNativeModule>('ShiftWidget');

/** Есть ли нативная часть виджета в этой сборке. */
export const isWidgetModuleAvailable = native !== null;

/**
 * Выложить снимок наружу. Строка, а не объект: снимок уезжает в
 * SharedPreferences как есть, и разбирать его будет Kotlin.
 */
export function writeWidgetSnapshot(snapshot: string): void {
  native?.write(snapshot);
}
