import http from 'node:http';
import https from 'node:https';
import { performance } from 'node:perf_hooks';
import { HTTP_CONSTANTS } from './network.constants';
import {
  NetworkTransportError,
  type IHttpStreamClient,
  type StreamDownloadOptions,
  type StreamDownloadResult,
} from './network.types';

/**
 * Internal settlement callbacks passed across decomposed HTTP stream handlers.
 * Внутренние обработчики завершения промиса, передаваемые между этапами обработки HTTP-потока.
 */
interface RequestSettlement {
  /** Resolves the current download promise / Завершает промис успешным результатом */
  readonly resolve: (result: StreamDownloadResult) => void;
  /** Rejects the current download promise / Завершает промис ошибкой */
  readonly reject: (error: unknown) => void;
  /** Cleans up abort listeners / Удаляет обработчики отмены */
  readonly cleanup: () => void;
  /** Checks whether the request has already settled / Проверяет, завершен ли уже запрос */
  readonly isSettled: () => boolean;
  /** Marks the request as settled and hands off promise settlement to a redirected request / Передает управление следующему запросу при редиректе */
  readonly handoff: (nextPromise: Promise<StreamDownloadResult>) => void;
}

/**
 * Node.js HTTP(S) streaming download client.
 * Consumes response streams chunk-by-chunk without buffering payload data in RAM,
 * preventing OOM errors on large benchmark targets.
 *
 * Потоковый HTTP(S)-клиент на базе Node.js.
 * Вычитывает поток ответа по чанкам без буферизации тела в оперативной памяти,
 * что исключает OOM при скачивании крупных файлов.
 */
export class NodeHttpStreamClientService implements IHttpStreamClient {
  /**
   * Executes a single HTTP(S) GET request, follows redirects safely,
   * consumes the response stream, and measures elapsed duration via `perf_hooks`.
   *
   * Выполняет одиночный HTTP(S) GET-запрос, безопасно следует редиректам,
   * вычитывает поток ответа и замеряет длительность через `perf_hooks`.
   *
   * @param url - Normalized HTTP(S) target URL / Целевой HTTP(S) URL.
   * @param options - Timeout, abort signal, and chunk callback options / Параметры таймаута, отмены и прогресса.
   * @returns Stream download result with byte count, duration, and headers / Результат скачивания с байтами, временем и заголовками.
   * @throws {NetworkTransportError} On network, timeout, redirect, or abort errors / При сетевых ошибках, таймауте, редиректах или отмене.
   */
  public async downloadStream(
    url: URL,
    options: StreamDownloadOptions,
  ): Promise<StreamDownloadResult> {
    return this.executeRequest(url, options, 0);
  }

