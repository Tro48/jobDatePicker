import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { payloadFromFile } from '@/domain/share.ts';
import { parseBackup, serializeBackup, stateFromBackup } from '@/data/backup.ts';
import type { BackupSummary } from '@/data/backup.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button } from '@/ui';
import { useTheme } from '@/theme';
import { pickTextFile, saveTextFile, shareTextFile } from './files.ts';

/**
 * Копия, восстановление и приём чужого графика — в существующей карточке
 * «Данные».
 *
 * Одна кнопка «Загрузить из файла» на два разных файла: и на резервную копию,
 * и на присланный график. Человек не обязан помнить, что ему прислали, — это
 * видно по самому файлу.
 *
 * Замена данных необратима, поэтому подтверждение спрашивается системным
 * окном: оно перехватывает фокус, читается скринридером и закрывается кнопкой
 * «назад» — самодельная карточка ни одного из трёх свойств не даёт бесплатно.
 */
export function DataActions() {
  const theme = useTheme();
  const router = useRouter();
  const restoreState = useAppStore((state) => state.restoreState);
  /**
   * Строка под кнопками. Тон разведён с текстом: «копия сохранена» красным
   * читается как поломка, а цвет здесь и без того ничего не сообщает — смысл
   * несёт сама фраза.
   */
  const [status, setStatus] = useState<{ text: string; failed: boolean } | null>(null);
  const fail = (text: string): void => setStatus({ text, failed: true });
  const done = (text: string): void => setStatus({ text, failed: false });

  /** Имя файла копии одно на оба способа: по нему её потом и узнают в проводнике. */
  const backupFile = (): { name: string; text: string } => ({
    name: `smeny-kopiya-${new Date().toISOString().slice(0, 10)}.json`,
    text: serializeBackup(useAppStore.getState()),
  });

  /** Положить копию в папку на телефоне — то, чего ждут от слова «сохранить». */
  const save = async (): Promise<void> => {
    setStatus(null);
    const { name, text } = backupFile();

    let result;
    try {
      result = await saveTextFile(name, text, 'application/json');
    } catch {
      fail('Не получилось сохранить файл. Попробуй выбрать папку ещё раз.');
      return;
    }

    // Отмена — не ошибка: человек закрыл проводник, говорить ему нечего.
    if (result === 'canceled') return;
    if (result === 'unsupported') {
      fail('Этот телефон не даёт выбрать папку. Копию можно отправить кнопкой ниже.');
      return;
    }
    done(`Копия сохранена файлом ${name}.`);
  };

  /** Отправить копию сразу в мессенджер или на почту, минуя папку на телефоне. */
  const send = async (): Promise<void> => {
    setStatus(null);
    const { name, text } = backupFile();
    const sent = await shareTextFile(name, text, 'application/json');
    if (!sent) fail('На этом телефоне нечем поделиться файлом.');
  };

  const load = async (): Promise<void> => {
    setStatus(null);

    let picked;
    try {
      picked = await pickTextFile();
    } catch {
      fail('Не получилось открыть файл. Попробуй выбрать его ещё раз.');
      return;
    }
    if (!picked) return;

    // Сначала график: он встречается чаще, а копия узнаётся однозначно по
    // своей метке — перепутать их нельзя.
    const shared = payloadFromFile(picked.text);
    if (shared) {
      router.push({ pathname: '/track', params: { d: shared } });
      return;
    }

    const parsed = parseBackup(picked.text);
    if (!parsed.ok) {
      fail(parsed.error);
      return;
    }

    confirmRestore(parsed.summary, () => restoreState(stateFromBackup(parsed.backup)));
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Button
        title="Сохранить копию"
        accessibilityHint="Выбрать папку на телефоне и положить туда файл со всеми данными: графики, правки, выплаты и будильники"
        onPress={() => void save()}
      />
      <Button
        title="Отправить копию"
        accessibilityHint="Тот же файл, но сразу в мессенджер, на почту или в облако"
        onPress={() => void send()}
      />
      <Button
        title="Загрузить из файла"
        accessibilityHint="Резервная копия или график, присланный с другого телефона"
        onPress={() => void load()}
      />
      <Button
        title="Сканировать QR"
        accessibilityHint="Считать график с экрана другого телефона камерой"
        onPress={() => router.push('/settings/scan')}
      />

      {status ? (
        <AppText
          variant="body"
          color={status.failed ? theme.colors.danger : theme.colors.text}
          accessibilityLiveRegion="polite"
        >
          {status.text}
        </AppText>
      ) : null}
    </View>
  );
}

/** Что именно заменят — до того, как заменят. Отмена стоит первой. */
function confirmRestore(summary: BackupSummary, apply: () => void): void {
  const made = summary.createdAt ? formatStamp(summary.createdAt) : 'без даты';

  Alert.alert(
    'Заменить все данные?',
    [
      `Копия от ${made}.`,
      `Внутри: графиков ${summary.tracks}, смен ${summary.shiftTypes}, ручных правок ${summary.overrides}, заметок ${summary.notes}, выплат ${summary.payments}, будильников ${summary.alarms}.`,
      '',
      'Всё, что сейчас в приложении, будет удалено. Отменить это нельзя.',
    ].join('\n'),
    [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Заменить', style: 'destructive', onPress: apply },
    ],
  );
}

/** «14 марта 2026, 21:30» — из ISO, без Intl. */
function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const day = date.getDate();
  const month = MONTHS[date.getMonth()] ?? '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${date.getFullYear()}, ${hours}:${minutes}`;
}

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
