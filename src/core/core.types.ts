import type { DomainError } from '../app/app.errors';
import type { RetryDecision } from '../network/network.types';

/**
 * Runtime parameters governing benchmark execution and resilience policies.
 * Параметры выполнения замера пропускной способности и политик отказоустойчивости.
 */
export interface BenchmarkConfig {
  /**
   * Number of sequential HTTP(S) GET requests to run in one benchmark session.
   * Количество последовательных HTTP(S) GET-запросов за одну сессию замера.
   */
  readonly iterations: number;

  /**
   * Inactivity/socket timeout per HTTP request in milliseconds.
   * Таймаут ожидания данных на один HTTP-запрос в миллисекундах.
   */
  readonly requestTimeoutMs: number;

  /**
   * Maximum number of retries per iteration upon receiving HTTP 429.
   * Максимальное количество повторов на одну итерацию при HTTP 429.
   */
  readonly max429Retries: number;

  /**
   * Maximum number of retries per iteration upon transient HTTP or network errors.
   * Максимальное количество повторов на одну итерацию при транзиентных HTTP/сетевых ошибках.
   */
  readonly maxTransientRetries: number;

  /**
   * Base backoff delay in milliseconds for HTTP 429 exponential backoff.
   * Базовая задержка в миллисекундах для экспоненциального отката при HTTP 429.
   */
  readonly baseBackoffMs: number;

  /**
   * Maximum upper bound for any HTTP 429 backoff or `Retry-After` delay in milliseconds.
   * Максимальный верхний порог задержки при HTTP 429 (включая `Retry-After`) в мс.
   */
  readonly maxBackoffMs: number;

  /**
   * Fixed pause duration in milliseconds before retrying transient errors.
   * Фиксированная пауза в миллисекундах перед повтором при транзиентных сбоях.
   */
  readonly transientDelayMs: number;
}

/**
 * Collected throughput and latency metrics for a single completed iteration.
 * Собранные показатели пропускной способности и длительности для одной завершенной итерации.
 */
export interface IterationMetric {
  /**
   * 1-based iteration sequence number.
   * Порядковый номер итерации (начиная с 1).
   */
  readonly index: number;

  /**
   * Total payload bytes downloaded during the successful attempt.
   * Количество скачанных байт тела ответа за успешную попытку.
   */
  readonly bytesDownloaded: number;

  /**
   * Request duration in milliseconds measured via `perf_hooks`.
   * Длительность выполнения запроса в миллисекундах (по `perf_hooks`).
   */
  readonly durationMs: number;

  /**
   * Download throughput in decimal Megabits per second (Mbps).
   * Скорость скачивания в десятичных мегабитах в секунду (Mbps).
   */
  readonly speedMbps: number;

  /**
   * Download throughput in decimal Megabytes per second (MB/s).
   * Скорость скачивания в десятичных мегабайтах в секунду (MB/s).
   */
  readonly speedMBps: number;

  /**
   * Number of retry attempts executed before this iteration succeeded.
   * Количество повторных попыток, выполненных до успешного завершения итерации.
   */
  readonly retriesCount: number;
}

/**
 * Aggregated statistical summary across all completed benchmark iterations.
 * Агрегированная итоговая статистика по всем завершенным итерациям замера.
 */
export interface BenchmarkSummary {
  /**
   * Target HTTP(S) URL string that was benchmarked.
   * Строка целевого HTTP(S) URL, для которого выполнялся замер.
   */
  readonly targetUrl: string;

  /**
   * Actual number of completed iterations.
   * Фактическое число успешно завершенных итераций.
   */
  readonly completedIterations: number;

  /**
   * Planned total number of iterations configured for the run.
   * Запланированное общее количество итераций.
   */
  readonly totalIterations: number;

  /**
   * Sum of bytes downloaded across all completed iterations.
   * Суммарный объем скачанных данных по всем итерациям в байтах.
   */
  readonly totalBytes: number;

  /**
   * Sum of request durations across all completed iterations in milliseconds.
   * Суммарная длительность всех завершенных запросов в миллисекундах.
   */
  readonly totalDurationMs: number;

  /**
   * Mean duration per iteration in milliseconds.
   * Средняя длительность одного запроса в миллисекундах.
   */
  readonly averageDurationMs: number;

  /**
   * Overall weighted average throughput in Mbps (`totalBytes * 8 / totalSeconds / 1e6`).
   * Итоговая средневзвешенная скорость в Mbps (`totalBytes * 8 / totalSeconds / 1e6`).
   */
  readonly averageSpeedMbps: number;

