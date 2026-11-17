import { describe, expect, it } from 'vitest';
import {
  calculateSpeedMBps,
  calculateSpeedMbps,
  computeBenchmarkSummary,
  formatBytes,
} from '../src/core/metrics.calculator';
import type { IterationMetric } from '../src/core/core.types';

describe('Metrics Calculator (Расчет метрик пропускной способности в СИ)', () => {
  it('calculates Mbps and MB/s accurately using decimal SI units (10^6) / точно вычисляет Mbps и MB/s в десятичной системе СИ', () => {
    // 10_000_000 bytes in 1_000 ms = 10 MB/s = 80 Mbps
    expect(calculateSpeedMbps(10_000_000, 1_000)).toBeCloseTo(80, 6);
    expect(calculateSpeedMBps(10_000_000, 1_000)).toBeCloseTo(10, 6);

    // 2_500_000 bytes in 500 ms = 5 MB/s = 40 Mbps
    expect(calculateSpeedMbps(2_500_000, 500)).toBeCloseTo(40, 6);
    expect(calculateSpeedMBps(2_500_000, 500)).toBeCloseTo(5, 6);
  });

  it('returns zero speed when bytes or duration are zero or negative / возвращает 0 при нулевых или отрицательных параметрах', () => {
    expect(calculateSpeedMbps(0, 1000)).toBe(0);
    expect(calculateSpeedMbps(1000, 0)).toBe(0);
    expect(calculateSpeedMBps(-100, 500)).toBe(0);
    expect(calculateSpeedMBps(500, -10)).toBe(0);
  });

  it('computes weighted BenchmarkSummary across 10 iterations / рассчитывает средневзвешенную сводку по 10 итерациям', () => {
    const iterations: IterationMetric[] = Array.from({ length: 10 }, (_, idx) => ({
      index: idx + 1,
      bytesDownloaded: 1_000_000,
      durationMs: idx % 2 === 0 ? 100 : 300,
      speedMbps: idx % 2 === 0 ? 80 : 26.6667,
      speedMBps: idx % 2 === 0 ? 10 : 3.3333,
      retriesCount: idx === 0 ? 1 : 0,
    }));

    const summary = computeBenchmarkSummary('https://example.com/1MB.bin', 10, iterations);

    expect(summary.completedIterations).toBe(10);
    expect(summary.totalIterations).toBe(10);
    expect(summary.totalBytes).toBe(10_000_000);
    expect(summary.totalDurationMs).toBe(2_000);
    expect(summary.averageDurationMs).toBe(200);
    expect(summary.averageSpeedMbps).toBeCloseTo(40, 5);
    expect(summary.averageSpeedMBps).toBeCloseTo(5, 5);
  });

  it('handles empty iteration list safely / безопасно обрабатывает пустой список итераций', () => {
    const summary = computeBenchmarkSummary('https://example.com', 10, []);

    expect(summary.completedIterations).toBe(0);
    expect(summary.totalBytes).toBe(0);
    expect(summary.averageDurationMs).toBe(0);
    expect(summary.averageSpeedMbps).toBe(0);
    expect(summary.averageSpeedMBps).toBe(0);
  });

  it('formats byte values across boundary thresholds into B, KB, MB, GB / форматирует граничные объемы данных в B, KB, MB, GB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1_000)).toBe('1.00 KB');
    expect(formatBytes(1_500)).toBe('1.50 KB');
    expect(formatBytes(1_000_000)).toBe('1.00 MB');
    expect(formatBytes(10_000_000)).toBe('10.00 MB');
    expect(formatBytes(1_000_000_000)).toBe('1.00 GB');
    expect(formatBytes(2_500_000_000)).toBe('2.50 GB');
  });
});
