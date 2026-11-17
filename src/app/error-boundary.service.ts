import type { ITranslator } from '../i18n/i18n.types';
import type { ITerminalLifecycle } from '../tui/tui.types';
import { DomainError } from './app.errors';

/**
 * POSIX exit code used when converting an unexpected unknown error into `INTERNAL_ERROR`.
 * Код завершения процесса при преобразовании непредвиденной ошибки в `INTERNAL_ERROR`.
 */
const INTERNAL_ERROR_EXIT_CODE = 1;

/**
 * Minimal stream contract for writing formatted fatal errors to stderr.
 * Минимальный контракт потока вывода для записи критических ошибок в stderr.
 */
export interface IErrorOutputStream {
  /**
   * Writes a formatted error message chunk to the error stream.
   * Записывает отформатированный фрагмент сообщения об ошибке в поток ошибок.
   *
   * @param chunk - String output chunk / Строка для записи.
   * @returns `true` if stream buffer can accept more data / `true`, если буфер потока готов.
   */
  write(chunk: string): boolean;
}

/**
 * Dependencies injected into `GlobalErrorBoundaryService`.
 * Зависимости, внедряемые в сервис глобального перехвата ошибок `GlobalErrorBoundaryService`.
 */
export interface GlobalErrorBoundaryDependencies {
  /**
   * Error output stream (typically `process.stderr`).
   * Поток вывода ошибок (обычно `process.stderr`).
   */
  readonly stderr: IErrorOutputStream;

  /**
   * Read-only localization translator for rendering user-friendly error messages.
   * Сервис переводов для форматирования человекочитаемых сообщений об ошибках.
   */
  readonly i18n: ITranslator;

  /**
   * Terminal lifecycle manager used to restore cursor/screen before printing fatal errors.
   * Менеджер жизненного цикла терминала для восстановления курсора и экрана перед выводом ошибки.
   */
  readonly lifecycle: ITerminalLifecycle;

  /**
   * Optional process termination callback (defaults to `process.exit`).
   * Необязательная функция завершения процесса (по умолчанию `process.exit`).
   */
  readonly exitFn?: (code: number) => never;
}

/**
 * Global Error Boundary ensuring no unhandled exception leaks a raw stack trace
 * to the terminal (unless `--debug` is explicitly enabled), restoring terminal state
 * and exiting with a deterministic exit code.
 *
 * Глобальная граница перехвата ошибок (Global Error Boundary): гарантирует отсутствие
 * утечки сырых stack trace в терминал (если не задан флаг `--debug`), восстанавливает
 * состояние TTY и завершает процесс с детерминированным кодом возврата.
 */
export class GlobalErrorBoundaryService {
  private readonly stderr: IErrorOutputStream;
  private readonly i18n: ITranslator;
  private readonly lifecycle: ITerminalLifecycle;
  private readonly exitFn: (code: number) => never;
  private debugMode = false;

  /**
   * Creates a global error boundary with injected stderr, translator, and terminal lifecycle.
   * Создает глобальный перехватчик ошибок с внедренными stderr, переводчиком и жизненным циклом TTY.
   *
   * @param deps - Injected error boundary dependencies / Внедряемые зависимости.
   */
  public constructor(deps: GlobalErrorBoundaryDependencies) {
    this.stderr = deps.stderr;
    this.i18n = deps.i18n;
    this.lifecycle = deps.lifecycle;
    this.exitFn = deps.exitFn ?? ((code: number) => process.exit(code));
  }

  /**
   * Enables or disables raw stack trace output on fatal failures (`--debug`).
   * Включает или отключает вывод полного stack trace при критических сбоях (`--debug`).
   *
   * @param enabled - Whether `--debug` mode is active / Активен ли режим `--debug`.
   */
  public setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Attaches process-level `uncaughtException` and `unhandledRejection` safety handlers.
   * Регистрирует глобальные обработчики `uncaughtException` и `unhandledRejection` на уровне процесса.
   */
  public registerProcessHandlers(): void {
    process.on('uncaughtException', (error: Error) => {
      this.handleFatal(error);
    });

    process.on('unhandledRejection', (reason: unknown) => {
      this.handleFatal(reason);
    });
  }

  /**
   * Converts any thrown value into a localized `DomainError`.
   * Преобразует любое перехваченное значение в структурированный `DomainError`.
   *
   * @param error - Unknown thrown error or rejection reason / Неизвестная ошибка или причина отклонения промиса.
   * @returns Normalized `DomainError` / Нормализованная доменная ошибка.
   */
  public toDomainError(error: unknown): DomainError {
    if (error instanceof DomainError) {
      return error;
    }

    const details = error instanceof Error ? error.message : String(error);
    return new DomainError({
      code: 'INTERNAL_ERROR',
      i18nKey: 'error.unexpected',
      i18nParams: { details },
      exitCode: INTERNAL_ERROR_EXIT_CODE,
      cause: error,
    });
  }

  /**
   * Restores TTY state, prints a localized error message without leaking raw stack traces
   * unless `--debug` is active, and terminates via `exitFn`.
   *
   * Восстанавливает состояние TTY, печатает локализованное сообщение об ошибке без сырого stack trace
   * (если не включен `--debug`) и завершает работу через `exitFn`.
   *
   * @param error - Unhandled error or rejection / Необработанная ошибка.
   * @returns Never returns / Завершает выполнение процесса.
   */
  public handleFatal(error: unknown): never {
    this.lifecycle.exitTuiMode();

    const domainError = this.toDomainError(error);
    const localizedMessage = this.i18n.t(domainError.i18nKey, domainError.i18nParams); // Локализованный текст доменной ошибки по ключу domainError.i18nKey
    const prefix = this.i18n.t('error.fatalPrefix'); // «Ошибка»

    this.stderr.write(`\n${prefix} [${domainError.code}]: ${localizedMessage}\n`);

    if (this.debugMode) {
      const stack = this.extractStack(error);
      if (stack !== undefined) {
        const debugHeader = this.i18n.t('error.debugStackHeader'); // «Трассировка стека (--debug):»
        this.stderr.write(`\n${debugHeader}\n${stack}\n`);
      }
    }

    return this.exitFn(domainError.exitCode);
  }

  private extractStack(error: unknown): string | undefined {
    if (error instanceof Error) {
      if (error.cause instanceof Error && error.cause.stack !== undefined) {
        return error.cause.stack;
      }
      return error.stack;
    }
    return undefined;
  }
}
