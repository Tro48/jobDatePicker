import { useState } from 'react';
import { Alert } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Print from 'expo-print';
import { IconButton } from '@/ui';
import { useTheme } from '@/theme';
import { shareExistingFile } from '@/features/backup/files.ts';

export interface PdfExportButtonProps {
  /** Доступное имя кнопки: у значка нет текста, который мог бы его заменить. */
  label: string;
  /** Что откроется по нажатию — системный лист «Поделиться». */
  hint: string;
  /**
   * Отчёт строкой HTML. Функцией, а не готовой строкой: собирать документ до
   * нажатия незачем, а страница сводки живёт в памяти пейджера по три штуки.
   */
  buildHtml: () => string;
}

/**
 * Выгрузка отчёта в PDF — кнопкой-значком в заголовке карточки.
 *
 * Одна кнопка на месяц и на год: печать в обоих случаях идёт одинаково — HTML
 * отдаётся системному движку, готовый файл уходит в системный лист
 * «Поделиться», откуда его сохраняют или отправляют. Разница только в самом
 * отчёте, поэтому он и приходит функцией.
 *
 * Об осечке говорит системное окно, а не строка под кнопкой: кнопка стоит в
 * заголовке карточки, и места под текст рядом с ней нет, а окно ещё и
 * перехватывает фокус — сообщение не потеряется.
 */
export function PdfExportButton({ label, hint, buildHtml }: PdfExportButtonProps) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  const share = async (): Promise<void> => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildHtml() });
      const sent = await shareExistingFile(uri, 'application/pdf');
      if (!sent) {
        Alert.alert('Нечем поделиться', 'На этом телефоне нет приложения, которое примет файл.');
      }
    } catch {
      Alert.alert('Не получилось', 'Файл не собрался. Попробуй ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <IconButton
      // Лист с буквами PDF — из FontAwesome: в Ionicons, которыми нарисован
      // остальной интерфейс, значка PDF нет вовсе. Шрифт FontAwesome весит
      // 165 КБ против 1,3 МБ у MaterialCommunityIcons, где значок тоже есть.
      icon={<FontAwesome name="file-pdf-o" size={22} color={theme.colors.text} />}
      // Пока файл собирается, имя кнопки говорит об этом само: значок не
      // меняется, и по одному лишь выключенному виду понять причину нельзя.
      label={busy ? `${label}: собираем файл` : label}
      accessibilityHint={hint}
      disabled={busy}
      onPress={() => void share()}
    />
  );
}
