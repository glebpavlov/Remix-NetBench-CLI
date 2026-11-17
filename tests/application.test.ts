import { describe, expect, it } from 'vitest';
import { ApplicationService } from '../src/app/application.service';
import type { IConfigLoader, PresetTarget } from '../src/config/config.types';
import { UrlValidatorService } from '../src/config/url-validator.service';
import type {
  BenchmarkEvent,
  BenchmarkListener,
  BenchmarkSummary,
  IBenchmarkEngine,
} from '../src/core/core.types';
import { I18nService } from '../src/i18n/i18n.service';
import { Locale } from '../src/i18n/i18n.types';
import type { ITerminalOutputStream, ITuiController } from '../src/tui/tui.types';

describe('ApplicationService (Оркестрация режимов запуска CLI и TUI)', () => {
  const sampleMetric = {
    index: 1,
    bytesDownloaded: 1_000_000,
    durationMs: 100,
    speedMbps: 80,
    speedMBps: 10,
    retriesCount: 0,
  };

  const sampleSummary: BenchmarkSummary = {
    targetUrl: 'https://example.com/test.bin',
    completedIterations: 1,
    totalIterations: 1,
    totalBytes: 1_000_000,
    totalDurationMs: 100,
    averageDurationMs: 100,
    averageSpeedMbps: 80,
    averageSpeedMBps: 10,
    iterations: [sampleMetric],
  };

  function createDeps(isTTY: boolean): {
    app: ApplicationService;
    writes: string[];
    tuiCalls: { direct: URL[]; menu: (readonly PresetTarget[])[] };
  } {
    const writes: string[] = [];
    const tuiCalls: { direct: URL[]; menu: (readonly PresetTarget[])[] } = {
      direct: [],
      menu: [],
    };

    const output: ITerminalOutputStream = {
      columns: 80,
      rows: 24,
      isTTY,
      write: (chunk) => {
        writes.push(chunk);
        return true;
      },
      onResize: () => () => undefined,
    };

    const listeners = new Set<BenchmarkListener>();
    const engine: IBenchmarkEngine = {
      totalIterations: 1,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      run: () => {
        const emit = (e: BenchmarkEvent): void => {
          for (const l of listeners) {
            l(e);
          }
        };
        emit({
          type: 'retry-scheduled',
          iteration: 1,
          attempt: 1,
          maxAttempts: 3,
          decision: { shouldRetry: true, delayMs: 1000, reasonKey: 'retry.rateLimited' },
        });
        emit({
          type: 'iteration-completed',
          metric: sampleMetric,
        });
        return Promise.resolve(sampleSummary);
      },
    };

    const tui: ITuiController = {
      runInteractiveMenu: (presets) => {
        tuiCalls.menu.push(presets);
        return Promise.resolve();
      },
      runDirectBenchmark: (url) => {
        tuiCalls.direct.push(url);
        return Promise.resolve(sampleSummary);
      },
    };

    const configLoader: IConfigLoader = {
      loadPresets: () => Promise.resolve([{ name: 'Test', url: 'https://example.com/test.bin' }]),
    };

    const app = new ApplicationService({
      i18n: new I18nService(Locale.RU),
      urlValidator: new UrlValidatorService(),
      configLoader,
      engine,
      tui,
      output,
    });

    return { app, writes, tuiCalls };
  }

  it('prints localized help text and resolves debug callback when --help is passed / выводит справку при --help и передает флаг --debug', async () => {
    const { app, writes } = createDeps(false);
    let resolvedDebug = false;

    const exitCode = await app.run(['--help', '--debug', '--lang', 'en'], (dbg) => {
      resolvedDebug = dbg;
    });

    expect(exitCode).toBe(0);
    expect(resolvedDebug).toBe(true);
    expect(writes.join('')).toContain('Usage: netbench [url] [options]');
  });

  it('executes headless benchmark in non-TTY mode when URL is passed / запускает headless-замер вне TTY при передаче URL', async () => {
    const { app, writes, tuiCalls } = createDeps(false);

    const exitCode = await app.run(['--url', 'https://example.com/test.bin', '-l', 'en']);

    expect(exitCode).toBe(0);
    expect(tuiCalls.direct).toHaveLength(0);
    const out = writes.join('');
    expect(out).toContain('Retry 1/3');
    expect(out).toContain('[1] 80.00 Mbps (10.00 MB/s)');
    expect(out).toContain('Benchmark Results');
  });

  it('executes direct TUI benchmark in TTY mode when URL is passed / запускает прямой TUI-замер в TTY при передаче URL', async () => {
    const { app, writes, tuiCalls } = createDeps(true);

    const exitCode = await app.run(['https://example.com/test.bin']);

    expect(exitCode).toBe(0);
    expect(tuiCalls.direct).toHaveLength(1);
    expect(tuiCalls.direct[0]?.toString()).toBe('https://example.com/test.bin');
    expect(writes.join('')).toContain('https://example.com/test.bin');
  });

  it('loads presets and starts interactive menu in TTY mode when no URL is given / загружает пресеты и открывает меню в TTY без URL', async () => {
    const { app, tuiCalls } = createDeps(true);

    const exitCode = await app.run([]);

    expect(exitCode).toBe(0);
    expect(tuiCalls.menu).toHaveLength(1);
    expect(tuiCalls.menu[0]).toEqual([{ name: 'Test', url: 'https://example.com/test.bin' }]);
  });

  it('throws INVALID_CLI_ARGS when invoked without URL in non-TTY environment / выбрасывает ошибку в не-TTY режиме без URL', async () => {
    const { app } = createDeps(false);

    await expect(app.run([])).rejects.toMatchObject({
      code: 'INVALID_CLI_ARGS',
      i18nKey: 'cli.nonInteractiveNoUrl',
      exitCode: 2,
    });
  });
});
