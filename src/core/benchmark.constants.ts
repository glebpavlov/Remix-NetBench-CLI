import type { BenchmarkConfig } from './core.types';

/**
 * Default benchmark configuration (10 sequential requests, bounded retries).
 * Конфигурация замера по умолчанию (10 последовательных запросов, ограниченные повторы).
 */
export const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  iterations: 10,
  requestTimeoutMs: 30_000,
  max429Retries: 4,
  maxTransientRetries: 3,
  baseBackoffMs: 1_000,
  maxBackoffMs: 30_000,
  transientDelayMs: 600,
};

/**
 * Metric conversion constants based on decimal SI prefixes (10^3, 10^6, 10^9).
 * Константы пересчета метрик в десятичной системе СИ (10^3, 10^6, 10^9).
 */
export const METRICS_CONSTANTS = {
  /** Number of bits per byte / Количество бит в одном байте */
  BITS_PER_BYTE: 8,
  /** Milliseconds in one second / Миллисекунд в одной секунде */
  MS_PER_SECOND: 1_000,
  /** Decimal SI Kilobyte (10^3 bytes) / Десятичный килобайт (10^3 байт) */
  SI_KILO: 1_000,
  /** Decimal SI Megabyte / Megabit (10^6) / Десятичный мегабайт / мегабит (10^6) */
  SI_MEGA: 1_000_000,
  /** Decimal SI Gigabyte (10^9 bytes) / Десятичный гигабайт (10^9 байт) */
  SI_GIGA: 1_000_000_000,
} as const;
