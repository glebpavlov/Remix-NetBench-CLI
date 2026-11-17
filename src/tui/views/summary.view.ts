import { METRICS_CONSTANTS } from '../../core/benchmark.constants';
import { formatBytes } from '../../core/metrics.calculator';
import type { BenchmarkSummary } from '../../core/core.types';
import type { ITranslator } from '../../i18n/i18n.types';
import { ANSI } from '../ansi.constants';
import { ScreenBuffer } from '../screen.buffer';
import { TUI_LAYOUT } from '../tui-layout.constants';
import type { SummaryViewState } from '../tui.types';
import {
  formatMetricRow,
  renderAppHeader,
  renderKeyValueRows,
  renderScreenFooter,
  type KeyValueRow,
} from './tui-view.helpers';

/**
 * Builds the virtual screen frame for the final benchmark report.
 * Dynamically aligns the value column using the widest localized label so long labels
 * (e.g. «Средняя пропускная способность:») are never truncated by the second column.
 *
 * Формирует виртуальный кадр итогового отчета замера.
 * Динамически выравнивает столбец значений по самой длинной подписи,
 * чтобы «Средняя пропускная способность:» никогда не обрезалась вторым столбцом.
 *
 * @param width - Terminal width in columns / Ширина терминала в столбцах.
 * @param height - Terminal height in rows / Высота терминала в строках.
 * @param state - Completed benchmark summary state / Итоговая сводка замера.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 * @returns Populated `ScreenBuffer` frame / Заполненный буфер экрана.
 */
export function buildSummaryFrame(
  width: number,
  height: number,
  state: SummaryViewState,
  i18n: ITranslator,
): ScreenBuffer {
  const buffer = new ScreenBuffer(width, height);
  renderAppHeader(buffer, i18n);

  buffer.drawText(
    TUI_LAYOUT.SUMMARY.TITLE_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('summary.title'), // «Итоги замера скорости»
    `${ANSI.BOLD}${ANSI.FG_BRIGHT_GREEN}`,
  );

  const summaryRows = buildSummaryMetricRows(state.summary, i18n);
  const afterMetricsRow = renderKeyValueRows(
    buffer,
    TUI_LAYOUT.SUMMARY.FIRST_METRIC_ROW,
    summaryRows,
    TUI_LAYOUT.SUMMARY.MIN_VALUE_COL,
  );

  const tableEndRow = renderSummaryIterationsTable(
    buffer,
    height,
    afterMetricsRow + TUI_LAYOUT.SUMMARY.TABLE_TOP_GAP,
    state.summary,
    i18n,
  );

  const footerRow = Math.max(tableEndRow + 1, height - TUI_LAYOUT.FOOTER.BOTTOM_OFFSET);
  if (footerRow < height) {
    renderScreenFooter(
      buffer,
      width,
      footerRow,
      i18n.t('summary.controlsHint'), // «Enter / b - в меню | r - повторить замер | q / Ctrl+C - выход»
    );
  }

  return buffer;
}

function buildSummaryMetricRows(
  summary: BenchmarkSummary,
  i18n: ITranslator,
): readonly KeyValueRow[] {
  const mbpsUnit = i18n.t('unit.mbps'); // «Mbps»
  const mbSecUnit = i18n.t('unit.mbPerSec'); // «MB/s»
  const msUnit = i18n.t('unit.ms'); // «мс»
  const secUnit = i18n.t('unit.sec'); // «с»

  return [
    {
      label: i18n.t('summary.targetLabel'), // «Целевой URL»
      value: summary.targetUrl,
      valueStyle: ANSI.FG_CYAN,
    },
    {
      label: i18n.t('summary.iterationsLabel'), // «Выполнено запросов»
      value: `${summary.completedIterations}/${summary.totalIterations}`,
    },
    {
      label: i18n.t('summary.totalDataLabel'), // «Общий объем данных»
      value: formatBytes(summary.totalBytes),
    },
    {
      label: i18n.t('summary.totalTimeLabel'), // «Общее время»
      value: `${(summary.totalDurationMs / METRICS_CONSTANTS.MS_PER_SECOND).toFixed(2)} ${secUnit}`,
    },
    {
      label: i18n.t('summary.avgTimeLabel'), // «Среднее время запроса»
      value: `${summary.averageDurationMs.toFixed(1)} ${msUnit}`,
    },
    {
      label: i18n.t('summary.avgSpeedLabel'), // «Средняя пропускная способность»
      value: `${summary.averageSpeedMbps.toFixed(2)} ${mbpsUnit} | ${summary.averageSpeedMBps.toFixed(2)} ${mbSecUnit}`,
      valueStyle: `${ANSI.BOLD}${ANSI.FG_BRIGHT_CYAN}`,
    },
  ];
}

function renderSummaryIterationsTable(
  buffer: ScreenBuffer,
  height: number,
  startRow: number,
  summary: BenchmarkSummary,
  i18n: ITranslator,
): number {
  let row = startRow;
  if (row >= height - TUI_LAYOUT.SUMMARY.TABLE_MIN_BOTTOM_MARGIN) {
    return row;
  }

  buffer.drawText(
    row,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('summary.tableHeader'), // «#    Объем         Время        Mbps        MB/s      Ретраи»
    ANSI.DIM,
  );
  row += 1;

  const msUnit = i18n.t('unit.ms'); // «мс»
  for (const metric of summary.iterations) {
    if (row >= height - TUI_LAYOUT.SUMMARY.TABLE_BOTTOM_RESERVED_ROWS) {
      break;
    }
    buffer.drawText(row, TUI_LAYOUT.PADDING_LEFT, formatMetricRow(metric, msUnit), ANSI.FG_WHITE);
    row += 1;
  }

  return row;
}
