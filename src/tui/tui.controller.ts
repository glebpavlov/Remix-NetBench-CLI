import { performance } from 'node:perf_hooks';
import { DomainError } from '../app/app.errors';
import type { IUrlValidator, PresetTarget } from '../config/config.types';
import { METRICS_CONSTANTS } from '../core/benchmark.constants';
import type {
  BenchmarkEvent,
  BenchmarkSummary,
  IBenchmarkEngine,
  IterationMetric,
} from '../core/core.types';
import { computeBenchmarkSummary } from '../core/metrics.calculator';
import type { II18nService, TranslationKey, TranslationParams } from '../i18n/i18n.types';
import { TUI_LAYOUT } from './tui-layout.constants';
import type {
  BenchmarkViewState,
  IDiffRenderer,
  IInputController,
  ITerminalLifecycle,
  ITerminalOutputStream,
  ITuiController,
  KeyEvent,
  MenuEntry,
} from './tui.types';
import {
  buildBenchmarkFrame,
  buildCustomUrlFrame,
  buildErrorFrame,
  buildMenuFrame,
  buildSummaryFrame,
} from './views/tui.views';

/**
 * Discriminated union representing the currently visible interactive TUI screen.
 * Размеченное объединение, описывающее активный экран интерактивного TUI.
 */
type ActiveScreen =
  | { readonly kind: 'menu'; selectedIndex: number }
  | { readonly kind: 'custom-url'; inputValue: string; validationError?: string | undefined }
  | { readonly kind: 'benchmark'; state: BenchmarkViewState }
  | { readonly kind: 'summary'; readonly summary: BenchmarkSummary; readonly targetUrl: URL }
  | { readonly kind: 'error'; readonly message: string; readonly targetUrl: string };

/**
 * Constructor dependencies injected into `TuiController`.
 * Зависимости, внедряемые в конструктор `TuiController`.
 */
export interface TuiControllerDependencies {
  /**
   * Terminal output stream abstraction providing dimensions and TTY flag.
   * Абстракция выходного потока терминала с размерами и признаком TTY.
   */
  readonly output: ITerminalOutputStream;

  /**
   * Differential frame renderer flushing minimal ANSI updates.
   * Дифференциальный рендерер кадров без мерцания.
   */
  readonly renderer: IDiffRenderer;

  /**
   * Terminal alternate-screen and signal lifecycle manager.
   * Менеджер альтернативного буфера экрана, курсора и сигналов прерывания.
   */
  readonly lifecycle: ITerminalLifecycle;

  /**
   * Keyboard input controller decoding raw terminal keystrokes.
   * Контроллер клавиатурного ввода в raw-режиме.
   */
  readonly input: IInputController;

  /**
   * Core benchmark execution engine.
   * Движок выполнения замера пропускной способности.
   */
  readonly engine: IBenchmarkEngine;

  /**
   * URL validator service for custom target validation.
   * Сервис валидации пользовательских URL.
   */
  readonly urlValidator: IUrlValidator;

  /**
   * Internationalization service supporting dynamic locale cycling.
   * Сервис интернационализации с поддержкой переключения локалей.
   */
  readonly i18n: II18nService;
}

/**
 * Coordinates the interactive zero-flicker TUI state machine, keyboard navigation,
 * terminal resize redraws, benchmark execution, and clean lifecycle shutdown.
 *
 * Координирует конечный автомат интерактивного TUI без мерцания, навигацию с клавиатуры,
 * перерисовку при изменении размера окна, запуск замера и корректное восстановление терминала.
 */
export class TuiController implements ITuiController {
  private readonly output: ITerminalOutputStream;
  private readonly renderer: IDiffRenderer;
  private readonly lifecycle: ITerminalLifecycle;
  private readonly input: IInputController;
  private readonly engine: IBenchmarkEngine;
  private readonly urlValidator: IUrlValidator;
  private readonly i18n: II18nService;

  private presets: readonly PresetTarget[] = [];
  private screen: ActiveScreen = { kind: 'menu', selectedIndex: 0 };
  private activeBenchmarkAbort: AbortController | null = null;
  private spinnerTimer: NodeJS.Timeout | null = null;
  private resolveLoop: (() => void) | null = null;
  private singleRunMode = false;

