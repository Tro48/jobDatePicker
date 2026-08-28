import { useLocalSearchParams } from 'expo-router';
import { Card, Placeholder, Screen } from '@/ui';

export default function DayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();

  return (
    <Screen title="День" subtitle={date}>
      <Card title="Правка дня">
        <Placeholder stage="Этап 2 плана работ">
          Что по графику, что фактически, смена типа смены, часы, заметка и возврат к графику.
        </Placeholder>
      </Card>
    </Screen>
  );
}
