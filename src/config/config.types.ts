/**
 * Predefined benchmark target loaded from an external JSON presets file.
 * Предустановленная цель замера, загружаемая из внешнего JSON-файла конфигурации.
 */
export interface PresetTarget {
  /**
   * Human-readable display title shown in the interactive TUI menu.
   * Человекочитаемое название пресета, отображаемое в интерактивном меню TUI.
   */
  readonly name: string;

  /**
   * Normalized HTTP or HTTPS download target URL string.
   * Нормализованный строковый HTTP или HTTPS URL целевого ресурса.
   */
  readonly url: string;
}

/**
 * Reason codes explaining why a user-supplied URL failed validation.
 * Коды причин, объясняющие, почему переданный URL не прошел валидацию.
 */
export type UrlValidationReason = 'empty' | 'invalid_format' | 'unsupported_protocol';

/**
 * Discriminated union representing the outcome of URL validation.
 * Размеченное объединение (discriminated union), описывающее результат проверки URL.
 */
export type UrlValidationResult =
  | {
      /** Validation succeeded / Проверка пройдена успешно */
      readonly valid: true;
      /** Parsed and normalized `URL` instance / Разобранный и нормализованный объект `URL` */
      readonly normalizedUrl: URL;
    }
  | {
      /** Validation failed / Проверка завершилась ошибкой */
      readonly valid: false;
      /** Structured failure reason / Структурированный код причины ошибки */
      readonly reason: UrlValidationReason;
    };

/**
 * Contract for validating HTTP(S) target URLs.
 * Контракт валидатора целевых HTTP(S) URL.
 */
export interface IUrlValidator {
  /**
   * Validates a raw URL string without throwing exceptions.
   * Проверяет строку URL без выбрасывания исключений.
   *
   * @param rawUrl - Raw URL input string / Исходная строка URL.
   * @returns Validation outcome containing normalized `URL` or reason / Результат валидации с `URL` или причиной отказа.
   */
  validate(rawUrl: string): UrlValidationResult;

  /**
   * Validates a raw URL string and throws a localized `DomainError` when invalid.
   * Проверяет строку URL и выбрасывает локализованную ошибку `DomainError` при некорректном значении.
   *
   * @param rawUrl - Raw URL input string / Исходная строка URL.
   * @returns Normalized `URL` object / Нормализованный объект `URL`.
   * @throws {DomainError} When empty, malformed, or unsupported protocol / При пустом значении, неверном формате или неподдерживаемом протоколе.
   */
  validateOrThrow(rawUrl: string): URL;
}

/**
 * Abstraction for asynchronous file reading used for dependency injection in tests.
 * Абстракция асинхронного чтения файлов для удобного тестирования через DI.
 *
 * @param path - Filesystem path to read / Путь к файлу на диске.
 * @param encoding - Text encoding (e.g. `'utf-8'`) / Кодировка текста (например, `'utf-8'`).
 * @returns File contents as a string / Содержимое файла в виде строки.
 */
export type FileReaderFn = (path: string, encoding: BufferEncoding) => Promise<string>;

/**
 * Contract for loading and validating preset benchmark targets from external storage.
 * Контракт загрузчика и валидатора списка пресетов из внешнего источника.
 */
export interface IConfigLoader {
  /**
   * Reads and validates preset targets from the specified configuration file path.
   * Читает и валидирует список пресетов из указанного файла конфигурации.
   *
   * @param filePath - Path to presets JSON file / Путь к JSON-файлу пресетов.
   * @returns Array of validated `PresetTarget` items / Массив провалидированных пресетов.
   */
  loadPresets(filePath: string): Promise<readonly PresetTarget[]>;
}
