import path from 'node:path';
import { Locale, type LocaleCode } from '../i18n/i18n.types';
import { DomainError } from './app.errors';
import { CLI_FLAG_DEFINITIONS, CLI_TOKENS } from './cli-flags.constants';
import type { CliFlagDefinition, CliOptions, CliParseState, ICliParser } from './cli.types';

/**
 * Extensible CLI argument parser driven by declarative `CliFlagDefinition` descriptors.
 * Расширяемый парсер аргументов командной строки на базе декларативных дескрипторов `CliFlagDefinition`.
 */
export class CliParserService implements ICliParser {
  private readonly supportedLocales: readonly LocaleCode[];
  private readonly flagIndex: ReadonlyMap<string, CliFlagDefinition>;

  /**
   * Creates a CLI parser with configurable supported locales and flag definitions.
   * Создает парсер CLI с настраиваемым списком поддерживаемых локалей и реестром флагов.
   *
   * @param supportedLocales - Locale codes accepted by `--lang` (defaults to built-in `Locale` values) / Допустимые локали.
   * @param flagDefinitions - Declarative flag descriptors (defaults to `CLI_FLAG_DEFINITIONS`) / Реестр описаний флагов.
   */
  public constructor(
    supportedLocales: readonly LocaleCode[] = Object.values(Locale),
    flagDefinitions: readonly CliFlagDefinition[] = CLI_FLAG_DEFINITIONS,
  ) {
    this.supportedLocales = supportedLocales;
    this.flagIndex = this.buildFlagIndex(flagDefinitions);
  }

  /**
   * Parses `argv` tokens (excluding `node` and script path) into strongly typed `CliOptions`.
   * Разбирает токены `argv` (без `node` и пути скрипта) в типизированный объект `CliOptions`.
   *
   * @param argv - Command-line arguments array / Массив аргументов командной строки.
   * @param cwd - Current working directory for resolving relative paths / Рабочая директория.
   * @returns Parsed `CliOptions` / Разобранные параметры запуска.
   * @throws {DomainError} When flags are unknown, values are missing, or locale is unsupported / При неверных флагах, пустых значениях или неизвестной локали.
   *
   * @example
   * new CliParserService().parse(['--url', 'https://example.com', '-l', 'en']);
   */
  public parse(argv: readonly string[], cwd: string = process.cwd()): CliOptions {
    const state = this.createInitialState(cwd);

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      if (token === undefined) {
        continue;
      }

      index = this.consumeToken(argv, index, token, state);
    }

    return this.finalizeOptions(state);
  }

  private buildFlagIndex(
    definitions: readonly CliFlagDefinition[],
  ): Map<string, CliFlagDefinition> {
    const index = new Map<string, CliFlagDefinition>();
    for (const def of definitions) {
      index.set(def.long, def);
      if (def.short !== undefined) {
        index.set(def.short, def);
      }
    }
    return index;
  }

  private createInitialState(cwd: string): CliParseState {
    return {
      cwd,
      supportedLocales: this.supportedLocales,
      targetUrl: undefined,
      configPath: path.resolve(cwd, ...CLI_TOKENS.DEFAULT_CONFIG_SEGMENTS),
      locale: CLI_TOKENS.DEFAULT_LOCALE,
      debug: false,
      help: false,
    };
  }

  private consumeToken(
    argv: readonly string[],
    index: number,
    token: string,
    state: CliParseState,
  ): number {
    const definition = this.flagIndex.get(token);
    if (definition !== undefined) {
      if (!definition.takesValue) {
        definition.apply(state, token);
        return index;
      }

      const value = this.readRequiredFlagValue(argv, index, token);
      definition.apply(state, token, value);
      return index + 1;
    }

    if (token.startsWith(CLI_TOKENS.FLAG_PREFIX)) {
      throw new DomainError({
        code: 'INVALID_CLI_ARGS',
        i18nKey: 'cli.unknownFlag',
        i18nParams: { flag: token },
        exitCode: CLI_TOKENS.INVALID_ARGS_EXIT_CODE,
      });
    }

    // Treat the first positional non-flag argument as the target URL.
    // Первый позиционный аргумент без префикса '-' трактуется как целевой URL.
    state.targetUrl ??= token;
    return index;
  }

  private readRequiredFlagValue(argv: readonly string[], index: number, flagToken: string): string {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith(CLI_TOKENS.FLAG_PREFIX)) {
      throw new DomainError({
        code: 'INVALID_CLI_ARGS',
        i18nKey: 'cli.missingFlagValue',
        i18nParams: { flag: flagToken },
        exitCode: CLI_TOKENS.INVALID_ARGS_EXIT_CODE,
      });
    }
    return value;
  }

  private finalizeOptions(state: CliParseState): CliOptions {
    const baseOptions: CliOptions = {
      configPath: state.configPath,
      locale: state.locale,
      debug: state.debug,
      help: state.help,
    };

    return state.targetUrl !== undefined
      ? { ...baseOptions, targetUrl: state.targetUrl }
      : baseOptions;
  }
}

/**
 * Convenience helper parsing CLI arguments using `CliParserService`.
 * Удобная функция-обертка для быстрого разбора аргументов через `CliParserService`.
 *
 * @param argv - Command-line arguments array / Массив аргументов командной строки.
 * @param cwd - Working directory for resolving `--config` paths / Рабочая директория.
 * @param supportedLocales - Optional list of allowed locales / Необязательный список доступных локалей.
 * @returns Parsed `CliOptions` / Разобранные параметры CLI.
 */
export function parseCliArgs(
  argv: readonly string[],
  cwd: string = process.cwd(),
  supportedLocales: readonly LocaleCode[] = Object.values(Locale),
): CliOptions {
  return new CliParserService(supportedLocales).parse(argv, cwd);
}
