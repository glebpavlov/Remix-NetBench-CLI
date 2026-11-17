import type { TranslationKey, TranslationParams } from '../i18n/i18n.types';

/**
 * Case-insensitive HTTP response headers dictionary.
 * Словарь заголовков HTTP-ответа в нижнем регистре.
 */
export type HttpHeadersMap = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Result of a single streamed HTTP(S) GET request without buffering payload in RAM.
 * Результат одного потокового HTTP(S) GET-запроса без буферизации тела ответа в памяти.
 */
export interface StreamDownloadResult {
  /**
   * HTTP response status code (e.g., `200`, `429`, `503`).
   * Код состояния HTTP-ответа (например, `200`, `429`, `503`).
   */
  readonly statusCode: number;

  /**
   * Total number of response body bytes consumed from the stream.
   * Общее количество байт тела ответа, вычитанных из потока.
   */
  readonly bytesDownloaded: number;

  /**
   * High-resolution request duration in milliseconds measured via `perf_hooks`.
   * Высокоточная длительность запроса в миллисекундах, измеренная через `perf_hooks`.
   */
  readonly durationMs: number;

  /**
   * Response headers map (used e.g. to inspect `Retry-After`).
   * Карта заголовков ответа (например, для чтения `Retry-After`).
   */
  readonly headers: HttpHeadersMap;
}

/**
 * Callback invoked whenever a chunk of response payload arrives from the stream.
 * Функция обратного вызова, срабатывающая при получении очередного чанка данных из потока.
 *
 * @param chunkBytes - Size of the newly received chunk in bytes / Размер текущего чанка в байтах.
 * @param totalBytesSoFar - Cumulative bytes received in this attempt / Суммарно скачано байт в этой попытке.
 * @param elapsedMs - Elapsed milliseconds since request start / Прошедшее время с начала запроса в мс.
 */
export type ChunkProgressCallback = (
  chunkBytes: number,
  totalBytesSoFar: number,
  elapsedMs: number,
) => void;

/**
 * Options for executing a streamed HTTP(S) download request.
 * Параметры выполнения потокового HTTP(S)-скачивания.
 */
export interface StreamDownloadOptions {
  /**
   * Socket/request inactivity timeout in milliseconds.
   * Таймаут ожидания ответа/данных в миллисекундах.
   */
  readonly timeoutMs: number;

  /**
   * Abort signal used to cancel the in-flight request immediately.
   * Сигнал отмены для немедленного прерывания активного запроса.
   */
  readonly signal: AbortSignal;

  /**
   * Optional progress callback invoked on every incoming payload chunk.
   * Необязательный callback прогресса для каждого входящего чанка.
   */
  readonly onChunk?: ChunkProgressCallback;
}

/**
 * Contract for a streaming HTTP(S) client (DI abstraction enabling unit tests without real sockets).
 * Контракт потокового HTTP(S)-клиента (абстракция для DI и тестирования без реальной сети).
 */
export interface IHttpStreamClient {
  /**
   * Downloads a target URL by consuming its response stream chunk-by-chunk.
   * Скачивает ресурс по URL с потоковым чтением чанков без накопления в RAM.
   *
   * @param url - Normalized HTTP(S) URL / Нормализованный HTTP(S) URL.
   * @param options - Timeout, abort signal, and optional chunk callback / Настройки таймаута, отмены и прогресса.
   * @returns Stream download telemetry and headers / Метрики скачивания и заголовки ответа.
   */
  downloadStream(url: URL, options: StreamDownloadOptions): Promise<StreamDownloadResult>;
}

/**
 * Typed network failure raised by the streaming client on socket, DNS, redirect, or timeout errors.
 * Типизированная транспортная ошибка, выбрасываемая клиентом при сбоях сокета, DNS, редиректов или таймауте.
 */
export class NetworkTransportError extends Error {
  /**
   * Machine-readable Node.js or client error code (e.g., `ECONNRESET`, `ETIMEDOUT`, `ABORT_ERR`).
   * Машиночитаемый код транспортной ошибки (например, `ECONNRESET`, `ETIMEDOUT`, `ABORT_ERR`).
   */
  public readonly code: string;

