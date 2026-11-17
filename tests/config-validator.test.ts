import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/app/app.errors';
import { JsonConfigLoaderService } from '../src/config/config-loader.service';
import { UrlValidatorService } from '../src/config/url-validator.service';

describe('UrlValidatorService & JsonConfigLoaderService (Валидация URL и загрузка пресетов)', () => {
  const urlValidator = new UrlValidatorService();

  it('accepts valid http and https URLs with whitespace trimming / принимает валидные http/https URL с обрезкой пробелов', () => {
    const httpsRes = urlValidator.validate('  https://speed.cloudflare.com/__down?bytes=1000  ');
    expect(httpsRes.valid).toBe(true);
    if (httpsRes.valid) {
      expect(httpsRes.normalizedUrl.toString()).toBe(
        'https://speed.cloudflare.com/__down?bytes=1000',
      );
    }

    const httpRes = urlValidator.validate('http://localhost:8080/test.bin?token=abc');
    expect(httpRes.valid).toBe(true);
    if (httpRes.valid) {
      expect(httpRes.normalizedUrl.hostname).toBe('localhost');
    }
  });

  it('rejects empty strings, malformed URLs, and non-HTTP protocols / отклоняет пустые строки, битые URL и не-HTTP протоколы', () => {
    expect(urlValidator.validate('')).toEqual({ valid: false, reason: 'empty' });
    expect(urlValidator.validate('   ')).toEqual({ valid: false, reason: 'empty' });
    expect(urlValidator.validate('not a url')).toEqual({ valid: false, reason: 'invalid_format' });
    expect(urlValidator.validate('ftp://example.com/file.bin')).toEqual({
      valid: false,
      reason: 'unsupported_protocol',
    });
    expect(urlValidator.validate('file:///etc/passwd')).toEqual({
      valid: false,
      reason: 'unsupported_protocol',
    });
    expect(urlValidator.validate('javascript:alert(1)')).toEqual({
      valid: false,
      reason: 'unsupported_protocol',
    });
  });

  it('validateOrThrow throws localized DomainError for each invalid reason / выбрасывает локализованный DomainError для каждой причины отказа', () => {
    expect(() => urlValidator.validateOrThrow('')).toThrow(DomainError);
    try {
      urlValidator.validateOrThrow('');
    } catch (err: unknown) {
      expect(err).toMatchObject({
        code: 'INVALID_URL',
        i18nKey: 'error.invalidUrl.empty',
        exitCode: 2,
      });
    }

    try {
      urlValidator.validateOrThrow('ftp://host/file');
    } catch (err: unknown) {
      expect(err).toMatchObject({
        code: 'INVALID_URL',
        i18nKey: 'error.invalidUrl.protocol',
        exitCode: 2,
      });
    }

    try {
      urlValidator.validateOrThrow('http://');
    } catch (err: unknown) {
      expect(err).toMatchObject({
        code: 'INVALID_URL',
        i18nKey: 'error.invalidUrl.format',
        exitCode: 2,
      });
    }
  });

  it('loads and normalizes valid presets JSON (including empty array) / загружает и нормализует валидный JSON пресетов (включая пустой массив)', async () => {
    const loader = new JsonConfigLoaderService(urlValidator, () =>
      Promise.resolve(
        JSON.stringify([
          { name: '  Primary Node  ', url: 'https://example.com/10MB.bin' },
          { name: 'Local', url: 'http://127.0.0.1:3000/blob' },
        ]),
      ),
    );

    const presets = await loader.loadPresets('/fake/presets.json');
    expect(presets).toEqual([
      { name: 'Primary Node', url: 'https://example.com/10MB.bin' },
      { name: 'Local', url: 'http://127.0.0.1:3000/blob' },
    ]);

    const emptyLoader = new JsonConfigLoaderService(urlValidator, () => Promise.resolve('[]'));
    await expect(emptyLoader.loadPresets('/empty.json')).resolves.toEqual([]);
  });

  it('throws DomainError on missing file, invalid JSON, or malformed preset schema / выбрасывает DomainError при ошибках чтения, JSON и схемы', async () => {
    const missingLoader = new JsonConfigLoaderService(urlValidator, () =>
      Promise.reject(new Error('ENOENT: no such file')),
    );
    await expect(missingLoader.loadPresets('/missing.json')).rejects.toMatchObject({
      code: 'CONFIG_READ_ERROR',
      i18nKey: 'error.config.readFailed',
      exitCode: 3,
    });

    const badJsonLoader = new JsonConfigLoaderService(urlValidator, () =>
      Promise.resolve('{bad json'),
    );
    await expect(badJsonLoader.loadPresets('/bad.json')).rejects.toMatchObject({
      code: 'CONFIG_VALIDATION_ERROR',
      i18nKey: 'error.config.invalidJson',
    });

    const nonArrayLoader = new JsonConfigLoaderService(urlValidator, () => Promise.resolve('{}'));
    await expect(nonArrayLoader.loadPresets('/obj.json')).rejects.toMatchObject({
      code: 'CONFIG_VALIDATION_ERROR',
      i18nKey: 'error.config.invalidSchema',
    });

    const emptyNameLoader = new JsonConfigLoaderService(urlValidator, () =>
      Promise.resolve(JSON.stringify([{ name: '   ', url: 'https://example.com/file' }])),
    );
    await expect(emptyNameLoader.loadPresets('/empty-name.json')).rejects.toMatchObject({
      code: 'CONFIG_VALIDATION_ERROR',
      i18nKey: 'error.config.invalidSchema',
    });

    const nonStringUrlLoader = new JsonConfigLoaderService(urlValidator, () =>
      Promise.resolve(JSON.stringify([{ name: 'Valid', url: 12345 }])),
    );
    await expect(nonStringUrlLoader.loadPresets('/bad-type.json')).rejects.toMatchObject({
      code: 'CONFIG_VALIDATION_ERROR',
      i18nKey: 'error.config.invalidSchema',
    });

    const badUrlEntryLoader = new JsonConfigLoaderService(urlValidator, () =>
      Promise.resolve(JSON.stringify([{ name: 'FTP', url: 'ftp://example.com/file' }])),
    );
    await expect(badUrlEntryLoader.loadPresets('/bad-entry.json')).rejects.toMatchObject({
      code: 'CONFIG_VALIDATION_ERROR',
      i18nKey: 'error.config.invalidSchema',
    });
  });
});