  /**
   * Creates an interactive TUI controller with injected dependencies.
   * Создает интерактивный контроллер TUI с внедренными зависимостями.
   *
   * @param deps - Terminal, engine, validator, and i18n dependencies / Внедряемые зависимости TUI.
   */
  public constructor(deps: TuiControllerDependencies) {
    this.output = deps.output;
    this.renderer = deps.renderer;
    this.lifecycle = deps.lifecycle;
    this.input = deps.input;
    this.engine = deps.engine;
    this.urlValidator = deps.urlValidator;
    this.i18n = deps.i18n;
  }

  /**
   * Launches the interactive fallback menu loop until the user exits.
   * Запускает интерактивное меню выбора цели до выхода пользователя.
   *
   * @param presets - Validated preset targets loaded from configuration / Список пресетов из конфига.
   * @returns Promise resolving when the user exits TUI / Промис, завершающийся при выходе из меню.
   */
  public async runInteractiveMenu(presets: readonly PresetTarget[]): Promise<void> {
    this.presets = presets;
    this.singleRunMode = false;
    this.screen = { kind: 'menu', selectedIndex: 0 };

    await this.runTuiSession(
      () =>
        new Promise<void>((resolve) => {
          this.resolveLoop = resolve;
          this.renderCurrentScreen();
        }),
    );
  }

  /**
   * Runs a single benchmark directly in TTY TUI mode (when URL was passed via CLI arguments),
   * returning the resulting summary once complete.
   *
   * Выполняет одиночный замер напрямую в TTY-режиме TUI (когда URL передан в аргументах CLI),
   * возвращая итоговую сводку после завершения.
   *
   * @param targetUrl - Validated HTTP(S) target URL / Проверенный целевой URL.
   * @returns Aggregated `BenchmarkSummary` / Итоговая сводка замера.
   * @throws {DomainError} With code `ABORTED` if interrupted before completion / При прерывании до завершения.
   */
  public async runDirectBenchmark(targetUrl: URL): Promise<BenchmarkSummary> {
    this.presets = [];
    this.singleRunMode = true;

    const summary = await this.runTuiSession(() => this.startBenchmark(targetUrl));
    if (summary === undefined) {
      throw new DomainError({
        code: 'ABORTED',
        i18nKey: 'error.aborted',
        exitCode: 130,
      });
    }

    return summary;
  }

  private async runTuiSession<T>(executor: () => Promise<T>): Promise<T> {
    this.lifecycle.enterTuiMode();

    const unsubResize = this.lifecycle.onResize(() => {
      this.renderer.invalidate();
      this.renderCurrentScreen();
    });

    const unsubInterrupt = this.lifecycle.onInterrupt(() => {
      this.activeBenchmarkAbort?.abort();
      this.finishLoop();
    });

    this.input.start((keyEvent) => {
      this.handleKey(keyEvent);
    });

    try {
      return await executor();
    } finally {
      this.stopSpinner();
      this.activeBenchmarkAbort?.abort();
      this.activeBenchmarkAbort = null;
      this.input.stop();
      unsubResize();
      unsubInterrupt();
      this.renderer.dispose();
      this.lifecycle.exitTuiMode();
      this.resolveLoop = null;
    }
  }

  private finishLoop(): void {
    if (this.resolveLoop !== null) {
      const done = this.resolveLoop;
      this.resolveLoop = null;
      done();
    }
  }

  private getMenuEntries(): MenuEntry[] {
    return [
      ...this.presets.map((preset): MenuEntry => ({ kind: 'preset', preset })),
      { kind: 'custom-url' },
      { kind: 'toggle-language' },
      { kind: 'exit' },
    ];
  }

  private handleKey(event: KeyEvent): void {
    if (event.type === 'ctrl-c') {
      this.activeBenchmarkAbort?.abort();
      this.finishLoop();
      return;
    }

    switch (this.screen.kind) {
      case 'menu':
        this.handleMenuKey(event);
        break;
      case 'custom-url':
        this.handleCustomUrlKey(event);
        break;
      case 'benchmark':
        this.handleBenchmarkKey(event);
        break;
      case 'summary':
        this.handleSummaryKey(event);
        break;
      case 'error':
        this.handleErrorKey(event);
        break;
    }
  }

