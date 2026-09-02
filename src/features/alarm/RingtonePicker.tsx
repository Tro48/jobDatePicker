import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  isAlarmModuleAvailable,
  listRingtones,
  previewRingtone,
  stopRingtonePreview,
} from '@modules/shift-alarm';
import type { Ringtone } from '@modules/shift-alarm';
import { AppText, Button, ChoiceGroup } from '@/ui';
import { useTheme } from '@/theme';

/** Значение «системный сигнал»: у него нет URI, а ChoiceGroup работает со строками. */
const DEFAULT_VALUE = '__default__';
const DEFAULT_LABEL = 'Сигнал по умолчанию';

/**
 * Выбор мелодии из системного списка.
 *
 * Список раскрывается прямо на экране правки, а не отдельным маршрутом: так не
 * приходится тащить черновик будильника через навигацию, а выбранная мелодия
 * сразу проигрывается.
 */
export function RingtonePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (uri: string | null) => void;
}) {
  const theme = useTheme();
  const [ringtones, setRingtones] = useState<Ringtone[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || loaded) return;
    let cancelled = false;
    void listRingtones().then((items) => {
      if (cancelled) return;
      setRingtones(items);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [expanded, loaded]);

  // Уходя с экрана, глушим прослушивание: иначе мелодия играет поверх списка.
  useEffect(() => () => void stopRingtonePreview(), []);

  const current =
    value === null ? DEFAULT_LABEL : ringtones.find((item) => item.uri === value)?.title;

  const select = (next: string): void => {
    const uri = next === DEFAULT_VALUE ? null : next;
    onChange(uri);
    void previewRingtone(uri);
  };

  if (!isAlarmModuleAvailable) {
    return (
      <AppText variant="body" tone="muted">
        Список мелодий даёт нативный модуль — в этой сборке его нет.
      </AppText>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="body">Мелодия: {current ?? 'выбранная мелодия недоступна'}</AppText>
      <Button
        title={expanded ? 'Свернуть список' : 'Выбрать мелодию'}
        onPress={() => {
          if (expanded) void stopRingtonePreview();
          setExpanded(!expanded);
        }}
        accessibilityHint="Открывает список системных мелодий будильника"
      />
      {expanded ? (
        <ChoiceGroup
          label="Мелодия будильника"
          value={value ?? DEFAULT_VALUE}
          onChange={select}
          choices={[
            { value: DEFAULT_VALUE, label: DEFAULT_LABEL },
            ...ringtones.map((item) => ({ value: item.uri, label: item.title })),
          ]}
        />
      ) : null}
      {expanded && loaded && ringtones.length === 0 ? (
        <AppText variant="body" tone="muted">
          Система не отдала ни одной мелодии — останется сигнал по умолчанию.
        </AppText>
      ) : null}
    </View>
  );
}
