import { Card, Placeholder, Screen } from '@/ui';
import { useScheduleContext } from '@/data/selectors.ts';

export default function CalendarScreen() {
  const context = useScheduleContext();

  return (
    <Screen title="Календарь">
      <Card title={context ? 'График выбран' : 'График не выбран'}>
        <Placeholder stage="Этап 2 плана работ">
          {context
            ? 'Здесь будет месячная сетка с буквами-маркерами смен и ручными правками.'
            : 'Сначала нужно выбрать график и дату первой смены в настройках.'}
        </Placeholder>
      </Card>
    </Screen>
  );
}