  private handleMenuKey(event: KeyEvent): void {
    if (this.screen.kind !== 'menu') {
      return;
    }

    const entries = this.getMenuEntries();
    if (entries.length === 0) {
      return;
    }

    if (event.type === 'up') {
      this.screen.selectedIndex = (this.screen.selectedIndex - 1 + entries.length) % entries.length;
      this.renderCurrentScreen();
      return;
    }

    if (event.type === 'down') {
      this.screen.selectedIndex = (this.screen.selectedIndex + 1) % entries.length;
      this.renderCurrentScreen();
      return;
    }

    if (this.isQuitChar(event)) {
      this.finishLoop();
      return;
    }

    if (event.type === 'enter') {
      const selected = entries[this.screen.selectedIndex];
      if (selected !== undefined) {
        this.executeMenuSelection(selected);
      }
    }
  }

  private executeMenuSelection(selected: MenuEntry): void {
    switch (selected.kind) {
      case 'preset': {
        const parsedUrl = this.urlValidator.validateOrThrow(selected.preset.url);
        void this.startBenchmark(parsedUrl);
        break;
      }
      case 'custom-url':
        this.screen = { kind: 'custom-url', inputValue: '' };
        this.renderCurrentScreen();
        break;
      case 'toggle-language':
        // OCP: cycles across any registered locales instead of hardcoding 'ru' <-> 'en'.
        // OCP: циклически переключает любые зарегистрированные локали без хардкода 'ru' <-> 'en'.
        this.i18n.cycleLocale();
        this.renderCurrentScreen();
        break;
      case 'exit':
        this.finishLoop();
        break;
    }
  }

  private handleCustomUrlKey(event: KeyEvent): void {
    if (this.screen.kind !== 'custom-url') {
      return;
    }

    if (event.type === 'escape') {
      this.screen = { kind: 'menu', selectedIndex: 0 };
      this.renderCurrentScreen();
      return;
    }

    if (event.type === 'backspace') {
      this.screen.inputValue = this.screen.inputValue.slice(0, -1);
      this.screen.validationError = undefined;
      this.renderCurrentScreen();
      return;
    }

    if (event.type === 'char') {
      this.screen.inputValue += event.value;
      this.screen.validationError = undefined;
      this.renderCurrentScreen();
      return;
    }

    if (event.type === 'enter') {
      this.submitCustomUrl(this.screen.inputValue);
    }
  }

  private submitCustomUrl(rawUrl: string): void {
    if (this.screen.kind !== 'custom-url') {
      return;
    }

    const validation = this.urlValidator.validate(rawUrl);
    if (!validation.valid) {
      this.screen.validationError = this.resolveUrlValidationError(validation.reason);
      this.renderCurrentScreen();
      return;
    }

    void this.startBenchmark(validation.normalizedUrl);
  }

  private resolveUrlValidationError(
    reason: 'empty' | 'invalid_format' | 'unsupported_protocol',
  ): string {
    switch (reason) {
      case 'empty':
        return this.i18n.t('error.invalidUrl.empty'); // «URL не может быть пустым.»
      case 'unsupported_protocol':
        return this.i18n.t('error.invalidUrl.protocol'); // «Поддерживаются только протоколы http:// и https://.»
      case 'invalid_format':
        return this.i18n.t('error.invalidUrl.format'); // «Некорректный формат URL.»
    }
  }

  private handleBenchmarkKey(event: KeyEvent): void {
    if (this.screen.kind !== 'benchmark') {
      return;
    }

    if (event.type === 'escape' || this.isQuitChar(event)) {
      this.screen = {
        kind: 'benchmark',
        state: {
          ...this.screen.state,
          aborting: true,
        },
      };
      this.renderCurrentScreen();
      this.activeBenchmarkAbort?.abort();
    }
  }

