import type { TranslationKey, TranslationParams } from '../i18n/i18n.types';

/**
 * Categorized application error codes mapped to user-facing i18n messages and process exit codes.
 * Категоризированные коды ошибок приложения, сопоставляемые с локализованными сообщениями и кодами выхода.
 */
export type AppErrorCode =
  | 'INVALID_CLI_ARGS'
  | 'INVALID_URL'
  | 'CONFIG_READ_ERROR'
  | 'CONFIG_VALIDATION_ERROR'
  | 'RATE_LIMITED_EXHAUSTED'
  | 'RESOURCE_UNAVAILABLE'
  | 'ABORTED'
  | 'INTERNAL_ERROR';

/**
 * Serializable metadata required to construct a localized `DomainError`.
 * Сериализуемые метаданные, необходимые для создания локализованного исключения `DomainError`.
 */
export interface DomainErrorOptions {
  /**
   * Machine-readable error category code.
   * Машиночитаемый код категории ошибки.
   */
  readonly code: AppErrorCode;

  /**
   * Translation dictionary key used to render the user-facing message.
   * Ключ словаря переводов для формирования сообщения пользователю.
   */
  readonly i18nKey: TranslationKey;

  /**
   * Optional interpolation parameters for `i18nKey` placeholders.
   * Необязательные параметры подстановки в шаблон `i18nKey`.
   */
  readonly i18nParams?: TranslationParams | undefined;

  /**
   * Deterministic POSIX process exit code returned by the CLI on fatal failure.
   * Детерминированный POSIX-код возврата процесса при критическом завершении.
   */
  readonly exitCode: number;

  /**
   * Optional underlying original error or rejection value preserved for `--debug` stack traces.
   * Необязательная исходная ошибка-причина, сохраняемая для вывода stack trace при `--debug`.
   */
  readonly cause?: unknown;
}

/**
 * Strongly typed application domain error carrying a localization key, parameters, and exit code.
 * Типизированная доменная ошибка приложения, содержащая ключ локализации, параметры и код выхода.
 */
export class DomainError extends Error {
  /**
   * Categorized error code / Категория ошибки.
   */
  public readonly code: AppErrorCode;

  /**
   * Translation key for localized error formatting / Ключ перевода сообщения об ошибке.
   */
  public readonly i18nKey: TranslationKey;

  /**
   * Optional placeholder parameters for the translation template / Параметры шаблона перевода.
   */
  public readonly i18nParams: TranslationParams | undefined;

  /**
   * Process exit code associated with this error / Код завершения процесса для данной ошибки.
   */
  public readonly exitCode: number;

  /**
   * Constructs a new `DomainError` with structured localization metadata.
   * Создает экземпляр `DomainError` со структурированными метаданными локализации.
   *
   * @param options - Error code, translation key, parameters, exit code, and optional cause / Параметры доменной ошибки.
   *
   * @example
   * throw new DomainError({
   *   code: 'INVALID_URL',
   *   i18nKey: 'error.invalidUrl.empty',
   *   exitCode: 2,
   * });
   */
  public constructor(options: DomainErrorOptions) {
    super(options.i18nKey, { cause: options.cause });
    this.name = 'DomainError';
    this.code = options.code;
    this.i18nKey = options.i18nKey;
    this.i18nParams = options.i18nParams;
    this.exitCode = options.exitCode;
  }
}
