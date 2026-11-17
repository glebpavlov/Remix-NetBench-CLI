import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliParserService, parseCliArgs } from '../src/app/cli-parser.service';
import type { CliFlagDefinition } from '../src/app/cli.types';
import { Locale } from '../src/i18n/i18n.types';

describe('CliParserService (Парсер аргументов командной строки)', () => {
  const cwd = '/workspace/netbench';

  it('returns default options when invoked with empty argv / возвращает настройки по умолчанию при пустом argv', () => {
    const options = parseCliArgs([], cwd);

    expect(options).toEqual({
      configPath: path.resolve(cwd, 'config', 'presets.json'),
      locale: Locale.RU,
      debug: false,
      help: false,
    });
    expect(options.targetUrl).toBeUndefined();
  });

  it('parses short and long flags (-u/--url, -c/--config, -l/--lang, --debug, -h/--help) / разбирает короткие и длинные флаги', () => {
    const options = parseCliArgs(
      [
        '-u',
        'https://example.com/file.bin',
        '-c',
        './custom/presets.json',
        '-l',
        'EN',
        '--debug',
        '-h',
      ],
      cwd,
    );

    expect(options).toEqual({
      targetUrl: 'https://example.com/file.bin',
      configPath: path.resolve(cwd, './custom/presets.json'),
      locale: 'en',
      debug: true,
      help: true,
    });
  });

  it('accepts a positional target URL without -u flag / принимает позиционный URL без флага -u', () => {
    const options = parseCliArgs(['https://speed.cloudflare.com/__down?bytes=1000'], cwd);
    expect(options.targetUrl).toBe('https://speed.cloudflare.com/__down?bytes=1000');
  });

  it('throws INVALID_CLI_ARGS when a value-taking flag lacks its value or is followed by another flag / выбрасывает INVALID_CLI_ARGS при пропущенном значении флага', () => {
    expect(() => parseCliArgs(['--url'], cwd)).toThrow();
    expect(() => parseCliArgs(['-c', '--debug'], cwd)).toThrow();

    try {
      parseCliArgs(['-u'], cwd);
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 'INVALID_CLI_ARGS',
        i18nKey: 'cli.missingFlagValue',
        i18nParams: { flag: '-u' },
        exitCode: 2,
      });
    }
  });

  it('throws INVALID_CLI_ARGS on unknown flags / выбрасывает INVALID_CLI_ARGS при неизвестном флаге', () => {
    try {
      parseCliArgs(['--unknown-option'], cwd);
      expect.unreachable('Expected DomainError');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 'INVALID_CLI_ARGS',
        i18nKey: 'cli.unknownFlag',
        i18nParams: { flag: '--unknown-option' },
        exitCode: 2,
      });
    }
  });

  it('supports custom registered locales via constructor injection (OCP) / поддерживает новые локали через DI без правки парсера', () => {
    const parser = new CliParserService([Locale.RU, Locale.EN, 'de']);

    const deOptions = parser.parse(['--lang', 'DE'], cwd);
    expect(deOptions.locale).toBe('de');

    try {
      parser.parse(['-l', 'fr'], cwd);
      expect.unreachable('Expected DomainError');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 'INVALID_CLI_ARGS',
        i18nKey: 'cli.unsupportedLocale',
        i18nParams: { locale: 'fr', available: 'ru, en, de' },
      });
    }
  });

  it('allows extending CLI flags via custom CliFlagDefinition registry / позволяет расширять список флагов через CliFlagDefinition', () => {
    let customTriggered = false;
    const customFlags: readonly CliFlagDefinition[] = [
      {
        short: '-v',
        long: '--verbose',
        takesValue: false,
        apply: (state) => {
          customTriggered = true;
          state.debug = true;
        },
      },
    ];

    const parser = new CliParserService([Locale.RU], customFlags);
    const result = parser.parse(['-v'], cwd);

    expect(customTriggered).toBe(true);
    expect(result.debug).toBe(true);
  });
});
