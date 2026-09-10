import { useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { parseBackup, serializeBackup, stateFromBackup } from '@/data/backup.ts';
import type { BackupSummary } from '@/data/backup.ts';
import { useAppStore } from '@/data/store.ts';
import { AppText, Button, Card, IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { pickShareFile } from '@/features/share/pickShareFile.ts';
import { saveTextFile, shareTextFile } from './files.ts';

export interface DataCardProps {
  /** Что стоит в карточке под кнопкой: сейчас — сведения о хранилище. */
  children?: ReactNode;
}

/**
 * Карточка «Данные»: копия, обмен и восстановление.
 *
 * Карточку рисует сам компонент, а не экран настроек: её действия разъехались
 * по двум местам — значки в шапке, кнопка в теле, — и держать их логику и
 * состояние в одном файле дешевле, чем поднимать наверх ради разметки.
 *
 * Загрузка стоит полосой во всю ширину: это единственное здесь необратимое
 * действие и то, ради чего сюда заходят. Сохранить и отправить обратимы, живут
 * значками напротив заголовка — тот же приём, что у проверки обновлений, — и
 * не занимают экранную строку.
 *
 * Подпись осталась только у загрузки: она забирает данные из файла и заменяет
 * ими всё, что есть, — значок без слов о таком предупредить не может. У значков
 * доступное имя есть у каждого, зона нажатия полная.
 *
 * Одна кнопка загрузки на два разных файла: и на резервную копию, и на
 * присланный график. Человек не обязан помнить, что ему прислали, — это видно
 * по самому файлу.
 *
 * Замена данных необратима, поэтому подтверждение спрашивается системным
 * окном: оно перехватывает фокус, читается скринридером и закрывается кнопкой
 * «назад» — самодельная карточка ни одного из трёх свойств не даёт бесплатно.
 */
export function DataCard({ children }: DataCardProps) {
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
      fail('Этот телефон не даёт выбрать папку. Копию можно отправить значком рядом.');
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

    // Сначала график: он встречается чаще, а копия узнаётся однозначно по
    // своей метке — перепутать их нельзя.
    const picked = await pickShareFile();
    if (picked.kind === 'canceled') return;
    if (picked.kind === 'error') {
      fail(picked.message);
      return;
    }
    if (picked.kind === 'track') {
      router.push({ pathname: '/track', params: { d: picked.payload } });
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
    <Card
      title="Данные"
      action={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <IconButton
            name="share-social-outline"
            label="Отправить копию"
            accessibilityHint="Файл со всеми данными сразу в мессенджер, на почту или в облако"
            onPress={() => void send()}
          />
          <IconButton
            name="save-outline"
            label="Сохранить копию"
            accessibilityHint="Выбрать папку на телефоне и положить туда файл со всеми данными: графики, правки, выплаты и будильники"
            onPress={() => void save()}
          />
        </View>
      }
    >
      <View style={{ gap: theme.spacing.sm }}>
        <Button
          title="Загрузить настройки"
          icon="download-outline"
          accessibilityHint="Резервная копия или график, присланный с другого телефона. Копия заменит всё, что сейчас в приложении"
          onPress={() => void load()}
        />

        {/* Результат сохранения и разбора файла: проводник и системный лист
            закрываются молча, сказать о том, что вышло, больше некому. Живая
            область — потому что фокус в этот момент стоит на кнопке в шапке. */}
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

      {children}
    </Card>
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
