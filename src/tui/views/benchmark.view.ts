import { METRICS_CONSTANTS } from '../../core/benchmark.constants';
import { formatBytes } from '../../core/metrics.calculator';
import type { ITranslator } from '../../i18n/i18n.types';
import { ANSI, TUI_GLYPHS } from '../ansi.constants';
import { ScreenBuffer } from '../screen.buffer';
import { TUI_LAYOUT } from '../tui-layout.constants';
import type { BenchmarkViewState } from '../tui.types';
import {
  formatMetricRow,
  renderAppHeader,
  renderKeyValueRows,
  renderScreenFooter,
  type KeyValueRow,
} from './tui-view.helpers';

/**
 * Builds the virtual screen frame for live benchmark progress.
 * Формирует виртуальный кадр экрана живого прогресса замера скорости.
 *
 * @param width - Terminal width in columns / Ширина терминала в столбцах.
 * @param height - Terminal height in rows / Высота терминала в строках.
 * @param state - Live telemetry snapshot / Снимок текущих метрик замера.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 * @returns Populated `ScreenBuffer` frame / Заполненный буфер экрана.
 */
export function buildBenchmarkFrame(
  width: number,
  height: number,
  state: BenchmarkViewState,
  i18n: ITranslator,
): ScreenBuffer {
  const buffer = new ScreenBuffer(width, height);
  renderAppHeader(buffer, i18n);

  buffer.drawText(
    TUI_LAYOUT.BENCHMARK.TARGET_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('benchmark.header', { url: state.targetUrl }), // «Цель: {{url}}»
    ANSI.FG_CYAN,
  );

  renderStatusAndProgress(buffer, width, state, i18n);
  let nextRow = renderLiveMetrics(buffer, state, i18n);

  if (state.retryBanner !== undefined) {
    buffer.drawText(
      nextRow,
      TUI_LAYOUT.PADDING_LEFT,
      state.retryBanner,
      `${ANSI.BOLD}${ANSI.FG_YELLOW}`,
    );
    nextRow += TUI_LAYOUT.BENCHMARK.POST_METRICS_GAP;
  }

  nextRow = renderCompletedIterationsTable(buffer, height, nextRow, state, i18n);

  const footerRow = Math.max(nextRow + 1, height - TUI_LAYOUT.FOOTER.BOTTOM_OFFSET);
  if (footerRow < height) {
    renderScreenFooter(
      buffer,
      width,
      footerRow,
      i18n.t('benchmark.controlsHint'), // «Esc / q - прервать замер и вернуться | Ctrl+C - выход»
    );
  }

  return buffer;
}

function renderStatusAndProgress(
  buffer: ScreenBuffer,
  width: number,
  state: BenchmarkViewState,
  i18n: ITranslator,
): void {
  const spinner =
    TUI_GLYPHS.SPINNER_FRAMES[state.spinnerFrameIndex % TUI_GLYPHS.SPINNER_FRAMES.length] ??
    TUI_GLYPHS.SPINNER_FRAMES[0];

  const statusText = state.aborting
    ? i18n.t('benchmark.cancelling') // «Остановка активного потока...»
    : i18n.t('benchmark.iterationStatus', {
        current: Math.max(1, state.currentIteration),
        total: state.totalIterations,
      }); // «Запрос {{current}} из {{total}}»

  buffer.drawText(
    TUI_LAYOUT.BENCHMARK.STATUS_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    `${spinner} ${statusText}`,
    `${ANSI.BOLD}${ANSI.FG_BRIGHT_GREEN}`,
  );

  const progressLabel = `${i18n.t('benchmark.progressLabel')}:`; // «Общий прогресс»
  const completedCount = state.completedMetrics.length;
  const ratio = state.totalIterations > 0 ? completedCount / state.totalIterations : 0;

  // Position the progress bar right after the progress label + gap so long locale labels never overlap.
  // Размещаем прогресс-бар сразу после подписи + отступа, чтобы избежать наложения в любой локали.
  const barCol = TUI_LAYOUT.PADDING_LEFT + progressLabel.length + TUI_LAYOUT.LABEL_VALUE_GAP;
  const barWidth = Math.max(
    TUI_LAYOUT.BENCHMARK.PROGRESS_BAR_MIN_WIDTH,
    Math.min(
      TUI_LAYOUT.BENCHMARK.PROGRESS_BAR_MAX_WIDTH,
      width - TUI_LAYOUT.BENCHMARK.PROGRESS_BAR_RESERVED_COLS,
    ),
  );

  buffer.drawText(
    TUI_LAYOUT.BENCHMARK.PROGRESS_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    progressLabel,
    ANSI.DIM,
  );
  buffer.drawProgressBar(TUI_LAYOUT.BENCHMARK.PROGRESS_ROW, barCol, barWidth, ratio);
  buffer.drawText(
    TUI_LAYOUT.BENCHMARK.PROGRESS_ROW,
    barCol + barWidth + TUI_LAYOUT.BENCHMARK.PROGRESS_PERCENT_OFFSET,
    `${Math.round(ratio * 100)}%`,
    ANSI.BOLD,
  );
}

