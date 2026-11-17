import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/app/app.errors';
import { DEFAULT_BENCHMARK_CONFIG } from '../src/core/benchmark.constants';
import { BenchmarkEngineService, abortableSleep } from '../src/core/benchmark-engine.service';
import type { BenchmarkEvent } from '../src/core/core.types';
import { RetryPolicyService } from '../src/network/retry-policy.service';
import { RateLimit429Strategy } from '../src/network/strategies/rate-limit-429.strategy';
import { TransientErrorStrategy } from '../src/network/strategies/transient-error.strategy';
import {
  NetworkTransportError,
  type IHttpStreamClient,
  type StreamDownloadOptions,
  type StreamDownloadResult,
} from '../src/network/network.types';

describe('BenchmarkEngineService (Ядро последовательного замера и Observer)', () => {
  it('executes 10 sequential requests and emits ordered Observer lifecycle events / выполняет 10 последовательных запросов и публикует события жизненного цикла', async () => {
    let callCount = 0;
    const mockClient: IHttpStreamClient = {
      downloadStream(_url: URL, options: StreamDownloadOptions): Promise<StreamDownloadResult> {
        callCount += 1;
        options.onChunk?.(500_000, 500_000, 50);
        options.onChunk?.(500_000, 1_000_000, 100);
        return Promise.resolve({
          statusCode: 200,
          bytesDownloaded: 1_000_000,
          durationMs: 100,
          headers: {},
        });
      },
    };

    const retryPolicy = new RetryPolicyService([
      new RateLimit429Strategy({ maxRetries: 2, baseBackoffMs: 10, maxBackoffMs: 50 }),
      new TransientErrorStrategy({ maxRetries: 2, delayMs: 10 }),
    ]);

    const engine = new BenchmarkEngineService(
      mockClient,
      retryPolicy,
      DEFAULT_BENCHMARK_CONFIG,
      () => Promise.resolve(),
    );

    const events: BenchmarkEvent[] = [];
    const unsubscribe = engine.subscribe((evt) => events.push(evt));

    const summary = await engine.run(
      new URL('https://example.com/1MB.bin'),
      new AbortController().signal,
    );
    unsubscribe();

    expect(callCount).toBe(10);
    expect(summary.completedIterations).toBe(10);
    expect(summary.totalBytes).toBe(10_000_000);
    expect(summary.averageSpeedMbps).toBeCloseTo(80, 5);
    expect(events[0]?.type).toBe('started');
    expect(events.filter((e) => e.type === 'iteration-started')).toHaveLength(10);
    expect(events.filter((e) => e.type === 'chunk-received')).toHaveLength(20);
    expect(events.filter((e) => e.type === 'iteration-completed')).toHaveLength(10);
    expect(events.at(-1)?.type).toBe('completed');
  });

  it('recovers from HTTP 429 and transient ECONNRESET within retry budget / восстанавливается после HTTP 429 и ECONNRESET в пределах лимита попыток', async () => {
    let attempts = 0;
    const sleepDurations: number[] = [];

    const mockClient: IHttpStreamClient = {
      downloadStream(): Promise<StreamDownloadResult> {
        attempts += 1;
        if (attempts === 1) {
          return Promise.resolve({
            statusCode: 429,
            bytesDownloaded: 0,
            durationMs: 10,
            headers: { 'Retry-After': '2' },
          });
        }
        if (attempts === 2) {
          return Promise.reject(new NetworkTransportError('reset', 'ECONNRESET'));
        }
        return Promise.resolve({
          statusCode: 200,
          bytesDownloaded: 2_000_000,
          durationMs: 200,
          headers: {},
        });
      },
    };

    const retryPolicy = new RetryPolicyService([
      new RateLimit429Strategy({ maxRetries: 3, baseBackoffMs: 500, maxBackoffMs: 10_000 }),
      new TransientErrorStrategy({ maxRetries: 2, delayMs: 250 }),
    ]);

    const engine = new BenchmarkEngineService(
      mockClient,
      retryPolicy,
      { ...DEFAULT_BENCHMARK_CONFIG, iterations: 1 },
      (ms) => {
        sleepDurations.push(ms);
        return Promise.resolve();
      },
    );

    const retryEvents: BenchmarkEvent[] = [];
    engine.subscribe((evt) => {
      if (evt.type === 'retry-scheduled') {
        retryEvents.push(evt);
      }
    });

    const summary = await engine.run(
      new URL('https://example.com/file'),
      new AbortController().signal,
    );

    expect(attempts).toBe(3);
    expect(sleepDurations).toEqual([2_000, 250]);
    expect(retryEvents).toHaveLength(2);
    expect(summary.iterations[0]?.retriesCount).toBe(2);
  });

  it('throws RATE_LIMITED_EXHAUSTED when HTTP 429 retries are exhausted / выбрасывает RATE_LIMITED_EXHAUSTED при исчерпании попыток 429', async () => {
    const mockClient: IHttpStreamClient = {
      downloadStream(): Promise<StreamDownloadResult> {
        return Promise.resolve({
          statusCode: 429,
          bytesDownloaded: 0,
          durationMs: 5,
          headers: {},
        });
      },
    };

    const retryPolicy = new RetryPolicyService([
      new RateLimit429Strategy({
        maxRetries: 2,
        baseBackoffMs: 10,
        maxBackoffMs: 50,
        jitterRatio: 0,
      }),
    ]);

    const engine = new BenchmarkEngineService(
      mockClient,
      retryPolicy,
      { ...DEFAULT_BENCHMARK_CONFIG, iterations: 1, max429Retries: 2 },
      () => Promise.resolve(),
    );

    await expect(
      engine.run(new URL('https://example.com/429'), new AbortController().signal),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED_EXHAUSTED',
      i18nKey: 'error.network.rateLimitedExhausted',
      exitCode: 4,
    });
  });

  it('throws DomainError without crashing and emits failed when retries are exhausted on 5xx / корректно завершается с DomainError и событием failed при 5xx', async () => {
    const mockClient: IHttpStreamClient = {
      downloadStream(): Promise<StreamDownloadResult> {
        return Promise.resolve({
          statusCode: 502,
          bytesDownloaded: 0,
          durationMs: 15,
          headers: {},
        });
      },
    };

    const retryPolicy = new RetryPolicyService([
      new TransientErrorStrategy({ maxRetries: 2, delayMs: 10 }),
    ]);

    const engine = new BenchmarkEngineService(
      mockClient,
      retryPolicy,
      { ...DEFAULT_BENCHMARK_CONFIG, iterations: 10, maxTransientRetries: 2 },
      () => Promise.resolve(),
    );

    const events: BenchmarkEvent[] = [];
    engine.subscribe((e) => events.push(e));

    await expect(
      engine.run(new URL('https://example.com/fail'), new AbortController().signal),
    ).rejects.toBeInstanceOf(DomainError);

    expect(events.at(-1)?.type).toBe('failed');
  });

  it('throws ABORTED DomainError and emits aborted event when AbortSignal fires / выбрасывает ABORTED и публикует aborted при отмене сигнала', async () => {
    const controller = new AbortController();
    const mockClient: IHttpStreamClient = {
      downloadStream(): Promise<StreamDownloadResult> {
        controller.abort();
        return Promise.reject(new NetworkTransportError('aborted', 'ABORT_ERR'));
      },
    };

    const retryPolicy = new RetryPolicyService([
      new TransientErrorStrategy({ maxRetries: 3, delayMs: 10 }),
    ]);

    const engine = new BenchmarkEngineService(
      mockClient,
      retryPolicy,
      { ...DEFAULT_BENCHMARK_CONFIG, iterations: 5 },
      () => Promise.resolve(),
    );

    const events: BenchmarkEvent[] = [];
    engine.subscribe((e) => events.push(e));

    await expect(
      engine.run(new URL('https://example.com/abort'), controller.signal),
    ).rejects.toMatchObject({
      code: 'ABORTED',
      exitCode: 130,
    });

    expect(events.at(-1)?.type).toBe('aborted');
  });

  it('stops delivering events after listener unsubscribes / прекращает доставку событий после вызова unsubscribe()', async () => {
    const mockClient: IHttpStreamClient = {
      downloadStream(): Promise<StreamDownloadResult> {
        return Promise.resolve({
          statusCode: 200,
          bytesDownloaded: 1000,
          durationMs: 10,
          headers: {},
        });
      },
    };

    const engine = new BenchmarkEngineService(
      mockClient,
      new RetryPolicyService([]),
      { ...DEFAULT_BENCHMARK_CONFIG, iterations: 1 },
      () => Promise.resolve(),
    );

    let received = 0;
    const unsubscribe = engine.subscribe(() => {
      received += 1;
      unsubscribe();
    });

    await engine.run(new URL('https://example.com/one'), new AbortController().signal);
    expect(received).toBe(1);
  });

  it('abortableSleep resolves on 0ms and rejects immediately when signal is aborted / проверяет abortableSleep при 0 мс и отмене', async () => {
    const controller = new AbortController();
    await expect(abortableSleep(0, controller.signal)).resolves.toBeUndefined();

    controller.abort();
    await expect(abortableSleep(5_000, controller.signal)).rejects.toMatchObject({
      code: 'ABORT_ERR',
    });
  });
});
