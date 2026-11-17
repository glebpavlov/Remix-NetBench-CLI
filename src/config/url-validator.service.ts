import { DomainError } from '../app/app.errors';
import type { IUrlValidator, UrlValidationResult } from './config.types';

/**
 * Protocols permitted for HTTP(S) benchmark targets.
 * Протоколы, разрешенные для целей замера пропускной способности.
 */
const SUPPORTED_PROTOCOLS = new Set<string>(['http:', 'https:']);

/**
 * Exit code returned on invalid URL user input.
 * Код выхода при некорректном URL от пользователя.
 */
const INVALID_URL_EXIT_CODE = 2;

/**
 * Service validating HTTP(S) target URLs according to protocol and syntax rules.
 * Сервис валидации целевых HTTP(S) URL по правилам синтаксиса и допустимого протокола.
 */
export class UrlValidatorService implements IUrlValidator {
  /**
   * Validates a raw URL string without throwing exceptions.
   * Проверяет сырую строку URL без выбрасывания исключений.
   *
   * @param rawUrl - Raw user-provided URL string / Сырая строка URL от пользователя.
   * @returns Discriminated validation result (`valid: true` with `URL` or `valid: false` with reason) /
   * Результат проверки (`valid: true` с `URL` или `valid: false` с причиной ошибки).
   *
   * @example
   * validator.validate('https://example.com/10MB.bin'); // { valid: true, normalizedUrl: URL }
   */
  public validate(rawUrl: string): UrlValidationResult {
    const trimmed = rawUrl.trim();
    if (trimmed.length === 0) {
      return { valid: false, reason: 'empty' };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return { valid: false, reason: 'invalid_format' };
    }

    if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
      return { valid: false, reason: 'unsupported_protocol' };
    }

    if (parsed.hostname.trim().length === 0) {
      return { valid: false, reason: 'invalid_format' };
    }

    return { valid: true, normalizedUrl: parsed };
  }

  /**
   * Validates a raw URL string and throws a localized `DomainError` if invalid.
   * Проверяет строку URL и выбрасывает локализованную ошибку `DomainError` при провале.
   *
   * @param rawUrl - Raw URL string to validate / Исходная строка URL для проверки.
   * @returns Parsed and normalized `URL` instance / Разобранный и нормализованный объект `URL`.
   * @throws {DomainError} Localized domain error with `INVALID_URL` code / Локализованная ошибка с кодом `INVALID_URL`.
   */
  public validateOrThrow(rawUrl: string): URL {
    const result = this.validate(rawUrl);
    if (result.valid) {
      return result.normalizedUrl;
    }

    switch (result.reason) {
      case 'empty':
        throw new DomainError({
          code: 'INVALID_URL',
          i18nKey: 'error.invalidUrl.empty',
          exitCode: INVALID_URL_EXIT_CODE,
        });
      case 'unsupported_protocol':
        throw new DomainError({
          code: 'INVALID_URL',
          i18nKey: 'error.invalidUrl.protocol',
          exitCode: INVALID_URL_EXIT_CODE,
        });
      case 'invalid_format':
        throw new DomainError({
          code: 'INVALID_URL',
          i18nKey: 'error.invalidUrl.format',
          exitCode: INVALID_URL_EXIT_CODE,
        });
    }
  }
}