function renderLiveMetrics(
  buffer: ScreenBuffer,
  state: BenchmarkViewState,
  i18n: ITranslator,
): number {
  const mbpsUnit = i18n.t('unit.mbps'); // «Mbps»
  const mbSecUnit = i18n.t('unit.mbPerSec'); // «MB/s»
  const secUnit = i18n.t('unit.sec'); // «с»

  const metricRows: readonly KeyValueRow[] = [
    {
      label: i18n.t('benchmark.currentSpeedLabel'), // «Текущая скорость»
      value: `${state.instantSpeedMbps.toFixed(2)} ${mbpsUnit} (${state.instantSpeedMBps.toFixed(2)} ${mbSecUnit})`,
      valueStyle: `${ANSI.BOLD}${ANSI.FG_BRIGHT_CYAN}`,
    },
    {
      label: i18n.t('benchmark.avgSpeedLabel'), // «Средняя скорость»
      value: `${state.runningAvgMbps.toFixed(2)} ${mbpsUnit} (${state.runningAvgMBps.toFixed(2)} ${mbSecUnit})`,
    },
    {
      label: i18n.t('benchmark.downloadedLabel'), // «Скачано всего»
      value: formatBytes(state.totalDownloadedBytes + state.currentIterationBytes),
    },
    {
      label: i18n.t('benchmark.elapsedLabel'), // «Прошло времени»
      value: `${(state.elapsedMs / METRICS_CONSTANTS.MS_PER_SECOND).toFixed(1)} ${secUnit}`,
    },
  ];

  const afterMetricsRow = renderKeyValueRows(
    buffer,
    TUI_LAYOUT.BENCHMARK.FIRST_METRIC_ROW,
    metricRows,
    TUI_LAYOUT.BENCHMARK.MIN_VALUE_COL,
  );

  return afterMetricsRow + 1;
}

function renderCompletedIterationsTable(
  buffer: ScreenBuffer,
  height: number,
  startRow: number,
  state: BenchmarkViewState,
  i18n: ITranslator,
): number {
  if (
    state.completedMetrics.length === 0 ||
    startRow >= height - TUI_LAYOUT.BENCHMARK.TABLE_MIN_BOTTOM_MARGIN
  ) {
    return startRow;
  }

  let row = startRow;
  buffer.drawText(
    row,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('benchmark.completedIterationsLabel'), // «Завершенные запросы»
    ANSI.BOLD,
  );
  row += 1;

  buffer.drawText(
    row,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('summary.tableHeader'), // «#    Объем         Время        Mbps        MB/s      Ретраи»
    ANSI.DIM,
  );
  row += 1;

  const msUnit = i18n.t('unit.ms'); // «мс»
  const availableRows = Math.max(0, height - TUI_LAYOUT.BENCHMARK.TABLE_BOTTOM_RESERVED_ROWS - row);
  const recent = state.completedMetrics.slice(-availableRows);

  for (const metric of recent) {
    buffer.drawText(row, TUI_LAYOUT.PADDING_LEFT, formatMetricRow(metric, msUnit), ANSI.FG_WHITE);
    row += 1;
  }

  return row;
}
