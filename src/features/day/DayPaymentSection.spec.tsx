import { render, screen } from '@testing-library/react-native';
import { DayPaymentSection } from './DayPaymentSection.tsx';
import { INITIAL_STATE, useAppStore } from '@/data/store.ts';
import { SCHEDULE_PRESETS } from '@/domain/presets.ts';
import { DEFAULT_PAYMENT_RULES } from '@/domain/payday.ts';
import type { ScheduleTrack } from '@/domain/types.ts';
import { ThemeProvider } from '@/theme';

/**
 * Выплаты в карточке дня — только у своей работы.
 *
 * Зарплату близкого человека приложение не считает и в сводку не складывает:
 * внесённая здесь сумма никуда бы не попала.
 */

function trackOf(id: string, name: string, own: boolean): ScheduleTrack {
  return {
    id,
    name,
    own,
    schedules: [
      {
        presetId: '2-2-day',
        pattern: SCHEDULE_PRESETS[0].pattern,
        anchorDate: '2020-01-01',
        startsOn: '2020-01-01',
      },
    ],
    overrides: {},
    payrollRules: DEFAULT_PAYMENT_RULES,
  };
}

function renderSection() {
  return render(
    <ThemeProvider>
      <DayPaymentSection date="2026-09-10" />
    </ThemeProvider>,
  );
}

test('у своей работы выплату вносят в карточке дня', async () => {
  useAppStore.setState({
    ...INITIAL_STATE,
    tracks: [trackOf('a', 'Основная', true)],
    activeTrackId: 'a',
  });

  await renderSection();

  expect(screen.getByText('Выплата в этот день')).toBeTruthy();
});

test('у чужого графика выплат нет вовсе', async () => {
  useAppStore.setState({
    ...INITIAL_STATE,
    tracks: [trackOf('a', 'Основная', true), trackOf('b', 'Аня', false)],
    activeTrackId: 'b',
  });

  await renderSection();

  expect(screen.queryByText('Выплата в этот день')).toBeNull();
});
