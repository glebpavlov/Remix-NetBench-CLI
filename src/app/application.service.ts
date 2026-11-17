import type { IConfigLoader, IUrlValidator } from '../config/config.types';
import { METRICS_CONSTANTS } from '../core/benchmark.constants';
import type { BenchmarkEvent, IBenchmarkEngine } from '../core/core.types';
import type { II18nService } from '../i18n/i18n.types';
import type { ITerminalOutputStream, ITuiController } from '../tui/tui.types';
import { formatPlainTextSummary } from '../tui/views/tui.views';
import { DomainError } from './app.errors';
import { CLI_TOKENS } from './cli-flags.constants';
import { CliParserService } from './cli-parser.service';
import type { ICliParser } from './cli.types';

/**
 * Constructor dependencies injected into `ApplicationService`.
 * Зависимости, внедряемые в конструктор оркестратора `ApplicationService`.
 */
export interface ApplicationDependencies {
  /**
   * Internationalization service managing active UI locale.
   * Сервис интернационализации для управления активным языком.
   */
  readonly i18n: II18nService;

  /**
   * URL validator service checking protocol and syntax.
   * Сервис валидации целевых URL.
   */
  readonly urlValidator: IUrlValidator;

  /**
   * Presets configuration loader service.
   * Сервис загрузки конфигурации пресетов.
   */
  readonly configLoader: IConfigLoader;

  /**
   * Core benchmark execution engine.
   * Основной движок замера пропускной способности.
   */
  readonly engine: IBenchmarkEngine;

  /**
   * Interactive terminal UI controller abstraction.
   * Абстракция интерактивного контроллера TUI.
   */
  readonly tui: ITuiController;

  /**
   * Terminal output stream abstraction (`isTTY`, `write`).
   * Абстракция выходного потока терминала (`isTTY`, `write`).
   */
  readonly output: ITerminalOutputStream;

  /**
   * Optional CLI argument parser abstraction (defaults to `CliParserService`).
   * Необязательный парсер аргументов CLI (по умолчанию `CliParserService`).
   */
  readonly cliParser?: ICliParser;
}

/**
 * Top-level application orchestrator routing execution between `--help`,
 * direct URL benchmarking (TTY or headless), and the interactive TUI fallback menu.
 *
 * Главный оркестратор приложения: маршрутизирует выполнение между `--help`,
 * прямым замером по URL (TTY или headless-режим) и интерактивным меню TUI.
 */
export class ApplicationService {
  private readonly i18n: II18nService;
  private readonly urlValidator: IUrlValidator;
  private readonly configLoader: IConfigLoader;
  private readonly engine: IBenchmarkEngine;
  private readonly tui: ITuiController;
  private readonly output: ITerminalOutputStream;
  private readonly cliParser: ICliParser;

  /**
   * Constructs the application orchestrator with all required dependencies.
   * Создает экземпляр оркестратора приложения со всеми внедренными зависимостями.
   *
   * @param deps - Application services and I/O abstractions / Сервисы и абстракции ввода-вывода.
   */
  public constructor(deps: ApplicationDependencies) {
    this.i18n = deps.i18n;
    this.urlValidator = deps.urlValidator;
    this.configLoader = deps.configLoader;
    this.engine = deps.engine;
    this.tui = deps.tui;
    this.output = deps.output;
    this.cliParser = deps.cliParser ?? new CliParserService(deps.i18n.getAvailableLocales());
  }

  /**
   * Executes the CLI lifecycle for the given `argv` arguments.
   * Запускает жизненный цикл CLI-утилиты для переданных аргументов `argv`.
   *
   * @param argv - Raw CLI arguments (excluding `node` and script path) / Аргументы командной строки.
   * @param onDebugResolved - Optional callback notified once `--debug` flag is parsed / Callback уведомления о флаге `--debug`.
   * @returns Deterministic POSIX exit code (`0` on success) / Код завершения процесса (`0` при успехе).
   */
  public async run(
    argv: readonly string[],
    onDebugResolved?: (debug: boolean) => void,
  ): Promise<number> {
    const options = this.cliParser.parse(argv);
    this.i18n.setLocale(options.locale);
    onDebugResolved?.(options.debug);

    if (options.help) {
      this.output.write(`${this.i18n.t('cli.helpText')}\n`); // «Использование: netbench [url] [опции] ...»
      return 0;
    }

    if (options.targetUrl !== undefined) {
      const targetUrl = this.urlValidator.validateOrThrow(options.targetUrl);
      if (this.output.isTTY) {
        const summary = await this.tui.runDirectBenchmark(targetUrl);
        this.output.write(`${formatPlainTextSummary(summary, this.i18n)}\n`);
        return 0;
      }
      return this.runHeadlessBenchmark(targetUrl);
    }

    if (!this.output.isTTY) {
      throw new DomainError({
        code: 'INVALID_CLI_ARGS',
        i18nKey: 'cli.nonInteractiveNoUrl',
        exitCode: CLI_TOKENS.INVALID_ARGS_EXIT_CODE,
      });
    }

    const presets = await this.configLoader.loadPresets(options.configPath);
    await this.tui.runInteractiveMenu(presets);
    return 0;
  }

  private async runHeadlessBenchmark(targetUrl: URL): Promise<number> {
    const controller = new AbortController();
    const onSigint = (): void => {
      controller.abort();
    };
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigint);

    const unsubscribe = this.engine.subscribe((event) => {
      this.handleHeadlessEvent(event);
    });

    try {
      const summary = await this.engine.run(targetUrl, controller.signal);
      this.output.write(`\n${formatPlainTextSummary(summary, this.i18n)}\n`);
      return 0;
    } finally {
      unsubscribe();
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigint);
    }
  }

  private handleHeadlessEvent(event: BenchmarkEvent): void {
    if (event.type === 'iteration-completed') {
      const { metric } = event;
      const mbpsUnit = this.i18n.t('unit.mbps'); // «Mbps»
      const mbSecUnit = this.i18n.t('unit.mbPerSec'); // «MB/s»
      this.output.write(
        `[${metric.index}] ${metric.speedMbps.toFixed(2)} ${mbpsUnit} (${metric.speedMBps.toFixed(2)} ${mbSecUnit})\n`,
      );
      return;
    }

    if (event.type === 'retry-scheduled') {
      const reason = this.i18n.t(event.decision.reasonKey, event.decision.reasonParams); // Локализованная причина повтора (например, «HTTP 429 Слишком много запросов»)
      const retryMessage = this.i18n.t('benchmark.retryingStatus', {
        attempt: event.attempt,
        max: event.maxAttempts,
        delaySec: (event.decision.delayMs / METRICS_CONSTANTS.MS_PER_SECOND).toFixed(1),
        reason,
      }); // «Повтор {{attempt}}/{{max}} через {{delaySec}}с ({{reason}})»
      this.output.write(`${retryMessage}\n`);
    }
  }
}
