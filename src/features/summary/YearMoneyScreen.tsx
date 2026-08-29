import { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { todayIso } from '@/domain/date.ts';
import { YEAR_RANGE, buildYearWindow } from '@/domain/months.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, HorizontalPager, IconButton, Sheet } from '@/ui';
import { useTheme } from '@/theme';
import { YearMoneyPage } from './YearMoneyPage.tsx';

/**
 * Деньги по месяцам года.
 *
 * Годы листаются свайпом и стрелками — тем же пейджером, что месяцы в сводке
 * и календаре. Стрелки обязательны: свайп недоступен ни с клавиатуры, ни через
 * TalkBack.
 */
export function YearMoneyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ year?: string }>();

  const payments = useAppStore((state) => state.payments);
  const payroll = useAppStore((state) => state.payroll);

  const today = useMemo(() => todayIso(), []);
  // Окно строится один раз вокруг года, с которым экран открыли.
  const years = useMemo(
    () => buildYearWindow(Number(params.year) || Number(today.slice(0, 4))),
    [params.year, today],
  );
  const [index, setIndex] = useState(YEAR_RANGE);

  return (
    <Sheet title="Деньги по месяцам" onClose={() => router.back()}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
        }}
      >
        <IconButton
          name="chevron-back"
          label="Предыдущий год"
          disabled={index === 0}
          onPress={() => setIndex((value) => Math.max(0, value - 1))}
        />
        {/* Заголовок экрана — у шторки; здесь значение, а не второй заголовок. */}
        <AppText
          variant="title"
          accessibilityLiveRegion="polite"
          style={{ flex: 1, textAlign: 'center' }}
        >
          {years[index]}
        </AppText>
        <IconButton
          name="chevron-forward"
          label="Следующий год"
          disabled={index === years.length - 1}
          onPress={() => setIndex((value) => Math.min(years.length - 1, value + 1))}
        />
      </View>

      <HorizontalPager
        items={years}
        keyOf={(year) => String(year)}
        index={index}
        onIndexChange={setIndex}
        width={width}
        renderPage={(year) => (
          <YearMoneyPage
            year={year}
            payments={payments}
            currency={payroll.currency}
            today={today}
            width={width}
          />
        )}
      />
    </Sheet>
  );
}
