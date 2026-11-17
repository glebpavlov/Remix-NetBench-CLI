import path from 'node:path';
import { Locale } from '../i18n/i18n.types';
import { DomainError } from './app.errors';
import type { CliFlagDefinition } from './cli.types';

/**
 * Centralized CLI token constants, default paths, and exit codes.
 * Централизованные константы токенов CLI, путей по умолчанию и кодов завершения.
 */
export const CLI_TOKENS = {
  /** Prefix identifying any CLI flag token / Префикс любого флага командной строки */
  FLAG_PREFIX: '-',
  /** Prefix identifying long CLI flags (`--url`) / Префикс длинных флагов (`--url`) */
  LONG_FLAG_PREFIX: '--',
  /** Relative path segments to default presets configuration / Сегменты пути к пресетам по умолчанию */
  DEFAULT_CONFIG_SEGMENTS: ['config', 'presets.json'] as const,
  /** Default UI locale when `--lang` is omitted / Локаль интерфейса по умолчанию */
  DEFAULT_LOCALE: Locale.RU,
  /** POSIX exit code for invalid CLI arguments / Код выхода при некорректных аргументах CLI */
  INVALID_ARGS_EXIT_CODE: 2,
  /** Short & long flag names / Имена коротких и длинных флагов */
  FLAGS: {
    HELP_SHORT: '-h',
    HELP_LONG: '--help',
    DEBUG_LONG: '--debug',
    URL_SHORT: '-u',
    URL_LONG: '--url',
    CONFIG_SHORT: '-c',
    CONFIG_LONG: '--config',
    LANG_SHORT: '-l',
    LANG_LONG: '--lang',
  },
} as const;

/**
 * Extensible declarative registry of supported CLI flags.
 * Adding a new flag only requires appending a descriptor here (Open/Closed Principle).
 *
 * Расширяемый декларативный реестр поддерживаемых флагов CLI.
 * Для добавления нового флага достаточно добавить новый дескриптор в этот массив (принцип OCP).
 */
export const CLI_FLAG_DEFINITIONS: readonly CliFlagDefinition[] = [
  {
    short: CLI_TOKENS.FLAGS.HELP_SHORT,
    long: CLI_TOKENS.FLAGS.HELP_LONG,
    takesValue: false,
    apply: (state) => {
      state.help = true;
    },
  },
  {
    long: CLI_TOKENS.FLAGS.DEBUG_LONG,
    takesValue: false,
    apply: (state) => {
      state.debug = true;
    },
  },
  {
    short: CLI_TOKENS.FLAGS.URL_SHORT,
    long: CLI_TOKENS.FLAGS.URL_LONG,
    takesValue: true,
    apply: (state, _token, value) => {
      state.targetUrl = value;
    },
  },
  {
    short: CLI_TOKENS.FLAGS.CONFIG_SHORT,
    long: CLI_TOKENS.FLAGS.CONFIG_LONG,
    takesValue: true,
    apply: (state, _token, value) => {
      if (value !== undefined) {
        state.configPath = path.resolve(state.cwd, value);
      }
    },
  },
  {
    short: CLI_TOKENS.FLAGS.LANG_SHORT,
    long: CLI_TOKENS.FLAGS.LANG_LONG,
    takesValue: true,
    apply: (state, _token, value) => {
      if (value === undefined) {
        return;
      }
      const normalized = value.trim().toLowerCase();
      const isSupported = state.supportedLocales.some(
        (candidate) => candidate.toLowerCase() === normalized,
      );
      if (!isSupported) {
        throw new DomainError({
          code: 'INVALID_CLI_ARGS',
          i18nKey: 'cli.unsupportedLocale',
          i18nParams: {
            locale: value,
            available: state.supportedLocales.join(', '),
          },
          exitCode: CLI_TOKENS.INVALID_ARGS_EXIT_CODE,
        });
      }
      state.locale = normalized;
    },
  },
];