  /**
   * Overall weighted average throughput in MB/s (`totalBytes / totalSeconds / 1e6`).
   * Итоговая средневзвешенная скорость в MB/s (`totalBytes / totalSeconds / 1e6`).
   */
  readonly averageSpeedMBps: number;

  /**
   * Per-iteration metric records in execution order.
   * Массив метрик по каждой итерации в порядке выполнения.
   */
  readonly iterations: readonly IterationMetric[];
}

/**
 * Discriminated union of progress events emitted by the benchmark engine (Observer pattern).
 * Размеченное объединение событий прогресса, публикуемых движком замера (паттерн «Наблюдатель»).
 */
export type BenchmarkEvent =
  | {
      /** Benchmark session started / Сессия замера запущена */
      readonly type: 'started';
      /** Target URL string / Целевой URL */
      readonly targetUrl: string;
      /** Total planned iterations / Плановое количество итераций */
      readonly totalIterations: number;
    }
  | {
      /** Single iteration started / Начата очередная итерация */
      readonly type: 'iteration-started';
      /** 1-based iteration index / Номер текущей итерации */
      readonly iteration: number;
      /** Total planned iterations / Общее количество итераций */
      readonly totalIterations: number;
    }
  | {
      /** Stream chunk received / Получен чанк данных из потока */
      readonly type: 'chunk-received';
      /** 1-based iteration index / Номер текущей итерации */
      readonly iteration: number;
      /** Cumulative bytes received in this iteration / Скачано байт в текущей итерации */
      readonly bytesInIteration: number;
      /** Elapsed milliseconds in this iteration / Прошедшее время итерации в мс */
      readonly elapsedMs: number;
      /** Instantaneous throughput in Mbps / Мгновенная скорость в Mbps */
      readonly instantSpeedMbps: number;
      /** Instantaneous throughput in MB/s / Мгновенная скорость в MB/s */
      readonly instantSpeedMBps: number;
    }
  | {
      /** Retry scheduled after failure / Запланирован повтор после сбоя */
      readonly type: 'retry-scheduled';
      /** 1-based iteration index / Номер текущей итерации */
      readonly iteration: number;
      /** Current retry attempt number / Номер попытки повтора */
      readonly attempt: number;
      /** Maximum retry budget for this category / Максимум попыток для этой категории */
      readonly maxAttempts: number;
      /** Strategy decision with delay and reason / Решение стратегии с задержкой и причиной */
      readonly decision: RetryDecision;
    }
  | {
      /** Single iteration completed / Итерация успешно завершена */
      readonly type: 'iteration-completed';
      /** Finalized iteration telemetry / Итоговые метрики итерации */
      readonly metric: IterationMetric;
    }
  | {
      /** Entire benchmark completed / Весь замер завершен */
      readonly type: 'completed';
      /** Aggregated benchmark summary / Агрегированная итоговая сводка */
      readonly summary: BenchmarkSummary;
    }
  | {
      /** Benchmark terminated with a fatal domain error / Замер завершился ошибкой */
      readonly type: 'failed';
      /** Categorized domain error / Типизированная доменная ошибка */
      readonly error: DomainError;
    }
  | {
      /** Benchmark aborted by user or signal / Замер прерван пользователем или сигналом */
      readonly type: 'aborted';
    };

/**
 * Observer callback receiving benchmark progress events.
 * Функция-наблюдатель, получающая события прогресса замера.
 *
 * @param event - Emitted benchmark lifecycle event / Событие жизненного цикла замера.
 */
export type BenchmarkListener = (event: BenchmarkEvent) => void;

/**
 * Core benchmark engine contract.
 * Контракт ядра движка замера пропускной способности.
 */
export interface IBenchmarkEngine {
  /**
   * Planned number of iterations in this engine configuration.
   * Настроенное количество итераций замера.
   */
  readonly totalIterations: number;

  /**
   * Registers a progress event observer and returns an unsubscribe function.
   * Подписывает наблюдателя на события замера и возвращает функцию отписки.
   *
   * @param listener - Event listener callback / Callback-обработчик событий.
   * @returns Unsubscribe function / Функция отписки.
   */
  subscribe(listener: BenchmarkListener): () => void;

  /**
   * Executes the sequential download benchmark against `targetUrl`.
   * Запускает серию последовательных HTTP(S)-скачиваний по указанному `targetUrl`.
   *
   * @param targetUrl - Validated HTTP(S) target URL / Проверенный целевой URL.
   * @param signal - Abort signal for cancellation / Сигнал отмены выполнения.
   * @returns Aggregated benchmark summary / Итоговая сводка замера.
   */
  run(targetUrl: URL, signal: AbortSignal): Promise<BenchmarkSummary>;
}