  private executeRequest(
    url: URL,
    options: StreamDownloadOptions,
    redirectDepth: number,
  ): Promise<StreamDownloadResult> {
    return new Promise<StreamDownloadResult>((resolve, reject) => {
      if (options.signal.aborted) {
        reject(new NetworkTransportError('Request aborted', 'ABORT_ERR'));
        return;
      }

      const transport = url.protocol === 'https:' ? https : http;
      const startTimeMs = performance.now();
      let settled = false;

      const onAbort = (): void => {
        const abortError = new NetworkTransportError('Request aborted by caller', 'ABORT_ERR');
        request.destroy(abortError);
        settlement.reject(abortError);
      };

      const cleanupListeners = (): void => {
        options.signal.removeEventListener('abort', onAbort);
      };

      const settlement: RequestSettlement = {
        resolve: (result) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupListeners();
          resolve(result);
        },
        reject: (error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupListeners();
          reject(
            error instanceof Error ? error : new NetworkTransportError(String(error), 'UNKNOWN'),
          );
        },
        cleanup: cleanupListeners,
        isSettled: () => settled,
        handoff: (nextPromise) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanupListeners();
          nextPromise.then(resolve, reject);
        },
      };

      const request = transport.request(
        url,
        {
          method: 'GET',
          headers: {
            'User-Agent': HTTP_CONSTANTS.USER_AGENT,
            'Cache-Control': HTTP_CONSTANTS.CACHE_CONTROL,
            Pragma: HTTP_CONSTANTS.PRAGMA,
          },
        },
        (response) => {
          this.handleIncomingResponse(
            url,
            response,
            options,
            redirectDepth,
            startTimeMs,
            settlement,
          );
        },
      );

      this.attachAbortAndTimeoutHandlers(request, options, onAbort, settlement);
      request.end();
    });
  }

  private handleIncomingResponse(
    currentUrl: URL,
    response: http.IncomingMessage,
    options: StreamDownloadOptions,
    redirectDepth: number,
    startTimeMs: number,
    settlement: RequestSettlement,
  ): void {
    const statusCode = response.statusCode ?? 0;
    const locationHeader = response.headers.location;

    if (
      HTTP_CONSTANTS.REDIRECT_STATUS_CODES.has(statusCode) &&
      typeof locationHeader === 'string' &&
      locationHeader.trim().length > 0
    ) {
      this.handleRedirectResponse(
        currentUrl,
        response,
        locationHeader,
        options,
        redirectDepth,
        settlement,
      );
      return;
    }

    if (statusCode >= HTTP_CONSTANTS.ERROR_STATUS_MIN) {
      this.consumeErrorResponse(response, statusCode, startTimeMs, settlement);
      return;
    }

    this.consumeSuccessStream(response, statusCode, startTimeMs, options, settlement);
  }

  private handleRedirectResponse(
    currentUrl: URL,
    response: http.IncomingMessage,
    locationHeader: string,
    options: StreamDownloadOptions,
    redirectDepth: number,
    settlement: RequestSettlement,
  ): void {
    // Drain redirect body immediately so the underlying socket can be reused or closed cleanly.
    // Сразу дренируем тело редиректа, чтобы освободить сокет без удержания буферов в памяти.
    response.resume();

    if (redirectDepth >= HTTP_CONSTANTS.MAX_REDIRECTS) {
      settlement.reject(
        new NetworkTransportError('Too many HTTP redirects', 'ERR_TOO_MANY_REDIRECTS'),
      );
      return;
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(locationHeader, currentUrl);
    } catch (parseError: unknown) {
      settlement.reject(
        new NetworkTransportError('Invalid redirect URL', 'ERR_INVALID_REDIRECT', parseError),
      );
      return;
    }

    if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
      settlement.reject(
        new NetworkTransportError(
          `Unsupported redirect protocol: ${nextUrl.protocol}`,
          'ERR_UNSUPPORTED_PROTOCOL',
        ),
      );
      return;
    }

    settlement.handoff(this.executeRequest(nextUrl, options, redirectDepth + 1));
  }

  private consumeErrorResponse(
    response: http.IncomingMessage,
    statusCode: number,
    startTimeMs: number,
    settlement: RequestSettlement,
  ): void {
    // Discard error payload immediately without keeping references in memory.
    // Отбрасываем тело ошибочного ответа без сохранения данных в памяти.
    response.resume();
    response.once('end', () => {
      const durationMs = Math.max(HTTP_CONSTANTS.MIN_DURATION_MS, performance.now() - startTimeMs);
      settlement.resolve({
        statusCode,
        bytesDownloaded: 0,
        durationMs,
        headers: response.headers,
      });
    });
    response.once('error', (err) => {
      settlement.reject(this.toTransportError(err));
    });
  }

  private consumeSuccessStream(
    response: http.IncomingMessage,
    statusCode: number,
    startTimeMs: number,
    options: StreamDownloadOptions,
    settlement: RequestSettlement,
  ): void {
    let bytesDownloaded = 0;

    response.on('data', (chunk: Buffer | string) => {
      const byteLength = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength;
      bytesDownloaded += byteLength;

      if (options.onChunk !== undefined) {
        const elapsedMs = Math.max(HTTP_CONSTANTS.MIN_DURATION_MS, performance.now() - startTimeMs);
        options.onChunk(byteLength, bytesDownloaded, elapsedMs);
      }
    });

    response.once('end', () => {
      const durationMs = Math.max(HTTP_CONSTANTS.MIN_DURATION_MS, performance.now() - startTimeMs);
      settlement.resolve({
        statusCode,
        bytesDownloaded,
        durationMs,
        headers: response.headers,
      });
    });

    response.once('error', (err) => {
      settlement.reject(this.toTransportError(err));
    });
  }

  private attachAbortAndTimeoutHandlers(
    request: http.ClientRequest,
    options: StreamDownloadOptions,
    onAbort: () => void,
    settlement: RequestSettlement,
  ): void {
    options.signal.addEventListener('abort', onAbort, { once: true });

    request.setTimeout(options.timeoutMs, () => {
      const timeoutError = new NetworkTransportError(
        `Request timed out after ${options.timeoutMs}ms`,
        'ETIMEDOUT',
      );
      request.destroy(timeoutError);
      settlement.reject(timeoutError);
    });

    request.once('error', (err) => {
      if (!settlement.isSettled()) {
        settlement.reject(this.toTransportError(err));
      }
    });
  }

  private toTransportError(error: Error): NetworkTransportError {
    if (error instanceof NetworkTransportError) {
      return error;
    }

    const withCode = error as NodeJS.ErrnoException;
    const code = typeof withCode.code === 'string' ? withCode.code : 'NETWORK_ERROR';
    return new NetworkTransportError(error.message, code, error);
  }
}
