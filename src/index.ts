#!/usr/bin/env node
import { ApplicationService } from './app/application.service';
import { CliParserService } from './app/cli-parser.service';
import { GlobalErrorBoundaryService } from './app/error-boundary.service';
import { JsonConfigLoaderService } from './config/config-loader.service';
import { UrlValidatorService } from './config/url-validator.service';
import { DEFAULT_BENCHMARK_CONFIG } from './core/benchmark.constants';
import { BenchmarkEngineService } from './core/benchmark-engine.service';
import { I18nService } from './i18n/i18n.service';
import { Locale } from './i18n/i18n.types';
import { NodeHttpStreamClientService } from './network/http-stream-client.service';
import { RetryPolicyService } from './network/retry-policy.service';
import { RateLimit429Strategy } from './network/strategies/rate-limit-429.strategy';
import { TransientErrorStrategy } from './network/strategies/transient-error.strategy';
import { DiffRenderer } from './tui/diff.renderer';
import { InputController, NodeTerminalInputStream } from './tui/input.controller';
import { NodeTerminalOutputStream, TerminalLifecycle } from './tui/terminal.lifecycle';
import { TuiController } from './tui/tui.controller';

/**
 * Composition root wiring all dependency-injected services and executing the CLI utility
 * under the protection of `GlobalErrorBoundaryService`.
 *
 * Точка сборки зависимостей (Composition Root): связывает все сервисы через DI
 * и запускает CLI-утилиту под защитой глобального перехватчика ошибок `GlobalErrorBoundaryService`.
 */
async function bootstrap(): Promise<void> {
  const i18n = new I18nService(Locale.RU);
  const output = new NodeTerminalOutputStream(process.stdout);
  const inputStream = new NodeTerminalInputStream(process.stdin);
  const lifecycle = new TerminalLifecycle(output);

  const errorBoundary = new GlobalErrorBoundaryService({
    stderr: process.stderr,
    i18n,
    lifecycle,
  });
  errorBoundary.registerProcessHandlers();

  const urlValidator = new UrlValidatorService();
  const configLoader = new JsonConfigLoaderService(urlValidator);
  const httpClient = new NodeHttpStreamClientService();

  const retryPolicy = new RetryPolicyService([
    new RateLimit429Strategy({
      maxRetries: DEFAULT_BENCHMARK_CONFIG.max429Retries,
      baseBackoffMs: DEFAULT_BENCHMARK_CONFIG.baseBackoffMs,
      maxBackoffMs: DEFAULT_BENCHMARK_CONFIG.maxBackoffMs,
    }),
    new TransientErrorStrategy({
      maxRetries: DEFAULT_BENCHMARK_CONFIG.maxTransientRetries,
      delayMs: DEFAULT_BENCHMARK_CONFIG.transientDelayMs,
    }),
  ]);

  const engine = new BenchmarkEngineService(httpClient, retryPolicy, DEFAULT_BENCHMARK_CONFIG);
  const renderer = new DiffRenderer(output);
  const inputController = new InputController(inputStream);

  const tui = new TuiController({
    output,
    renderer,
    lifecycle,
    input: inputController,
    engine,
    urlValidator,
    i18n,
  });

  const cliParser = new CliParserService(i18n.getAvailableLocales());

  const app = new ApplicationService({
    i18n,
    urlValidator,
    configLoader,
    engine,
    tui,
    output,
    cliParser,
  });

  try {
    const exitCode = await app.run(process.argv.slice(2), (debug) => {
      errorBoundary.setDebugMode(debug);
    });
    process.exitCode = exitCode;
  } catch (error: unknown) {
    errorBoundary.handleFatal(error);
  }
}

void bootstrap();
