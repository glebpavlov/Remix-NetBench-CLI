import { describe, expect, it } from 'vitest';
import { GlobalErrorBoundaryService } from '../src/app/error-boundary.service';
import { DomainError } from '../src/app/app.errors';
import { I18nService } from '../src/i18n/i18n.service';
import { Locale } from '../src/i18n/i18n.types';
import type { ITerminalLifecycle } from '../src/tui/tui.types';

class ExitInterceptedError extends Error {
  public readonly code: number;

  public constructor(code: number) {
    super(`Exited with ${code}`);
    this.code = code;
  }
}

describe('GlobalErrorBoundaryService (Глобальный перехват ошибок и защита стека)', () => {
  const createLifecycle = (): { lifecycle: ITerminalLifecycle; exited: () => boolean } => {
    let exitedFlag = false;
    return {
      lifecycle: {
        enterTuiMode: () => undefined,
        exitTuiMode: () => {
          exitedFlag = true;
        },
        onResize: () => () => undefined,
        onInterrupt: () => () => undefined,
      },
      exited: () => exitedFlag,
    };
  };

  it('suppresses stack trace by default and prints localized DomainError message / скрывает стек по умолчанию и выводит локализованный DomainError', () => {
    const chunks: string[] = [];
    const { lifecycle, exited } = createLifecycle();
    const i18n = new I18nService(Locale.EN);

    const boundary = new GlobalErrorBoundaryService({
      stderr: {
        write: (chunk) => {
          chunks.push(chunk);
          return true;
        },
      },
      i18n,
      lifecycle,
      exitFn: (code) => {
        throw new ExitInterceptedError(code);
      },
    });

    const err = new DomainError({
      code: 'INVALID_URL',
      i18nKey: 'error.invalidUrl.protocol',
      exitCode: 2,
    });

    expect(() => boundary.handleFatal(err)).toThrow(ExitInterceptedError);
    expect(exited()).toBe(true);

    const output = chunks.join('');
    expect(output).toContain('Error [INVALID_URL]');
    expect(output).toContain('Only http:// and https:// protocols are supported.');
    expect(output).not.toContain('Stack trace');
  });

  it('localizes fatal errors in Russian when RU locale is active / форматирует ошибки на русском при активной локали RU', () => {
    const chunks: string[] = [];
    const { lifecycle } = createLifecycle();
    const i18n = new I18nService(Locale.RU);

    const boundary = new GlobalErrorBoundaryService({
      stderr: {
        write: (chunk) => {
          chunks.push(chunk);
          return true;
        },
      },
      i18n,
      lifecycle,
      exitFn: (code) => {
        throw new ExitInterceptedError(code);
      },
    });

    const err = new DomainError({
      code: 'INVALID_URL',
      i18nKey: 'error.invalidUrl.empty',
      exitCode: 2,
    });

    expect(() => boundary.handleFatal(err)).toThrow(ExitInterceptedError);
    const output = chunks.join('');
    expect(output).toContain('Ошибка [INVALID_URL]');
    expect(output).toContain('URL не может быть пустым.');
  });

  it('converts non-Error thrown primitives (string/number) via toDomainError / конвертирует примитивные исключения в INTERNAL_ERROR', () => {
    const { lifecycle } = createLifecycle();
    const boundary = new GlobalErrorBoundaryService({
      stderr: { write: () => true },
      i18n: new I18nService(Locale.EN),
      lifecycle,
      exitFn: (code) => {
        throw new ExitInterceptedError(code);
      },
    });

    const converted = boundary.toDomainError('unexpected string failure');
    expect(converted).toBeInstanceOf(DomainError);
    expect(converted.code).toBe('INTERNAL_ERROR');
    expect(converted.exitCode).toBe(1);
    expect(converted.i18nParams).toEqual({ details: 'unexpected string failure' });
  });

  it('prints stack trace (preferring Error.cause stack) only when --debug mode is enabled / печатает stack trace (приоритетно из cause) только при --debug', () => {
    const chunks: string[] = [];
    const { lifecycle } = createLifecycle();
    const i18n = new I18nService(Locale.EN);

    const boundary = new GlobalErrorBoundaryService({
      stderr: {
        write: (chunk) => {
          chunks.push(chunk);
          return true;
        },
      },
      i18n,
      lifecycle,
      exitFn: (code) => {
        throw new ExitInterceptedError(code);
      },
    });

    boundary.setDebugMode(true);

    const rootCause = new Error('Root socket hangup');
    const wrapped = new DomainError({
      code: 'RESOURCE_UNAVAILABLE',
      i18nKey: 'error.network.connectionUnavailable',
      i18nParams: { details: rootCause.message },
      exitCode: 4,
      cause: rootCause,
    });

    expect(() => boundary.handleFatal(wrapped)).toThrow(ExitInterceptedError);
    const output = chunks.join('');
    expect(output).toContain('RESOURCE_UNAVAILABLE');
    expect(output).toContain('Stack trace (--debug):');
    expect(output).toContain('Error: Root socket hangup');
  });
});
