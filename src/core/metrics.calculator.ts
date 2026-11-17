import { METRICS_CONSTANTS } from './benchmark.constants';
import type { BenchmarkSummary, IterationMetric } from './core.types';

/**
 * Calculates download throughput in megabits per second (Mbps, decimal SI: 10^6 bits/s).
 * Вычисляет пропускную способность в мегабитах в секунду (Mbps, десятичная СИ: 10^6 бит/с).
 *
 * @param bytes - Number of transferred bytes / Количество переданных байт.
 * @param durationMs - Transfer duration in milliseconds / Длительность передачи в миллисекундах.
 * @returns Throughput in Mbps (`0` if inputs are non-positive) / Скорость в Mbps (`0`, если параметры `<= 0`).
 *
 * @example
 * calculateSpeedMbps(10_000_000, 1_000); // 80
 */
export function calculateSpeedMbps(bytes: number, durationMs: number): number {
  if (bytes <= 0 || durationMs <= 0) {
    return 0;
  }
  const seconds = durationMs / METRICS_CONSTANTS.MS_PER_SECOND;
  return (bytes * METRICS_CONSTANTS.BITS_PER_BYTE) / (seconds * METRICS_CONSTANTS.SI_MEGA);
}

/**
 * Calculates download throughput in megabytes per second (MB/s, decimal SI: 10^6 bytes/s).
 * Вычисляет скорость скачивания в мегабайтах в секунду (MB/s, десятичная СИ: 10^6 байт/с).
 *
 * @param bytes - Number of transferred bytes / Количество переданных байт.
 * @param durationMs - Transfer duration in milliseconds / Длительность передачи в миллисекундах.
 * @returns Throughput in MB/s (`0` if inputs are non-positive) / Скорость в MB/s (`0`, если параметры `<= 0`).
 *
 * @example
 * calculateSpeedMBps(10_000_000, 1_000); // 10
 */
export function calculateSpeedMBps(bytes: number, durationMs: number): number {
  if (bytes <= 0 || durationMs <= 0) {
    return 0;
  }
  const seconds = durationMs / METRICS_CONSTANTS.MS_PER_SECOND;
  return bytes / (seconds * METRICS_CONSTANTS.SI_MEGA);
}

/**
 * Builds an aggregated `BenchmarkSummary` from completed iteration metrics.
 * Формирует агрегированную итоговую сводку `BenchmarkSummary` по массиву завершенных итераций.
 *
 * @param targetUrl - Benchmarked target URL string / Строка целевого URL.
 * @param totalIterations - Total planned iterations / Запланированное количество итераций.
 * @param iterations - Completed iteration metric records / Метрики выполненных итераций.
 * @returns Aggregated `BenchmarkSummary` object / Агрегированный объект итоговой статистики.
 */
export function computeBenchmarkSummary(
  targetUrl: string,
  totalIterations: number,
  iterations: readonly IterationMetric[],
): BenchmarkSummary {
  const completedIterations = iterations.length;
  let totalBytes = 0;
  let totalDurationMs = 0;

  for (const item of iterations) {
    totalBytes += item.bytesDownloaded;
    totalDurationMs += item.durationMs;
  }

  const averageDurationMs = completedIterations > 0 ? totalDurationMs / completedIterations : 0;
  const averageSpeedMbps = calculateSpeedMbps(totalBytes, totalDurationMs);
  const averageSpeedMBps = calculateSpeedMBps(totalBytes, totalDurationMs);

  return {
    targetUrl,
    completedIterations,
    totalIterations,
    totalBytes,
    totalDurationMs,
    averageDurationMs,
    averageSpeedMbps,
    averageSpeedMBps,
    iterations,
  };
}

/**
 * Formats a byte count into human-readable decimal SI units (`B`, `KB`, `MB`, `GB`).
 * Форматирует количество байт в человекочитаемые десятичные единицы СИ (`B`, `KB`, `MB`, `GB`).
 *
 * @param bytes - Byte count to format / Количество байт.
 * @returns Formatted size string / Отформатированная строка объема данных.
 *
 * @example
 * formatBytes(10_000_000); // "10.00 MB"
 */
export function formatBytes(bytes: number): string {
  if (bytes < METRICS_CONSTANTS.SI_KILO) {
    return `${bytes} B`;
  }
  if (bytes < METRICS_CONSTANTS.SI_MEGA) {
    return `${(bytes / METRICS_CONSTANTS.SI_KILO).toFixed(2)} KB`;
  }
  if (bytes < METRICS_CONSTANTS.SI_GIGA) {
    return `${(bytes / METRICS_CONSTANTS.SI_MEGA).toFixed(2)} MB`;
  }
  return `${(bytes / METRICS_CONSTANTS.SI_GIGA).toFixed(2)} GB`;
}
