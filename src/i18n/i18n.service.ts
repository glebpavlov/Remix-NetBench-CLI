import {
  Locale,
  type II18nService,
  type LocaleCode,
  type LocaleDictionaryRegistry,
  type TranslationDictionary,
  type TranslationKey,
  type TranslationParams,
} from './i18n.types';
import { EN_DICTIONARY } from './locales/en.locale';
import { RU_DICTIONARY } from './locales/ru.locale';

/**
 * Creates the default registry of built-in localization dictionaries.
 * Создает реестр встроенных словарей локализации по умолчанию.
 *
 * @returns Dictionary registry keyed by built-in `Locale` values / Реестр словарей по кодам локалей.
 */
export function createDefaultDictionaries(): LocaleDictionaryRegistry {
  return {
    [Locale.RU]: RU_DICTIONARY,
    [Locale.EN]: EN_DICTIONARY,
  };
}

/**
 * Extensible localization service supporting built-in `Locale` enum codes, custom string locales,
 * dynamic dictionary registration, fallback lookup, and `{{param}}` template interpolation.
 *
 * Расширяемый сервис локализации: поддерживает встроенный enum `Locale`, произвольные строковые
 * коды локалей, динамическую регистрацию словарей, fallback-поиск ключей и подстановку `{{param}}`.
 */
export class I18nService implements II18nService {
  private readonly dictionaries = new Map<string, TranslationDictionary>();
  private readonly fallbackLocale: LocaleCode;
  private locale: LocaleCode;

  /**
   * Initializes the localization service with a starting locale and dictionary registry.
   * Инициализирует сервис локализации с начальной локалью и набором словарей.
   *
   * @param initialLocale - Initial UI locale (defaults to `Locale.RU`) / Начальная локаль (по умолчанию `Locale.RU`).
   * @param dictionaries - Optional custom dictionary registry / Необязательный реестр словарей.
   * @param fallbackLocale - Fallback locale used when a key is missing in the active dictionary / Резервная локаль при отсутствии ключа.
   *
   * @example
   * const i18n = new I18nService(Locale.EN);
   * i18n.registerLocale('de', { 'menu.exitItem': 'Beenden' });
   */
  public constructor(
    initialLocale: LocaleCode = Locale.RU,
    dictionaries: LocaleDictionaryRegistry = createDefaultDictionaries(),
    fallbackLocale: LocaleCode = Locale.EN,
  ) {
    for (const [code, dict] of Object.entries(dictionaries)) {
      this.dictionaries.set(this.normalizeCode(code), dict);
    }

    this.fallbackLocale = this.normalizeCode(fallbackLocale);
    const normalizedInitial = this.normalizeCode(initialLocale);

    // Ensure initial locale resolves cleanly; fall back to first available dictionary if needed.
    // Гарантируем валидную начальную локаль; при необходимости выбираем первый доступный словарь.
    if (this.dictionaries.has(normalizedInitial)) {
      this.locale = normalizedInitial;
    } else {
      const firstAvailable = this.dictionaries.keys().next().value;
      this.locale = firstAvailable ?? normalizedInitial;
    }
  }

  /**
   * Returns the currently active locale code.
   * Возвращает текущий активный код локали.
   *
   * @returns Active `LocaleCode` / Активный код локали.
   */
  public get currentLocale(): LocaleCode {
    return this.locale;
  }

  /**
   * Checks whether `locale` is registered in the dictionary map.
   * Проверяет, зарегистрирована ли указанная локаль в словарях сервиса.
   *
   * @param locale - Candidate locale code / Проверяемый код локали.
   * @returns `true` if registered / `true`, если локаль зарегистрирована.
   */
  public hasLocale(locale: string): boolean {
    return this.dictionaries.has(this.normalizeCode(locale));
  }

  /**
   * Returns all registered locale codes in insertion order.
   * Возвращает все зарегистрированные коды локалей в порядке добавления.
   *
   * @returns Readonly list of locale codes / Массив доступных кодов локалей.
   */
  public getAvailableLocales(): readonly LocaleCode[] {
    return Array.from(this.dictionaries.keys());
  }

  /**
   * Updates the active locale if registered; ignores unregistered values safely.
   * Переключает активную локаль, если она зарегистрирована; незарегистрированные значения игнорируются.
   *
   * @param locale - Target locale code / Целевой код локали.
   */
  public setLocale(locale: LocaleCode): void {
    const normalized = this.normalizeCode(locale);
    if (this.dictionaries.has(normalized)) {
      this.locale = normalized;
    }
  }

  /**
   * Advances to the next registered locale in circular order (OCP: works for N locales).
   * Переключает активную локаль на следующую по кругу (OCP: работает для любого числа локалей).
   *
   * @returns New active locale code / Новый активный код локали.
   */
  public cycleLocale(): LocaleCode {
    const available = this.getAvailableLocales();
    if (available.length === 0) {
      return this.locale;
    }
    const currentIndex = available.indexOf(this.locale);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % available.length;
    const nextLocale = available[nextIndex] ?? this.locale;
    this.locale = nextLocale;
    return nextLocale;
  }

  /**
   * Registers or merges a dictionary for a built-in or custom locale code.
   * Регистрирует или обновляет словарь для встроенного или пользовательского кода локали.
   *
   * @param locale - Locale identifier (enum or arbitrary string) / Код локали (enum или произвольная строка).
   * @param dictionary - Translation entries for the locale / Словарь переводов для локали.
   */
  public registerLocale(locale: LocaleCode, dictionary: TranslationDictionary): void {
    const normalized = this.normalizeCode(locale);
    const existing = this.dictionaries.get(normalized);
    this.dictionaries.set(normalized, existing ? { ...existing, ...dictionary } : dictionary);
  }

  /**
   * Resolves a template by key with fallback lookup and substitutes `{{param}}` placeholders.
   * Ищет шаблон по ключу (с резервным обращением к `fallbackLocale`) и подставляет `{{param}}`.
   *
   * @param key - Translation key / Ключ перевода.
   * @param params - Optional placeholder values / Необязательные параметры подстановки.
   * @returns Localized and interpolated string / Локализованная строка с подставленными параметрами.
   */
  public t(key: TranslationKey, params?: TranslationParams): string {
    const template = this.resolveTemplate(key);
    if (params === undefined) {
      return template;
    }

    return template.replace(/\{\{(\w+)\}\}/g, (_match, paramName: string) => {
      const value = params[paramName];
      return value !== undefined ? String(value) : `{{${paramName}}}`;
    });
  }

  private resolveTemplate(key: TranslationKey): string {
    const activeDict = this.dictionaries.get(this.locale);
    const activeValue = activeDict?.[key];
    if (activeValue !== undefined) {
      return activeValue;
    }

    const fallbackDict = this.dictionaries.get(this.fallbackLocale);
    const fallbackValue = fallbackDict?.[key];
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }

    return key;
  }

  private normalizeCode(code: string): string {
    return code.trim().toLowerCase();
  }
}
