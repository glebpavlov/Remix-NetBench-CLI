import { HTTP_CONSTANTS, RETRY_HEADER_NAMES } from '../network.constants';
import type { HttpHeadersMap, IRetryStrategy, RetryContext, RetryDecision } from '../network.types';

const DEFAULT_JITTER_RATIO = 0.2;
const MS_PER_SECOND = 1_000;

/**
 * Configuration options for the HTTP 429 exponential backoff retry strategy.
 * Параметры конфигурации стратегии повторов при HTTP 429 (Exponential Backoff + Jitter).
 */
export interface RateLimit429Options {
  /**
   * Maximum number of retry attempts allowed for HTTP 429 responses.
   * Максимальное число повторных попыток при получении HTTP 429.
   */
  readonly maxRetries: number;

  /**
   * Base backoff delay in milliseconds for the first exponential step.
   * Базовая задержка (в мс) для первого шага экспоненциального отката.
   */
  readonly baseBackoffMs: number;

  /**
   * Upper cap on computed wait delay in milliseconds (applies to both Retry-After and backoff).
   * Верхний предел задержки в миллисекундах (действует и для Retry-After, и для backoff).
   */
  readonly maxBackoffMs: number;

  /**
   * Random jitter multiplier `[0..1]` added on top of exponential delay (default `0.2`).
   * Коэффициент случайного джиттера `[0..1]` поверх экспоненциальной задержки (по умолчанию `0.2`).
   */
  readonly jitterRatio?: number;

  /**
   * Injectable current timestamp provider in epoch milliseconds (for deterministic testing).
   * Внедряемая функция получения текущего времени в мс (для детерминированных тестов).
   */
  readonly nowFn?: () => number;

  /**
   * Injectable pseudo-random generator returning `[0, 1)` (for deterministic testing).
   * Внедряемый генератор случайных чисел `[0, 1)` (для детерминированных тестов).
   */
  readonly randomFn?: () => number;
}

/**
 * Retry strategy dedicated to HTTP 429 (Too Many Requests).
 * Prioritizes the server's `Retry-After` header (integer/float seconds or HTTP-date),
 * falling back to exponential backoff with optional random jitter.
 *
 * Стратегия повторов для ответа HTTP 429 (Too Many Requests).
 * В первую очередь учитывает заголовок `Retry-After` (секунды или HTTP-date),
 * а при его отсутствии применяет экспоненциальную задержку со случайным джиттером.
 */
export class RateLimit429Strategy implements IRetryStrategy {
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitterRatio: number;
  private readonly nowFn: () => number;
  private readonly randomFn: () => number;

  /**
   * Creates a new HTTP 429 retry strategy instance.
   * Создает экземпляр стратегии повторов для HTTP 429.
   *
   * @param options - Backoff bounds, max retries, and optional clock/RNG hooks / Настройки задержек, лимита попыток и часов.
   */
  public constructor(options: RateLimit429Options) {
    this.maxRetries = options.maxRetries;
    this.baseBackoffMs = options.baseBackoffMs;
    this.maxBackoffMs = options.maxBackoffMs;
    this.jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO;
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.randomFn = options.randomFn ?? (() => Math.random());
  }

  /**
   * Returns `true` only when the HTTP status code equals `429`.
   * Возвращает `true` только если код HTTP-ответа равен `429`.
   *
   * @param context - Failure context / Контекст сбоя.
   * @returns `true` if status code is 429 / `true`, если получен HTTP 429.
   */
  public supports(context: RetryContext): boolean {
    return context.statusCode === HTTP_CONSTANTS.TOO_MANY_REQUESTS_STATUS;
  }

  /**
   * Computes whether to retry and the exact wait delay in milliseconds.
   * Вычисляет разрешение на повторную попытку и точную длительность ожидания в миллисекундах.
   *
   * @param context - Failure context containing attempt number and response headers / Контекст сбоя с номером попытки и заголовками.
   * @returns Retry decision with bounded delay / Решение о повторе с ограниченной задержкой.
   */
  public evaluate(context: RetryContext): RetryDecision {
    if (context.attempt > this.maxRetries) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reasonKey: 'retry.rateLimited',
      };
    }

    const retryAfterMs = this.parseRetryAfterMs(context.headers);
    const delayMs =
      retryAfterMs !== undefined
        ? Math.min(Math.max(0, retryAfterMs), this.maxBackoffMs)
        : this.computeExponentialBackoffMs(context.attempt);

    return {
      shouldRetry: true,
      delayMs,
      reasonKey: 'retry.rateLimited',
    };
  }

  private computeExponentialBackoffMs(attempt: number): number {
    const exponent = Math.max(0, attempt - 1);
    const exponentialDelay = Math.min(
      this.baseBackoffMs * Math.pow(2, exponent),
      this.maxBackoffMs,
    );
    const jitter = Math.round(exponentialDelay * this.jitterRatio * this.randomFn());
    return Math.min(exponentialDelay + jitter, this.maxBackoffMs);
  }

  private parseRetryAfterMs(headers: HttpHeadersMap | undefined): number | undefined {
    if (headers === undefined) {
      return undefined;
    }

    const entry = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === RETRY_HEADER_NAMES.RETRY_AFTER,
    );
    if (entry === undefined) {
      return undefined;
    }

    const rawValue = Array.isArray(entry[1]) ? entry[1][0] : entry[1];
    if (rawValue === undefined) {
      return undefined;
    }

    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    // Numeric Retry-After represents delay in seconds (e.g., "5" or "2.5").
    // Числовое значение Retry-After задает задержку в секундах (например, "5" или "2.5").
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const seconds = Number(trimmed);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.round(seconds * MS_PER_SECOND);
      }
    }

    // HTTP-date Retry-After represents a future GMT timestamp.
    // Дата в формате HTTP-date задает момент времени, до которого нужно подождать.
    const parsedDateMs = Date.parse(trimmed);
    if (!Number.isNaN(parsedDateMs)) {
      return Math.max(0, parsedDateMs - this.nowFn());
    }

    return undefined;
  }
}