  private handleSummaryKey(event: KeyEvent): void {
    if (this.screen.kind !== 'summary') {
      return;
    }

    if (this.isQuitChar(event)) {
      this.finishLoop();
      return;
    }

    if (event.type === 'char' && (event.value === 'r' || event.value === 'R')) {
      void this.startBenchmark(this.screen.targetUrl);
      return;
    }

    if (
      event.type === 'enter' ||
      event.type === 'escape' ||
      (event.type === 'char' && (event.value === 'b' || event.value === 'B'))
    ) {
      this.screen = { kind: 'menu', selectedIndex: 0 };
      this.renderCurrentScreen();
    }
  }

  private handleErrorKey(event: KeyEvent): void {
    if (this.isQuitChar(event)) {
      this.finishLoop();
      return;
    }

    if (event.type === 'enter' || event.type === 'escape') {
      this.screen = { kind: 'menu', selectedIndex: 0 };
      this.renderCurrentScreen();
    }
  }

  private isQuitChar(event: KeyEvent): boolean {
    return event.type === 'char' && (event.value === 'q' || event.value === 'Q');
  }

  private async startBenchmark(targetUrl: URL): Promise<BenchmarkSummary | undefined> {
    const abortController = new AbortController();
    this.activeBenchmarkAbort = abortController;
    const benchmarkStartMs = performance.now();

    let state = this.createInitialBenchmarkState(targetUrl);
    this.screen = { kind: 'benchmark', state };
    this.renderCurrentScreen();

    this.startSpinner(() => {
      if (this.screen.kind !== 'benchmark') {
        return;
      }
      state = {
        ...state,
        spinnerFrameIndex: state.spinnerFrameIndex + 1,
        elapsedMs: performance.now() - benchmarkStartMs,
      };
      this.screen = { kind: 'benchmark', state };
      this.renderCurrentScreen();
    });

    const unsubscribe = this.engine.subscribe((event) => {
      state = this.applyBenchmarkEvent(state, event, benchmarkStartMs);
      if (this.screen.kind === 'benchmark') {
        this.screen = { kind: 'benchmark', state };
        this.renderCurrentScreen();
      }
    });

    return this.executeBenchmarkWithCleanup(targetUrl, abortController, unsubscribe);
  }

  private createInitialBenchmarkState(targetUrl: URL): BenchmarkViewState {
    return {
      targetUrl: targetUrl.toString(),
      currentIteration: 1,
      totalIterations: this.engine.totalIterations,
      spinnerFrameIndex: 0,
      currentIterationBytes: 0,
      totalDownloadedBytes: 0,
      elapsedMs: 0,
      instantSpeedMbps: 0,
      instantSpeedMBps: 0,
      runningAvgMbps: 0,
      runningAvgMBps: 0,
      completedMetrics: [],
      aborting: false,
    };
  }

  private applyBenchmarkEvent(
    state: BenchmarkViewState,
    event: BenchmarkEvent,
    benchmarkStartMs: number,
  ): BenchmarkViewState {
    switch (event.type) {
      case 'started':
        return { ...state, totalIterations: event.totalIterations };
      case 'iteration-started':
        return {
          ...state,
          currentIteration: event.iteration,
          totalIterations: event.totalIterations,
          currentIterationBytes: 0,
          retryBanner: undefined,
        };
      case 'chunk-received':
        return {
          ...state,
          currentIteration: event.iteration,
          currentIterationBytes: event.bytesInIteration,
          instantSpeedMbps: event.instantSpeedMbps,
          instantSpeedMBps: event.instantSpeedMBps,
          elapsedMs: performance.now() - benchmarkStartMs,
          retryBanner: undefined,
        };
      case 'retry-scheduled':
        return {
          ...state,
          retryBanner: this.formatRetryBanner(
            event.attempt,
            event.maxAttempts,
            event.decision.delayMs,
            event.decision.reasonKey,
            event.decision.reasonParams,
          ),
        };
      case 'iteration-completed': {
        const nextMetrics: IterationMetric[] = [...state.completedMetrics, event.metric];
        const partialSummary = computeBenchmarkSummary(
          state.targetUrl,
          state.totalIterations,
          nextMetrics,
        );
        return {
          ...state,
          completedMetrics: nextMetrics,
          totalDownloadedBytes: partialSummary.totalBytes,
          currentIterationBytes: 0,
          runningAvgMbps: partialSummary.averageSpeedMbps,
          runningAvgMBps: partialSummary.averageSpeedMBps,
          retryBanner: undefined,
        };
      }
      case 'completed':
      case 'failed':
      case 'aborted':
        return state;
    }
  }

