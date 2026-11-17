/**
 * Built-in UI locale codes represented as a string enum.
 * New built-in locales can be added here, while `LocaleCode` also accepts any custom string.
 *
 * Встроенные коды локалей интерфейса, представленные в виде строкового enum.
 * Сюда можно добавлять новые встроенные локали, при этом тип `LocaleCode` также принимает любую строку.
 */
export enum Locale {
  /** Russian language / Русский язык */
  RU = 'ru',
  /** English language / Английский язык */
  EN = 'en',
}

/**
 * Extensible locale identifier type: preserves autocomplete for `Locale` enum values
 * while allowing arbitrary custom locale strings (e.g., `'de'`, `'fr'`, `'es'`).
 *
 * Расширяемый тип идентификатора локали: сохраняет автодополнение для значений enum `Locale`,
 * но при этом позволяет передавать любую пользовательскую строку локали (например, `'de'`, `'fr'`, `'es'`).
 */
export type LocaleCode = Locale | (string & {});

/**
 * Key-value map of placeholder substitutions passed into translation templates (`{{key}}`).
 *
 * Словарь подстановок параметров в шаблоны переводов вида `{{key}}`.
 */
export type TranslationParams = Readonly<Record<string, string | number>>;

/**
 * Translation key identifier (open string type for frictionless addition of new screens and texts).
 *
 * Ключ перевода (открытый строковый тип для легкого добавления новых экранов, языков и текстов).
 */
export type TranslationKey = string;

/**
 * Dictionary mapping translation keys to localized template strings.
 *
 * Словарь, сопоставляющий ключи переводов локализованным строкам-шаблонам.
 */
export type TranslationDictionary = Readonly<Record<string, string>>;

/**
 * Registry mapping locale codes to their translation dictionaries.
 *
 * Реестр, связывающий коды локалей с соответствующими словарями переводов.
 */
export type LocaleDictionaryRegistry = Readonly<Record<string, TranslationDictionary>>;

/**
 * Read-only translation lookup contract (ISP: views and formatters only depend on this subset).
 *
 * Контракт только для чтения переводов (принцип разделения интерфейсов ISP:
 * представлениям и форматерам достаточно только поиска переводов без управления локалью).
 */
export interface ITranslator {
  /**
   * Currently active locale identifier.
   * Текущий активный код локали.
   */
  readonly currentLocale: LocaleCode;

  /**
   * Returns all registered locale codes in registration order.
   * Возвращает список всех зарегистрированных кодов локалей в порядке их регистрации.
   *
   * @returns Readonly array of available locale codes / Массив доступных кодов локалей.
   */
  getAvailableLocales(): readonly LocaleCode[];

  /**
   * Resolves a localized template by `key` and substitutes `{{param}}` placeholders if provided.
   * Возвращает локализованную строку по ключу `key` и подставляет параметры `{{param}}`.
   *
   * @param key - Translation key identifier / Ключ перевода.
   * @param params - Optional placeholder values / Необязательные параметры подстановки.
   * @returns Resolved localized string / Итоговая локализованная строка.
   *
   * @example
   * i18n.t('benchmark.iterationStatus', { current: 1, total: 10 });
   */
  t(key: TranslationKey, params?: TranslationParams): string;
}

/**
 * Full internationalization service contract supporting runtime locale switching and registration.
 *
 * Полный контракт сервиса интернационализации с поддержкой смены и динамической регистрации локалей.
 */
export interface II18nService extends ITranslator {
  /**
   * Checks whether a locale code is registered in this service instance.
   * Проверяет, зарегистрирован ли указанный код локали в сервисе.
   *
   * @param locale - Candidate locale string / Проверяемый код локали.
   * @returns `true` if the locale dictionary exists / `true`, если словарь для локали найден.
   */
  hasLocale(locale: string): boolean;

  /**
   * Switches the active UI locale to a registered locale code.
   * Переключает активный язык интерфейса на указанную зарегистрированную локаль.
   *
   * @param locale - Target locale code / Целевой код локали.
   */
  setLocale(locale: LocaleCode): void;

  /**
   * Switches to the next registered locale in circular order and returns it.
   * Переключает локаль на следующую по кругу и возвращает новый активный код локали.
   *
   * @returns Newly activated locale code / Новый активный код локали.
   */
  cycleLocale(): LocaleCode;

  /**
   * Registers or replaces a translation dictionary for any built-in or custom locale at runtime.
   * Регистрирует или обновляет словарь переводов для встроенной или новой пользовательской локали.
   *
   * @param locale - Locale code (enum or custom string) / Код локали (enum или строка).
   * @param dictionary - Key-value translation map / Словарь переводов.
   */
  registerLocale(locale: LocaleCode, dictionary: TranslationDictionary): void;
}
