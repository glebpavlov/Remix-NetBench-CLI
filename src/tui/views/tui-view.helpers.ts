import { formatBytes } from '../../core/metrics.calculator';
import type { IterationMetric } from '../../core/core.types';
import type { ITranslator } from '../../i18n/i18n.types';
import { ANSI } from '../ansi.constants';
import type { ScreenBuffer } from '../screen.buffer';
import { TUI_LAYOUT } from '../tui-layout.constants';

/**
 * Single label-value row descriptor for aligned key-value sections.
 * Описание одной пары «подпись — значение» для выровненного табличного вывода в TUI.
 */
export interface KeyValueRow {
  /**
   * Localized label text (without trailing colon; colon is appended automatically).
   * Локализованный текст подписи (двоеточие добавляется автоматически).
   */
  readonly label: string;

  /**
   * Formatted value text rendered in the second column.
   * Отформатированное значение во втором столбце.
   */
  readonly value: string;

  /**
   * Optional ANSI style applied to the value column (defaults to `ANSI.FG_WHITE`).
   * Необязательный ANSI-стиль для значения (по умолчанию `ANSI.FG_WHITE`).
   */
  readonly valueStyle?: string;
}

/**
 * Renders the top application banner (name, subtitle, and horizontal divider) on rows 0..2.
 * Отрисовывает верхнюю шапку приложения (название, подзаголовок и разделитель) на строках 0..2.
 *
 * @param buffer - Target virtual screen buffer / Целевой буфер экрана.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 */
export function renderAppHeader(buffer: ScreenBuffer, i18n: ITranslator): void {
  const ruleWidth = Math.max(
    TUI_LAYOUT.MIN_RULE_WIDTH,
    buffer.width - TUI_LAYOUT.HORIZONTAL_MARGIN,
  );

  buffer.drawText(
    TUI_LAYOUT.HEADER.APP_NAME_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('app.name'), // «NetBench CLI»
    `${ANSI.BOLD}${ANSI.FG_BRIGHT_CYAN}`,
  );
  buffer.drawText(
    TUI_LAYOUT.HEADER.APP_SUBTITLE_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('app.subtitle'), // «Замер пропускной способности HTTP(S) (10 последовательных запросов)»
    ANSI.DIM,
  );
  buffer.drawHorizontalRule(
    TUI_LAYOUT.HEADER.DIVIDER_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    ruleWidth,
    ANSI.DIM,
  );
}

/**
 * Renders the bottom horizontal divider and keyboard controls hint at `footerRow`.
 * Отрисовывает нижний разделитель и строку подсказки управления в строке `footerRow`.
 *
 * @param buffer - Target virtual screen buffer / Целевой буфер экрана.
 * @param width - Terminal width in columns / Ширина терминала в столбцах.
 * @param footerRow - 0-based row index for the controls hint / Индекс строки для текста подсказки.
 * @param hintText - Localized controls hint text / Локализованный текст подсказки.
 */
export function renderScreenFooter(
  buffer: ScreenBuffer,
  width: number,
  footerRow: number,
  hintText: string,
): void {
  const ruleWidth = Math.max(TUI_LAYOUT.MIN_RULE_WIDTH, width - TUI_LAYOUT.HORIZONTAL_MARGIN);
  buffer.drawHorizontalRule(
    footerRow - TUI_LAYOUT.FOOTER.DIVIDER_OFFSET,
    TUI_LAYOUT.PADDING_LEFT,
    ruleWidth,
    ANSI.DIM,
  );
  buffer.drawText(footerRow, TUI_LAYOUT.PADDING_LEFT, hintText, ANSI.DIM);
}

/**
 * Dynamically computes the starting column for the value column so no localized label
 * ever collides with or gets truncated by the second column (fixes Russian label overlap).
 *
 * Динамически вычисляет начальный столбец для значений, чтобы ни одна локализованная подпись
 * (включая «Средняя пропускная способность:») не обрезалась вторым столбцом.
 *
 * @param rows - Key-value rows whose labels need to fit / Строки с подписями для расчета ширины.
 * @param minValueCol - Minimum column offset for visual alignment / Минимальный отступ столбца значений.
 * @returns 0-based column index where values should begin / 0-индексированный столбец для значений.
 */
