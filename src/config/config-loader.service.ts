import { readFile } from 'node:fs/promises';
import { DomainError } from '../app/app.errors';
import type { FileReaderFn, IConfigLoader, IUrlValidator, PresetTarget } from './config.types';

/**
 * POSIX exit code returned when configuration reading or schema validation fails.
 * Код завершения процесса при ошибке чтения или валидации файла конфигурации.
 */
const CONFIG_ERROR_EXIT_CODE = 3;

/**
 * Loads and validates preset targets from an external JSON configuration file.
 * Загружает и валидирует список пресетов целей замера из внешнего JSON-файла конфигурации.
 */
export class JsonConfigLoaderService implements IConfigLoader {
  private readonly urlValidator: IUrlValidator;
  private readonly readFileFn: FileReaderFn;

  /**
   * Creates a JSON preset loader with injected URL validator and file reader.
   * Создает загрузчик JSON-пресетов с внедренным валидатором URL и функцией чтения файлов.
   *
   * @param urlValidator - URL validator service / Сервис валидации URL.
   * @param readFileFn - File reader abstraction (defaults to `fs/promises.readFile`) / Абстракция чтения файла.
   */
  public constructor(
    urlValidator: IUrlValidator,
    readFileFn: FileReaderFn = (path, encoding) => readFile(path, { encoding }),
  ) {
    this.urlValidator = urlValidator;
    this.readFileFn = readFileFn;
  }

  /**
   * Reads, parses, and validates an array of `{ name, url }` preset entries.
   * Читает, парсит и проверяет массив пресетов формата `{ name, url }`.
   *
   * @param filePath - Path to presets JSON file / Путь к JSON-файлу пресетов.
   * @returns Validated and normalized array of `PresetTarget` / Проверенный и нормализованный массив пресетов.
   * @throws {DomainError} On read error, malformed JSON, or invalid schema / При ошибке чтения, битом JSON или неверной схеме.
   */
  public async loadPresets(filePath: string): Promise<readonly PresetTarget[]> {
    const rawContent = await this.readRawFile(filePath);
    const parsed = this.parseJsonContent(rawContent, filePath);

    if (!Array.isArray(parsed)) {
      throw this.createSchemaError(0, 'Root value must be a JSON array');
    }

    return parsed.map((entry: unknown, index: number) => this.validateEntry(entry, index));
  }

  private async readRawFile(filePath: string): Promise<string> {
    try {
      return await this.readFileFn(filePath, 'utf-8');
    } catch (error: unknown) {
      const details = error instanceof Error ? error.message : String(error);
      throw new DomainError({
        code: 'CONFIG_READ_ERROR',
        i18nKey: 'error.config.readFailed',
        i18nParams: { path: filePath, details },
        exitCode: CONFIG_ERROR_EXIT_CODE,
        cause: error,
      });
    }
  }

  private parseJsonContent(rawContent: string, filePath: string): unknown {
    try {
      return JSON.parse(rawContent) as unknown;
    } catch (error: unknown) {
      throw new DomainError({
        code: 'CONFIG_VALIDATION_ERROR',
        i18nKey: 'error.config.invalidJson',
        i18nParams: { path: filePath },
        exitCode: CONFIG_ERROR_EXIT_CODE,
        cause: error,
      });
    }
  }

  private validateEntry(entry: unknown, index: number): PresetTarget {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw this.createSchemaError(index, 'Entry must be an object');
    }

    const record = entry as Record<string, unknown>;
    const rawName = record['name'];
    const rawUrl = record['url'];

    if (typeof rawName !== 'string' || rawName.trim().length === 0) {
      throw this.createSchemaError(index, 'Field "name" must be a non-empty string');
    }

    if (typeof rawUrl !== 'string') {
      throw this.createSchemaError(index, 'Field "url" must be a string');
    }

    const urlValidation = this.urlValidator.validate(rawUrl);
    if (!urlValidation.valid) {
      throw this.createSchemaError(index, `Invalid URL (${urlValidation.reason})`);
    }

    return {
      name: rawName.trim(),
      url: urlValidation.normalizedUrl.toString(),
    };
  }

  private createSchemaError(index: number, details: string): DomainError {
    return new DomainError({
      code: 'CONFIG_VALIDATION_ERROR',
      i18nKey: 'error.config.invalidSchema',
      i18nParams: { index, details },
      exitCode: CONFIG_ERROR_EXIT_CODE,
    });
  }
}
