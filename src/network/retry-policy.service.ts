import type { IRetryPolicy, IRetryStrategy, RetryContext, RetryDecision } from './network.types';

/**
 * Composes an ordered list of `IRetryStrategy` implementations to evaluate failure recovery.
 * Композитная политика повторов, последовательно опрашивающая список стратегий `IRetryStrategy`.
 */
export class RetryPolicyService implements IRetryPolicy {
  private readonly strategies: readonly IRetryStrategy[];

  /**
   * Creates a retry policy from an ordered list of strategies.
   * Создает политику повторов из упорядоченного списка стратегий.
   *
   * @param strategies - Ordered retry strategies (first matching wins) / Упорядоченный список стратегий (срабатывает первая подходящая).
   */
  public constructor(strategies: readonly IRetryStrategy[]) {
    this.strategies = strategies;
  }

  /**
   * Selects the first strategy supporting `context` and evaluates its retry decision.
   * Выбирает первую подходящую стратегию для `context` и возвращает ее решение о повторе.
   *
   * @param context - Failure metadata from the failed request / Контекст неудачной попытки запроса.
   * @returns Computed `RetryDecision` (falls back to `shouldRetry: false` if unsupported) / Итоговое решение о повторе.
   */
  public evaluate(context: RetryContext): RetryDecision {
    for (const strategy of this.strategies) {
      if (strategy.supports(context)) {
        return strategy.evaluate(context);
      }
    }

    return {
      shouldRetry: false,
      delayMs: 0,
      reasonKey: 'retry.networkError',
      reasonParams: { code: context.errorCode ?? 'UNSUPPORTED' },
    };
  }
}
