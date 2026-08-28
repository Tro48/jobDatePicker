import { Card, Placeholder, Screen } from '@/ui';

export default function AlarmScreen() {
  return (
    <Screen title="Будильник">
      <Card title="Будильники по типам смен">
        <Placeholder stage="Этап 4 плана работ">
          Отступ до начала смены для каждого типа смены. Требует нативного модуля на AlarmManager.
        </Placeholder>
      </Card>
    </Screen>
  );
}
