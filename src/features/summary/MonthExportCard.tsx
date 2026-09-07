import { useState } from 'react';
import * as Print from 'expo-print';
import type { ScheduleContext } from '@/domain/engine.ts';
import { formatMonthTitle } from '@/domain/format.ts';
import { buildMonthReportHtml } from '@/domain/monthReport.ts';
import type { Period } from '@/domain/payday.ts';
import type { MonthSummary } from '@/domain/summary.ts';
import { AppText, Button, Card } from '@/ui';
import { useTheme } from '@/theme';
import { shareExistingFile } from '@/features/backup/files.ts';

export interface MonthExportCardProps {
  period: Period;
  context: ScheduleContext;
  summary: MonthSummary;
  currency: string;
  trackName?: string;
}

/**
 * Месяц в PDF.
 *
 * Вторая по частоте просьба после будильника, и просят её ради конкретного
 * дела — сверить табель от работодателя. Поэтому доступны и прошедшие месяцы,
 * а в самом файле есть часы по дням и отклонение от графика: без них сверять
 * нечего.
 */
export function MonthExportCard({
  period,
  context,
  summary,
  currency,
  trackName,
}: MonthExportCardProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = formatMonthTitle(Number(period.slice(0, 4)), Number(period.slice(5, 7)));

  const share = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const html = buildMonthReportHtml({ period, context, summary, trackName, currency });
      const { uri } = await Print.printToFileAsync({ html });
      const sent = await shareExistingFile(uri, 'application/pdf');
      if (!sent) setError('На этом телефоне нечем поделиться файлом.');
    } catch {
      setError('Не получилось собрать файл. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Поделиться месяцем"
      help="PDF с сеткой месяца, часами по дням, отклонением от графика и суммами — тем, по чему сверяют табель. Прошлые месяцы тоже."
    >
      <Button
        title={busy ? 'Собираем…' : `Выгрузить ${title.toLowerCase()}`}
        variant="primary"
        disabled={busy}
        accessibilityHint="Соберёт PDF и откроет системное «Поделиться»"
        onPress={() => void share()}
      />
      {error ? (
        <AppText variant="body" color={theme.colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </Card>
  );
}
