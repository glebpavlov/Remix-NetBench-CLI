import { HTTP_CONSTANTS } from '../network.constants';
import type { IRetryStrategy, RetryContext, RetryDecision } from '../network.types';

/**
 * Configuration options for transient HTTP (4xx/5xx) and network error retries.
 * Параметры конфигурации стратегии повторов при транзиентных HTTP (4xx/5xx) и сетевых ошибках.
 */
export interface TransientErrorOptions {
  /**
   * Maximum number of retry attempts allowed per iteration before failing.
   * Максимальное число повторных попыток на одну итерацию до возврата ошибки.
   */
  readonly maxRetries: number;

  /**
   * Fixed pause duration in milliseconds before each transient retry attempt.
   * Фиксированная пауза в миллисекундах перед каждой повторной попыткой.
   */
  readonly delayMs: number;
}

/**
 * Retry strategy for non-429 HTTP 4xx/5xx statuses and transient network errors
 * (timeouts, `ECONNRESET`, DNS failures, socket closures) with a strict attempt limit.
 *
 * Стратегия повторов для HTTP-статусов 4xx/5xx (кроме 429) и временных сетевых сбоев
 * (таймауты, `ECONNRESET`, ошибки DNS, разрывы сокета) со строгим ограничением числа попыток.
 */
export class TransientErrorStrategy implements IRetryStrategy {
  private readonly maxRetries: number;
  private readonly delayMs: number;

  /**
   * Creates a transient error retry strategy with bounded attempts and short pause.
   * Создает стратегию повторов при транзиентных ошибках с заданным лимитом и паузой.
   *
   * @param options - Attempt budget and delay duration / Лимит попыток и длительность задержки.
   */
  public constructor(options: TransientErrorOptions) {
    this.maxRetries = options.maxRetries;
    this.delayMs = options.delayMs;
  }

  /**
   * Matches any non-429 HTTP error status (`>= 400`) or network/transport error.
   * Срабатывает для любого ошибочного HTTP-статуса (`>= 400`, кроме `429`) или сетевого исключения.
   *
   * @param context - Failure context / Контекст сбоя.
   * @returns `true` if supported by this strategy / `true`, если ошибка относится к транзиентным.
   */
  public supports(context: RetryContext): boolean {
    if (context.statusCode !== undefined) {
      return (
        context.statusCode >= HTTP_CONSTANTS.ERROR_STATUS_MIN &&
        context.statusCode !== HTTP_CONSTANTS.TOO_MANY_REQUESTS_STATUS
      );
    }

    return context.error !== undefined || context.errorCode !== undefined;
  }

  /**
   * Evaluates whether another retry attempt is allowed and returns the fixed short delay.
   * Проверяет, не исчерпан ли лимит попыток, и возвращает фиксированную задержку.
   *
   * @param context - Failure context / Контекст сбоя.
   * @returns Retry decision with localized reason key / Решение о повторе с ключом локализации причины.
   */
  public evaluate(context: RetryContext): RetryDecision {
    const isHttpError = context.statusCode !== undefined;
    const reasonKey = isHttpError ? 'retry.httpStatus' : 'retry.networkError';
    const reasonParams = isHttpError
      ? { status: context.statusCode }
      : { code: context.errorCode ?? 'UNKNOWN' };

    if (context.attempt > this.maxRetries) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reasonKey,
        reasonParams,
      };
    }

    return {
      shouldRetry: true,
      delayMs: this.delayMs,
      reasonKey,
      reasonParams,
    };
  }
}
