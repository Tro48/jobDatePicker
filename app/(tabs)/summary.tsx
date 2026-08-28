import { Card, Placeholder, Screen } from '@/ui';

export default function SummaryScreen() {
  return (
    <Screen title="Сводка">
      <Card title="Часы и деньги за месяц">
        <Placeholder stage="Этап 3 плана работ">
          Часы, смены, разбивка по типам смен, внесённые выплаты и выведенная из них ставка за час.
        </Placeholder>
      </Card>
    </Screen>
  );
}
