import { METRICS_CONSTANTS } from '../../core/benchmark.constants';
import { formatBytes } from '../../core/metrics.calculator';
import type { BenchmarkSummary } from '../../core/core.types';
import type { ITranslator } from '../../i18n/i18n.types';
import { formatMetricRow } from './tui-view.helpers';

/**
 * Formats a plain-text benchmark summary report for non-interactive CLI mode
 * or post-TTY stdout output after exiting the alternate screen buffer.
 *
 * Форматирует текстовый отчет замера для неинтерактивного CLI-режима
 * или вывода в stdout после завершения работы в альтернативном буфере TUI.
 *
 * @param summary - Completed benchmark summary / Итоговая сводка замера.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 * @returns Multi-line plain-text summary report / Многострочный текстовый отчет.
 */
export function formatPlainTextSummary(summary: BenchmarkSummary, i18n: ITranslator): string {
  const mbpsUnit = i18n.t('unit.mbps'); // «Mbps»
  const mbSecUnit = i18n.t('unit.mbPerSec'); // «MB/s»
  const msUnit = i18n.t('unit.ms'); // «мс»
  const secUnit = i18n.t('unit.sec'); // «с»

  const lines: string[] = [
    `=== ${i18n.t('summary.title')} ===`, // «Итоги замера скорости»
    `${i18n.t('summary.targetLabel')}: ${summary.targetUrl}`, // «Целевой URL»
    `${i18n.t('summary.iterationsLabel')}: ${summary.completedIterations}/${summary.totalIterations}`, // «Выполнено запросов»
    `${i18n.t('summary.totalDataLabel')}: ${formatBytes(summary.totalBytes)}`, // «Общий объем данных»
    `${i18n.t('summary.totalTimeLabel')}: ${(summary.totalDurationMs / METRICS_CONSTANTS.MS_PER_SECOND).toFixed(2)} ${secUnit}`, // «Общее время»
    `${i18n.t('summary.avgTimeLabel')}: ${summary.averageDurationMs.toFixed(1)} ${msUnit}`, // «Среднее время запроса»
    `${i18n.t('summary.avgSpeedLabel')}: ${summary.averageSpeedMbps.toFixed(2)} ${mbpsUnit} (${summary.averageSpeedMBps.toFixed(2)} ${mbSecUnit})`, // «Средняя пропускная способность»
    '',
    i18n.t('summary.tableHeader'), // «#    Объем         Время        Mbps        MB/s      Ретраи»
    ...summary.iterations.map((metric) => formatMetricRow(metric, msUnit)),
    '',
  ];

  return lines.join('\n');
}
