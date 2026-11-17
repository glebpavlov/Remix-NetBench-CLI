import { describe, expect, it } from 'vitest';
import { RetryPolicyService } from '../src/network/retry-policy.service';
import { RateLimit429Strategy } from '../src/network/strategies/rate-limit-429.strategy';
import { TransientErrorStrategy } from '../src/network/strategies/transient-error.strategy';

describe('RetryPolicyService & Strategies (Политики повторов и стратегия backoff)', () => {
  it('applies exponential backoff with cap for HTTP 429 without Retry-After / применяет экспоненциальный backoff с потолком для HTTP 429 без Retry-After', () => {
    const rateLimitStrategy = new RateLimit429Strategy({
      maxRetries: 3,
      baseBackoffMs: 1_000,
      maxBackoffMs: 3_500,
      jitterRatio: 0,
    });
    const policy = new RetryPolicyService([rateLimitStrategy]);

    const first = policy.evaluate({ attempt: 1, statusCode: 429, headers: {} });
    const second = policy.evaluate({ attempt: 2, statusCode: 429, headers: {} });
    const third = policy.evaluate({ attempt: 3, statusCode: 429, headers: {} });
    const fourth = policy.evaluate({ attempt: 4, statusCode: 429, headers: {} });

    expect(first).toEqual({
      shouldRetry: true,
      delayMs: 1_000,
      reasonKey: 'retry.rateLimited',
    });
    expect(second.delayMs).toBe(2_000);
    // 4_000ms clamped to maxBackoffMs = 3_500ms
    expect(third.delayMs).toBe(3_500);
    expect(fourth.shouldRetry).toBe(false);
  });

  it('adds bounded jitter when randomFn and jitterRatio are configured / добавляет ограниченный джиттер при настроенном jitterRatio', () => {
    const strategy = new RateLimit429Strategy({
      maxRetries: 2,
      baseBackoffMs: 1_000,
      maxBackoffMs: 5_000,
      jitterRatio: 0.25,
      randomFn: () => 0.5,
    });

    const decision = strategy.evaluate({ attempt: 1, statusCode: 429, headers: {} });
    // 1000 + round(1000 * 0.25 * 0.5) = 1125ms
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(1_125);
  });

  it('prioritizes numeric Retry-After header (including fractional seconds and arrays) over exponential backoff / учитывает числовой Retry-After (дробный и в виде массива)', () => {
    const rateLimitStrategy = new RateLimit429Strategy({
      maxRetries: 3,
      baseBackoffMs: 1_000,
      maxBackoffMs: 30_000,
      jitterRatio: 0.2,
    });

    const intDecision = rateLimitStrategy.evaluate({
      attempt: 1,
      statusCode: 429,
      headers: { 'Retry-After': '7' },
    });
    expect(intDecision.shouldRetry).toBe(true);
    expect(intDecision.delayMs).toBe(7_000);

    const floatArrayDecision = rateLimitStrategy.evaluate({
      attempt: 1,
      statusCode: 429,
      headers: { 'retry-after': ['1.5', '99'] },
    });
    expect(floatArrayDecision.delayMs).toBe(1_500);
  });

  it('prioritizes HTTP-date Retry-After header, clamps past dates to 0, and caps at maxBackoffMs / парсит HTTP-date Retry-After и ограничивает диапазон', () => {
    const fixedNow = Date.parse('2026-11-16T12:00:00.000Z');
    const rateLimitStrategy = new RateLimit429Strategy({
      maxRetries: 3,
      baseBackoffMs: 1_000,
      maxBackoffMs: 15_000,
      nowFn: () => fixedNow,
    });

    const decisionWithinCap = rateLimitStrategy.evaluate({
      attempt: 1,
      statusCode: 429,
      headers: { 'retry-after': 'Mon, 16 Nov 2026 12:00:05 GMT' },
    });
    expect(decisionWithinCap.delayMs).toBe(5_000);

    const decisionPastDate = rateLimitStrategy.evaluate({
      attempt: 1,
      statusCode: 429,
      headers: { 'retry-after': 'Mon, 16 Nov 2026 11:59:50 GMT' },
    });
    expect(decisionPastDate.delayMs).toBe(0);

    const decisionOverCap = rateLimitStrategy.evaluate({
      attempt: 1,
      statusCode: 429,
      headers: { 'retry-after': 'Mon, 16 Nov 2026 12:01:00 GMT' },
    });
    expect(decisionOverCap.delayMs).toBe(15_000);
  });

  it('falls back to exponential backoff when Retry-After header is invalid / откатывается к backoff при невалидном заголовке Retry-After', () => {
    const rateLimitStrategy = new RateLimit429Strategy({
      maxRetries: 2,
      baseBackoffMs: 1_000,
      maxBackoffMs: 10_000,
      jitterRatio: 0,
    });

    const decision = rateLimitStrategy.evaluate({
      attempt: 1,
      statusCode: 429,
      headers: { 'Retry-After': 'not-a-number-or-date' },
    });

    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBe(1_000);
  });

  it('enforces bounded retry attempts for 4xx/5xx HTTP errors and network failures / ограничивает число попыток при 4xx/5xx и сетевых сбоях', () => {
    const policy = new RetryPolicyService([
      new RateLimit429Strategy({
        maxRetries: 3,
        baseBackoffMs: 1_000,
        maxBackoffMs: 10_000,
      }),
      new TransientErrorStrategy({
        maxRetries: 2,
        delayMs: 500,
      }),
    ]);

    const http503Attempt1 = policy.evaluate({ attempt: 1, statusCode: 503 });
    const http503Attempt2 = policy.evaluate({ attempt: 2, statusCode: 503 });
    const http503Attempt3 = policy.evaluate({ attempt: 3, statusCode: 503 });

    expect(http503Attempt1.shouldRetry).toBe(true);
    expect(http503Attempt1.delayMs).toBe(500);
    expect(http503Attempt1.reasonParams).toEqual({ status: 503 });
    expect(http503Attempt2.shouldRetry).toBe(true);
    expect(http503Attempt3.shouldRetry).toBe(false);

    const http404Attempt1 = policy.evaluate({ attempt: 1, statusCode: 404 });
    const http404Attempt3 = policy.evaluate({ attempt: 3, statusCode: 404 });
    expect(http404Attempt1.shouldRetry).toBe(true);
    expect(http404Attempt3.shouldRetry).toBe(false);

    const econnresetAttempt1 = policy.evaluate({
      attempt: 1,
      errorCode: 'ECONNRESET',
      error: new Error('socket hang up'),
    });
    const econnresetAttempt3 = policy.evaluate({
      attempt: 3,
      errorCode: 'ECONNRESET',
      error: new Error('socket hang up'),
    });
    expect(econnresetAttempt1.shouldRetry).toBe(true);
    expect(econnresetAttempt1.reasonKey).toBe('retry.networkError');
    expect(econnresetAttempt3.shouldRetry).toBe(false);
  });

  it('declines retry when no registered strategy supports the context / отклоняет повтор, если ни одна стратегия не подходит', () => {
    const emptyPolicy = new RetryPolicyService([]);
    const decision = emptyPolicy.evaluate({ attempt: 1, statusCode: 200 });

    expect(decision).toEqual({
      shouldRetry: false,
      delayMs: 0,
      reasonKey: 'retry.networkError',
      reasonParams: { code: 'UNSUPPORTED' },
    });
  });
});
