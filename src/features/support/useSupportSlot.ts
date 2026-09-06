import { useAppStore } from '@/data/store.ts';
import { adProvider } from './ads.ts';
import { entitlements } from './entitlements.ts';

/**
 * Что показывать в слоте поддержки.
 *
 * 'ads' — есть что показать, и реклама не отключена покупкой.
 * 'donation' — карточка «без рекламы и без подписки».
 * 'hidden' — слота нет вовсе.
 */
export type SupportMode = 'ads' | 'donation' | 'hidden';

/**
 * Единственное место, где решается судьба слота.
 *
 * Правило собрано в одну функцию намеренно: «показывать ли рекламу» зависит
 * сразу от покупки, от наличия объявления и от нажатого когда-то «не
 * показывать», и разложенное по экранам оно рано или поздно разойдётся —
 * реклама покажется тому, кто за её отключение заплатил.
 */
export function useSupportSlot(): SupportMode {
  const support = useAppStore((state) => state.support);

  // Покупка старше локального флага: её восстанавливают на новом телефоне, и
  // до восстановления флага в хранилище ещё нет.
  const paid = support.adsHidden || support.purchasedAt !== null || entitlements.adsRemoved();

  // Заплативший не видит в слоте ничего: он уже поддержал, и просить второй
  // раз — худшее, что можно сделать с человеком, который заплатил.
  if (paid) return 'hidden';

  if (adProvider.isAvailable()) return 'ads';
  return support.donationDismissed ? 'hidden' : 'donation';
}