export function computeLabelValueColumn(rows: readonly KeyValueRow[], minValueCol: number): number {
  let maxLabelLength = 0;
  for (const row of rows) {
    // +1 accounts for the trailing ':' character appended to every label.
    // +1 учитывает символ двоеточия ':', добавляемый после каждой подписи.
    const labelWithColonLength = row.label.length + 1;
    if (labelWithColonLength > maxLabelLength) {
      maxLabelLength = labelWithColonLength;
    }
  }

  return Math.max(
    minValueCol,
    TUI_LAYOUT.PADDING_LEFT + maxLabelLength + TUI_LAYOUT.LABEL_VALUE_GAP,
  );
}

/**
 * Renders an aligned list of `KeyValueRow` entries starting at `startRow`,
 * automatically avoiding label/value column collisions.
 *
 * Отрисовывает выровненный блок строк «подпись — значение» начиная со строки `startRow`,
 * автоматически предотвращая наложение подписей на второй столбец.
 *
 * @param buffer - Target virtual screen buffer / Целевой буфер экрана.
 * @param startRow - First 0-based row index / Начальная строка блока.
 * @param rows - Label-value rows to render / Список пар «подпись — значение».
 * @param minValueCol - Minimum value column offset / Минимальный столбец значений.
 * @returns Next available row index immediately after the block / Следующая свободная строка после блока.
 */
export function renderKeyValueRows(
  buffer: ScreenBuffer,
  startRow: number,
  rows: readonly KeyValueRow[],
  minValueCol: number,
): number {
  const valueCol = computeLabelValueColumn(rows, minValueCol);
  let currentRow = startRow;

  for (const item of rows) {
    buffer.drawText(currentRow, TUI_LAYOUT.PADDING_LEFT, `${item.label}:`, ANSI.DIM);
    buffer.drawText(currentRow, valueCol, item.value, item.valueStyle ?? ANSI.FG_WHITE);
    currentRow += 1;
  }

  return currentRow;
}

/**
 * Formats a single iteration metric row for both TUI tables and plain-text CLI output.
 * Форматирует одну строку таблицы результатов итерации для TUI и обычного CLI-вывода.
 *
 * @param metric - Completed iteration metrics / Метрики завершенной итерации.
 * @param msUnit - Localized millisecond unit suffix (defaults to `'ms'`) / Единица измерения времени (например, `'мс'` или `'ms'`).
 * @returns Fixed-width formatted table row string / Отформатированная строка таблицы с выравниванием колонок.
 */
export function formatMetricRow(metric: IterationMetric, msUnit = 'ms'): string {
  const idx = String(metric.index).padEnd(TUI_LAYOUT.TABLE_COLUMNS.INDEX_WIDTH, ' ');
  const bytes = formatBytes(metric.bytesDownloaded).padEnd(
    TUI_LAYOUT.TABLE_COLUMNS.BYTES_WIDTH,
    ' ',
  );
  const dur = `${metric.durationMs.toFixed(1)} ${msUnit}`.padEnd(
    TUI_LAYOUT.TABLE_COLUMNS.DURATION_WIDTH,
    ' ',
  );
  const mbps = metric.speedMbps.toFixed(2).padEnd(TUI_LAYOUT.TABLE_COLUMNS.MBPS_WIDTH, ' ');
  const mbSec = metric.speedMBps.toFixed(2).padEnd(TUI_LAYOUT.TABLE_COLUMNS.MB_SEC_WIDTH, ' ');
  const retries = String(metric.retriesCount);
  return `${idx} ${bytes} ${dur} ${mbps} ${mbSec} ${retries}`;
}

/**
 * Word-wraps a long message to fit within `maxWidth` columns without splitting words unnecessarily.
 * Переносит длинный текст по словам в пределах `maxWidth` столбцов.
 *
 * @param text - Source message text / Исходный текст сообщения.
 * @param maxWidth - Maximum characters per line / Максимальная ширина строки в символах.
 * @returns Array of wrapped lines / Массив перенесенных строк.
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}
