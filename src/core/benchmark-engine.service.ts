import { DomainError } from '../app/app.errors';
import { HTTP_CONSTANTS } from '../network/network.constants';
import {
  NetworkTransportError,
  type IHttpStreamClient,
  type IRetryPolicy,
  type RetryContext,
  type StreamDownloadResult,
} from '../network/network.types';
import type {
  BenchmarkConfig,
  BenchmarkEvent,
  BenchmarkListener,
  BenchmarkSummary,
  IBenchmarkEngine,
  IterationMetric,
} from './core.types';
import {
  calculateSpeedMBps,
  calculateSpeedMbps,
  computeBenchmarkSummary,
} from './metrics.calculator';

/**
 * Exit code returned when a benchmark is aborted by the user (`SIGINT` / Esc / `q`).
 * Код завершения при принудительной отмене замера пользователем.
 */
const ABORTED_EXIT_CODE = 130;

/**
 * Exit code returned when the target network resource remains unavailable after retries.
 * Код завершения при недоступности ресурса после исчерпания повторных попыток.
 */
const NETWORK_FAILURE_EXIT_CODE = 4;

/**
 * Injectable async sleep function used between retry attempts.
 * Внедряемая асинхронная функция паузы между повторными попытками.
 *
 * @param ms - Delay duration in milliseconds / Длительность паузы в миллисекундах.
 * @param signal - Abort signal canceling sleep immediately / Сигнал отмены для досрочного прерывания паузы.
 */
export type SleepFn = (ms: number, signal: AbortSignal) => Promise<void>;

/**
 * Default abort-aware sleep implementation.
 * Реализация паузы с поддержкой немедленной отмены через `AbortSignal`.
 *
 * @param ms - Duration to wait in milliseconds / Длительность ожидания в миллисекундах.
 * @param signal - Abort signal canceling the timer / Сигнал отмены таймера.
 * @returns Promise resolving after `ms` or rejecting with `ABORT_ERR` / Промис ожидания или отмены.
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new NetworkTransportError('Sleep aborted', 'ABORT_ERR'));
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new NetworkTransportError('Sleep aborted', 'ABORT_ERR'));
    };

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Tracks retry attempt counters separately for rate-limit (429) vs transient errors within an iteration.
 * Хранит раздельные счетчики попыток для HTTP 429 и прочих транзиентных ошибок в рамках одной итерации.
 */
interface IterationRetryCounters {
  /** Number of HTTP 429 attempts / Счетчик попыток после HTTP 429 */
  rateLimitAttempts: number;
  /** Number of transient HTTP/network error attempts / Счетчик попыток после транзиентных ошибок */
  transientAttempts: number;
  /** Combined total retries executed / Общее число повторов в текущей итерации */
  totalRetries: number;
}

/**
 * Core sequential download benchmark engine.
 * Executes N sequential HTTP(S) GET requests, applies retry strategies on 429/transient errors,
 * computes throughput metrics, and broadcasts progress via the Observer pattern.
 *
 * Ядро движка последовательного замера пропускной способности.
 * Выполняет N последовательных HTTP(S) GET-запросов, применяет политики повторов при 429 и сбоях,
 * рассчитывает метрики скорости и рассылает события прогресса по паттерну «Наблюдатель».
 */
export class BenchmarkEngineService implements IBenchmarkEngine {
  private readonly httpClient: IHttpStreamClient;
  private readonly retryPolicy: IRetryPolicy;
  private readonly config: BenchmarkConfig;
  private readonly sleepFn: SleepFn;
  private readonly listeners = new Set<BenchmarkListener>();

  /**
   * Creates a benchmark engine with injected networking, retry policy, and timing dependencies.
   * Создает движок замера с внедренными HTTP-клиентом, политикой повторов, конфигом и таймером сна.
   *
   * @param httpClient - Streaming HTTP(S) client / Потоковый HTTP(S)-клиент.
   * @param retryPolicy - Composite retry policy / Композитная политика повторов.
   * @param config - Benchmark runtime configuration / Параметры замера.
   * @param sleepFn - Optional sleep implementation (defaults to `abortableSleep`) / Функция задержки для тестов.
   */
  public constructor(
    httpClient: IHttpStreamClient,
    retryPolicy: IRetryPolicy,
    config: BenchmarkConfig,
    sleepFn: SleepFn = abortableSleep,
  ) {
    this.httpClient = httpClient;
    this.retryPolicy = retryPolicy;
    this.config = config;
    this.sleepFn = sleepFn;
  }

