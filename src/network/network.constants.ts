/**
 * HTTP protocol constants used by the streaming download client.
 * Константы HTTP-протокола, используемые потоковым клиентом скачивания.
 */
export const HTTP_CONSTANTS = {
  /** Maximum number of HTTP redirects followed per request / Максимум HTTP-редиректов на запрос */
  MAX_REDIRECTS: 5,
  /** HTTP status codes treated as redirects / Коды HTTP-ответов, считающиеся редиректами */
  REDIRECT_STATUS_CODES: new Set<number>([301, 302, 303, 307, 308]),
  /** Minimum HTTP status code considered a successful response / Минимальный успешный код ответа */
  SUCCESS_STATUS_MIN: 200,
  /** Exclusive upper bound for successful/redirect HTTP status codes / Верхняя граница успешных кодов */
  ERROR_STATUS_MIN: 400,
  /** HTTP 429 Too Many Requests status code / Код ответа HTTP 429 (слишком много запросов) */
  TOO_MANY_REQUESTS_STATUS: 429,
  /** Minimum measurable elapsed duration in milliseconds to avoid division by zero / Минимальная длительность в мс для защиты от деления на ноль */
  MIN_DURATION_MS: 0.001,
  /** User-Agent header sent on benchmark requests / Заголовок User-Agent для запросов замера */
  USER_AGENT: 'NetBench-CLI/1.0',
  /** Cache-Control header disabling intermediate proxy caching / Заголовок запрета кэширования */
  CACHE_CONTROL: 'no-cache',
  /** Pragma header for HTTP/1.0 cache bypass compatibility / Заголовок Pragma для обхода кэша HTTP/1.0 */
  PRAGMA: 'no-cache',
} as const;

/**
 * Standard HTTP header names inspected by retry strategies.
 * Имена стандартных HTTP-заголовков, анализируемых стратегиями повторов.
 */
export const RETRY_HEADER_NAMES = {
  /** Lowercased `Retry-After` response header name / Имя заголовка `Retry-After` в нижнем регистре */
  RETRY_AFTER: 'retry-after',
} as const;
