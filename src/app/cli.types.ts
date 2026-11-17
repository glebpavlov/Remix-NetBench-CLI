import type { LocaleCode } from '../i18n/i18n.types';

/**
 * Parsed command-line arguments controlling execution mode and options.
 * Разобранные аргументы командной строки, определяющие режим запуска и опции утилиты.
 */
export interface CliOptions {
  /**
   * Optional HTTP(S) target URL provided via `-u/--url` or as a positional argument.
   * Необязательный целевой HTTP(S) URL, переданный через `-u/--url` или позиционным аргументом.
   */
  readonly targetUrl?: string;

  /**
   * Resolved absolute path to the JSON presets file.
   * Разрешенный абсолютный путь к JSON-файлу пресетов.
   */
  readonly configPath: string;

  /**
   * Selected UI locale code (built-in `Locale` enum or custom registered locale string).
   * Выбранный код языка интерфейса (значение enum `Locale` или пользовательская строка локали).
   */
  readonly locale: LocaleCode;

  /**
   * Enables printing full error stack traces when a fatal error occurs.
   * Включает вывод полного stack trace при критических ошибках.
   */
  readonly debug: boolean;

  /**
   * Prints localized CLI usage instructions and exits with code `0`.
   * Выводит локализованную справку по флагам и завершает работу с кодом `0`.
   */
  readonly help: boolean;
}

/**
 * Mutable accumulator state mutated by CLI flag handlers during argument parsing.
 * Изменяемое состояние-аккумулятор, заполняемое обработчиками флагов при разборе argv.
 */
export interface CliParseState {
  /**
   * Working directory used to resolve relative `--config` paths.
   * Рабочая директория для разрешения относительных путей `--config`.
   */
  readonly cwd: string;

  /**
   * List of locale codes accepted by `--lang` (supports dynamic extensibility).
   * Список допустимых кодов локалей для флага `--lang` (поддерживает расширение).
   */
  readonly supportedLocales: readonly LocaleCode[];

  /**
   * Accumulated target URL string, if specified.
   * Накопленный целевой URL (если передан).
   */
  targetUrl: string | undefined;

  /**
   * Accumulated resolved config file path.
   * Разрешенный путь к файлу пресетов.
   */
  configPath: string;

  /**
   * Accumulated UI locale code.
   * Выбранный код локали.
   */
  locale: LocaleCode;

  /**
   * Accumulated debug stack trace flag.
   * Флаг режима отладки `--debug`.
   */
  debug: boolean;

  /**
   * Accumulated help display flag.
   * Флаг показа справки `--help`.
   */
  help: boolean;
}

/**
 * Declarative specification for a single CLI flag (OCP: add new flags without altering parser loop).
 * Декларативное описание одного CLI-флага (OCP: добавление новых флагов без изменения цикла парсера).
 */
export interface CliFlagDefinition {
  /**
   * Optional short flag alias including dash (e.g., `'-u'`).
   * Необязательный короткий псевдоним флага с дефисом (например, `'-u'`).
   */
  readonly short?: string;

  /**
   * Required long flag name including double dash (e.g., `'--url'`).
   * Обязательное длинное имя флага с двойным дефисом (например, `'--url'`).
   */
  readonly long: string;

  /**
   * Whether the flag expects a following value argument (`true` for `--url`, `false` for `--debug`).
   * Требует ли флаг обязательного значения следующим токеном (`true` для `--url`, `false` для `--debug`).
   */
  readonly takesValue: boolean;

  /**
   * Handler mutating `state` when this flag is encountered.
   * Обработчик, обновляющий `state` при обнаружении данного флага.
   *
   * @param state - Mutable parser accumulator / Изменяемое состояние парсера.
   * @param token - Matched flag token (e.g., `'-u'` or `'--url'`) / Распознанный токен флага.
   * @param value - Next argument value when `takesValue` is `true` / Значение флага при `takesValue === true`.
   */
  readonly apply: (state: CliParseState, token: string, value?: string) => void;
}

/**
 * Contract for parsing raw CLI arguments into structured `CliOptions` (DIP).
 * Контракт парсера аргументов командной строки в типизированный объект `CliOptions` (DIP).
 */
export interface ICliParser {
  /**
   * Parses CLI `argv` tokens (excluding `node` and script entry path).
   * Разбирает массив аргументов `argv` (без пути к `node` и скрипту).
   *
   * @param argv - Command-line argument tokens / Аргументы командной строки.
   * @param cwd - Base working directory for relative paths / Базовая рабочая директория.
   * @returns Parsed `CliOptions` / Разобранные настройки запуска.
   */
  parse(argv: readonly string[], cwd?: string): CliOptions;
}