  /**
   * Planned number of iterations configured for this benchmark engine.
   * Запланированное количество итераций в текущей конфигурации движка.
   *
   * @returns Number of iterations / Число итераций.
   */
  public get totalIterations(): number {
    return this.config.iterations;
  }

  /**
   * Registers a progress event observer and returns an unsubscribe callback.
   * Регистрирует наблюдателя событий прогресса и возвращает функцию отписки.
   *
   * @param listener - Callback receiving `BenchmarkEvent` updates / Слушатель событий замера.
   * @returns Unsubscribe function / Функция отписки от событий.
   */
  public subscribe(listener: BenchmarkListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Runs `config.iterations` sequential GET downloads against `targetUrl`.
   * Запускает `config.iterations` последовательных GET-запросов к `targetUrl`.
   *
   * @param targetUrl - Validated HTTP(S) target URL / Провалидированный целевой URL.
   * @param signal - Abort signal for cancellation / Сигнал прерывания замера.
   * @returns Aggregated `BenchmarkSummary` across all completed iterations / Итоговая сводка замера.
   * @throws {DomainError} With code `ABORTED` or `RESOURCE_UNAVAILABLE` / При отмене или исчерпании повторов.
   */
  public async run(targetUrl: URL, signal: AbortSignal): Promise<BenchmarkSummary> {
    this.emit({
      type: 'started',
      targetUrl: targetUrl.toString(),
      totalIterations: this.config.iterations,
    });

    const completedMetrics: IterationMetric[] = [];

    try {
      for (let index = 1; index <= this.config.iterations; index += 1) {
        this.throwIfAborted(signal);

        this.emit({
          type: 'iteration-started',
          iteration: index,
          totalIterations: this.config.iterations,
        });

        const metric = await this.executeSingleIteration(targetUrl, index, signal);
        completedMetrics.push(metric);

        this.emit({
          type: 'iteration-completed',
          metric,
        });
      }

      const summary = computeBenchmarkSummary(
        targetUrl.toString(),
        this.config.iterations,
        completedMetrics,
      );

      this.emit({ type: 'completed', summary });
      return summary;
    } catch (error: unknown) {
      return this.handleRunFailure(error, signal);
    }
  }

  private handleRunFailure(error: unknown, signal: AbortSignal): never {
    if (this.isAbortError(error, signal)) {
      const abortError = new DomainError({
        code: 'ABORTED',
        i18nKey: 'error.aborted',
        exitCode: ABORTED_EXIT_CODE,
        cause: error,
      });
      this.emit({ type: 'aborted' });
      throw abortError;
    }

    const domainError =
      error instanceof DomainError
        ? error
        : new DomainError({
            code: 'RESOURCE_UNAVAILABLE',
            i18nKey: 'error.network.connectionUnavailable',
            i18nParams: { details: error instanceof Error ? error.message : String(error) },
            exitCode: NETWORK_FAILURE_EXIT_CODE,
            cause: error,
          });

    this.emit({ type: 'failed', error: domainError });
    throw domainError;
  }

  private async executeSingleIteration(
    targetUrl: URL,
    iterationIndex: number,
    signal: AbortSignal,
  ): Promise<IterationMetric> {
    const counters: IterationRetryCounters = {
      rateLimitAttempts: 0,
      transientAttempts: 0,
      totalRetries: 0,
    };

    while (!signal.aborted) {
      const outcome = await this.attemptDownload(targetUrl, iterationIndex, signal, counters);
      if (outcome.kind === 'success') {
        return outcome.metric;
      }

      const delayMs = this.evaluateRetryOrThrow(iterationIndex, outcome.failureContext, counters);
      await this.sleepFn(delayMs, signal);
    }

    throw new NetworkTransportError('Benchmark aborted', 'ABORT_ERR');
  }

  private async attemptDownload(
    targetUrl: URL,
    iterationIndex: number,
    signal: AbortSignal,
    counters: IterationRetryCounters,
  ): Promise<
    | { readonly kind: 'success'; readonly metric: IterationMetric }
    | { readonly kind: 'failure'; readonly failureContext: RetryContext }
  > {
    try {
      const result = await this.httpClient.downloadStream(targetUrl, {
        timeoutMs: this.config.requestTimeoutMs,
        signal,
        onChunk: (_chunkBytes, totalBytesSoFar, elapsedMs) => {
          this.emit({
            type: 'chunk-received',
            iteration: iterationIndex,
            bytesInIteration: totalBytesSoFar,
            elapsedMs,
            instantSpeedMbps: calculateSpeedMbps(totalBytesSoFar, elapsedMs),
            instantSpeedMBps: calculateSpeedMBps(totalBytesSoFar, elapsedMs),
          });
        },
      });

      if (
        result.statusCode >= HTTP_CONSTANTS.SUCCESS_STATUS_MIN &&
        result.statusCode < HTTP_CONSTANTS.ERROR_STATUS_MIN
      ) {
        return {
          kind: 'success',
          metric: {
            index: iterationIndex,
            bytesDownloaded: result.bytesDownloaded,
            durationMs: result.durationMs,
            speedMbps: calculateSpeedMbps(result.bytesDownloaded, result.durationMs),
            speedMBps: calculateSpeedMBps(result.bytesDownloaded, result.durationMs),
            retriesCount: counters.totalRetries,
          },
        };
      }

      return {
        kind: 'failure',
        failureContext: this.buildHttpFailureContext(result, counters),
      };
    } catch (error: unknown) {
      if (this.isAbortError(error, signal)) {
        throw error;
      }

      return {
        kind: 'failure',
        failureContext: this.buildTransportFailureContext(error, counters),
      };
    }
  }

  private buildHttpFailureContext(
    result: StreamDownloadResult,
    counters: IterationRetryCounters,
  ): RetryContext {
    if (result.statusCode === HTTP_CONSTANTS.TOO_MANY_REQUESTS_STATUS) {
      counters.rateLimitAttempts += 1;
      return {
        attempt: counters.rateLimitAttempts,
        statusCode: result.statusCode,
        headers: result.headers,
      };
    }

    counters.transientAttempts += 1;
    return {
      attempt: counters.transientAttempts,
      statusCode: result.statusCode,
      headers: result.headers,
    };
  }

  private buildTransportFailureContext(
    error: unknown,
    counters: IterationRetryCounters,
  ): RetryContext {
    counters.transientAttempts += 1;
    const transportError =
      error instanceof NetworkTransportError
        ? error
        : new NetworkTransportError(
            error instanceof Error ? error.message : String(error),
            'NETWORK_ERROR',
            error,
          );

    return {
      attempt: counters.transientAttempts,
      errorCode: transportError.code,
      error: transportError,
    };
  }

  private evaluateRetryOrThrow(
    iterationIndex: number,
    failureContext: RetryContext,
    counters: IterationRetryCounters,
  ): number {
    const decision = this.retryPolicy.evaluate(failureContext);
    if (!decision.shouldRetry) {
      throw this.buildExhaustedError(failureContext);
    }

    counters.totalRetries += 1;
    const maxAttempts =
      failureContext.statusCode === HTTP_CONSTANTS.TOO_MANY_REQUESTS_STATUS
        ? this.config.max429Retries
        : this.config.maxTransientRetries;

    this.emit({
      type: 'retry-scheduled',
      iteration: iterationIndex,
      attempt: failureContext.attempt,
      maxAttempts,
      decision,
    });

    return decision.delayMs;
  }

  private buildExhaustedError(context: RetryContext): DomainError {
    if (context.statusCode === HTTP_CONSTANTS.TOO_MANY_REQUESTS_STATUS) {
      return new DomainError({
        code: 'RATE_LIMITED_EXHAUSTED',
        i18nKey: 'error.network.rateLimitedExhausted',
        i18nParams: { attempts: this.config.max429Retries },
        exitCode: NETWORK_FAILURE_EXIT_CODE,
      });
    }

    if (context.statusCode !== undefined) {
      return new DomainError({
        code: 'RESOURCE_UNAVAILABLE',
        i18nKey: 'error.network.httpUnavailable',
        i18nParams: { status: context.statusCode },
        exitCode: NETWORK_FAILURE_EXIT_CODE,
      });
    }

    const message = context.error?.message ?? context.errorCode ?? 'Unknown network error';
    return new DomainError({
      code: 'RESOURCE_UNAVAILABLE',
      i18nKey: 'error.network.connectionUnavailable',
      i18nParams: { details: message },
      exitCode: NETWORK_FAILURE_EXIT_CODE,
      cause: context.error,
    });
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new NetworkTransportError('Benchmark aborted', 'ABORT_ERR');
    }
  }

  private isAbortError(error: unknown, signal: AbortSignal): boolean {
    if (signal.aborted) {
      return true;
    }
    return error instanceof NetworkTransportError && error.code === 'ABORT_ERR';
  }

  private emit(event: BenchmarkEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