  private formatRetryBanner(
    attempt: number,
    maxAttempts: number,
    delayMs: number,
    reasonKey: TranslationKey,
    reasonParams?: TranslationParams,
  ): string {
    const reason = this.i18n.t(reasonKey, reasonParams); // Локализованная причина повтора (например, «HTTP 429 Слишком много запросов»)
    return this.i18n.t('benchmark.retryingStatus', {
      attempt,
      max: maxAttempts,
      delaySec: (delayMs / METRICS_CONSTANTS.MS_PER_SECOND).toFixed(1),
      reason,
    }); // «Повтор {{attempt}}/{{max}} через {{delaySec}}с ({{reason}})»
  }

  private async executeBenchmarkWithCleanup(
    targetUrl: URL,
    abortController: AbortController,
    unsubscribe: () => void,
  ): Promise<BenchmarkSummary | undefined> {
    try {
      const summary = await this.engine.run(targetUrl, abortController.signal);
      if (this.singleRunMode) {
        return summary;
      }

      this.screen = { kind: 'summary', summary, targetUrl };
      this.renderCurrentScreen();
      return summary;
    } catch (error: unknown) {
      if (this.singleRunMode) {
        throw error;
      }

      if (error instanceof DomainError && error.code === 'ABORTED') {
        this.screen = { kind: 'menu', selectedIndex: 0 };
        this.renderCurrentScreen();
        return undefined;
      }

      this.screen = {
        kind: 'error',
        message: this.translateError(error),
        targetUrl: targetUrl.toString(),
      };
      this.renderCurrentScreen();
      return undefined;
    } finally {
      unsubscribe();
      this.stopSpinner();
      if (this.activeBenchmarkAbort === abortController) {
        this.activeBenchmarkAbort = null;
      }
    }
  }

  private startSpinner(onTick: () => void): void {
    this.stopSpinner();
    this.spinnerTimer = setInterval(onTick, TUI_LAYOUT.BENCHMARK.SPINNER_INTERVAL_MS);
  }

  private stopSpinner(): void {
    if (this.spinnerTimer !== null) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = null;
    }
  }

  private renderCurrentScreen(): void {
    const width = this.output.columns;
    const height = this.output.rows;

    switch (this.screen.kind) {
      case 'menu':
        this.renderer.render(
          buildMenuFrame(
            width,
            height,
            {
              entries: this.getMenuEntries(),
              selectedIndex: this.screen.selectedIndex,
              presetsCount: this.presets.length,
            },
            this.i18n,
          ),
        );
        break;
      case 'custom-url':
        this.renderer.render(
          buildCustomUrlFrame(
            width,
            height,
            {
              inputValue: this.screen.inputValue,
              validationError: this.screen.validationError,
            },
            this.i18n,
          ),
        );
        break;
      case 'benchmark':
        this.renderer.render(buildBenchmarkFrame(width, height, this.screen.state, this.i18n));
        break;
      case 'summary':
        this.renderer.render(
          buildSummaryFrame(width, height, { summary: this.screen.summary }, this.i18n),
        );
        break;
      case 'error':
        this.renderer.render(
          buildErrorFrame(
            width,
            height,
            { message: this.screen.message, targetUrl: this.screen.targetUrl },
            this.i18n,
          ),
        );
        break;
    }
  }

  private translateError(error: unknown): string {
    if (error instanceof DomainError) {
      return this.i18n.t(error.i18nKey, error.i18nParams); // Локализованное сообщение доменной ошибки по ключу error.i18nKey
    }

    const details = error instanceof Error ? error.message : String(error);
    return this.i18n.t('error.unexpected', { details }); // «Непредвиденная ошибка приложения: {{details}}»
  }
}
