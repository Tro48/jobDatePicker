import { useRouter } from 'expo-router';
import { AppText, Button, Card } from '@/ui';
import { useAppStore } from '@/data/store.ts';
import { useAlarmSyncState } from './AlarmSyncProvider.tsx';

/**
 * Предупреждение о том, что будильник не зазвонит, — на главном экране.
 *
 * Разрешения отбираются молча: их сбрасывает оболочка при обновлении APK, их
 * снимает система у долго не открывавшегося приложения, их можно случайно
 * выключить самому. Узнать об этом на вкладке «Будильник» поздно: туда заходят,
 * когда будильник заводят, а не каждое утро. Поэтому предупреждение живёт там,
 * куда смотрят, — на календаре, а подробности и кнопки остаются на своём
 * экране, чтобы тексты не расходились.
 *
 * Экран блокировки сюда не попал намеренно: без него будильник всё-таки
 * зазвонит, только шторкой сверху, и поднимать из-за этого тревогу на главном
 * экране незачем.
 */
export function AlarmPermissionNotice() {
  const router = useRouter();
  const { permissions, available } = useAlarmSyncState();
  const hasEnabledAlarm = useAppStore((state) => state.alarms.some((alarm) => alarm.enabled));

  const broken = !permissions.exactAlarms || !permissions.notifications;
  if (!available || !hasEnabledAlarm || !broken) return null;

  return (
    <Card title="Будильник не зазвонит">
      <AppText variant="body">
        {!permissions.exactAlarms
          ? 'Android больше не даёт приложению ставить точные будильники — расписание не поставлено.'
          : 'Уведомления приложению запрещены, а звонок идёт через уведомление.'}
      </AppText>
      <AppText variant="body" tone="muted">
        Разрешения нередко слетают после обновления приложения. Верни их — расписание
        встанет само.
      </AppText>
      <Button
        title="Открыть будильник"
        variant="primary"
        accessibilityHint="Вкладка «Будильник», там кнопки выдачи разрешений"
        onPress={() => router.navigate('/alarm')}
      />
    </Card>
  );
}