  /**
   * Constructs a `NetworkTransportError` preserving the underlying error code and cause.
   * Создает `NetworkTransportError` с сохранением кода ошибки и исходной причины.
   *
   * @param message - Human-readable diagnostic description / Описание ошибки.
   * @param code - Machine-readable error code / Код ошибки.
   * @param cause - Optional original error object / Необязательная исходная ошибка.
   */
  public constructor(message: string, code: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'NetworkTransportError';
    this.code = code;
  }
}

/**
 * Failure context evaluated by retry strategies to determine recovery behavior.
 * Контекст сбоя, передаваемый стратегиям повторов для принятия решения о ретрае.
 */
export interface RetryContext {
  /**
   * 1-based retry attempt counter for this failure category.
   * Порядковый номер попытки повтора (начиная с 1) для данной категории сбоя.
   */
  readonly attempt: number;

  /**
   * HTTP response status code if an HTTP response was received.
   * HTTP-код ответа сервера, если ответ был получен.
   */
  readonly statusCode?: number;

  /**
   * HTTP response headers if available (used for `Retry-After`).
   * Заголовки HTTP-ответа (используются для чтения `Retry-After`).
   */
  readonly headers?: HttpHeadersMap;

  /**
   * Transport/socket error code if a network exception occurred.
   * Код транспортной/сетевой ошибки при возникновении исключения.
   */
  readonly errorCode?: string;

  /**
   * Original error instance if a transport exception was thrown.
   * Исходный объект ошибки при транспортном сбое.
   */
  readonly error?: Error;
}

/**
 * Outcome returned by a retry strategy or composite retry policy.
 * Решение о повторе, возвращаемое стратегией или композитной политикой повторов.
 */
export interface RetryDecision {
  /**
   * Whether the caller should perform another attempt.
   * Следует ли выполнить еще одну попытку запроса.
   */
  readonly shouldRetry: boolean;

  /**
   * Wait duration in milliseconds before the next attempt (`0` when `shouldRetry` is `false`).
   * Длительность ожидания в миллисекундах перед следующей попыткой (`0`, если `shouldRetry === false`).
   */
  readonly delayMs: number;

  /**
   * Translation key describing the retry reason for UI/logging.
   * Ключ локализации, описывающий причину повторной попытки.
   */
  readonly reasonKey: TranslationKey;

  /**
   * Optional interpolation parameters for `reasonKey`.
   * Необязательные параметры подстановки для шаблона `reasonKey`.
   */
  readonly reasonParams?: TranslationParams;
}

/**
 * Strategy pattern contract for deciding retry eligibility and backoff delay.
 * Контракт паттерна «Стратегия» для определения возможности повтора и задержки перед ним.
 */
export interface IRetryStrategy {
  /**
   * Returns `true` if this strategy handles the given failure `context`.
   * Возвращает `true`, если данная стратегия применима к переданному контексту сбоя.
   *
   * @param context - Failure context / Контекст сбоя.
   * @returns Whether this strategy supports the failure / Применима ли стратегия.
   */
  supports(context: RetryContext): boolean;

  /**
   * Evaluates whether a retry should occur and calculates the delay in milliseconds.
   * Вычисляет необходимость повторной попытки и длительность задержки в миллисекундах.
   *
   * @param context - Failure context / Контекст сбоя.
   * @returns Structured retry decision / Решение о повторной попытке.
   */
  evaluate(context: RetryContext): RetryDecision;
}

/**
 * Composite retry policy contract used by `BenchmarkEngineService` (DIP).
 * Контракт композитной политики повторов, используемый движком замера (инверсия зависимостей DIP).
 */
export interface IRetryPolicy {
  /**
   * Evaluates the failure context using registered retry strategies.
   * Оценивает контекст сбоя с помощью зарегистрированных стратегий повторов.
   *
   * @param context - Failure context / Контекст сбоя.
   * @returns Retry decision from the first matching strategy or a terminal decline / Решение о повторе.
   */
  evaluate(context: RetryContext): RetryDecision;
}
