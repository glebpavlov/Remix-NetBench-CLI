import type { PresetTarget } from '../config/config.types';
import type { BenchmarkSummary, IterationMetric } from '../core/core.types';

/**
 * Abstraction over a terminal output stream (e.g., `process.stdout` or a test mock).
 * Абстракция выходного потока терминала (например, `process.stdout` или мок для тестов).
 */
export interface ITerminalOutputStream {
  /**
   * Current terminal column count (width in character cells).
   * Текущая ширина терминала в столбцах (знакоместах).
   */
  readonly columns: number;

  /**
   * Current terminal row count (height in lines).
   * Текущая высота терминала в строках.
   */
  readonly rows: number;

  /**
   * Indicates whether the stream is connected to an interactive TTY terminal.
   * Признак того, что поток подключен к интерактивному TTY-терминалу.
   */
  readonly isTTY: boolean;

  /**
   * Writes a raw string or ANSI escape sequence chunk to the stream.
   * Записывает строку или ANSI-последовательность в выходной поток.
   *
   * @param chunk - String payload to write / Строковые данные для записи.
   * @returns `true` if stream buffer is ready for more writes / `true`, если буфер потока свободен.
   */
  write(chunk: string): boolean;

  /**
   * Subscribes to terminal window resize notifications.
   * Подписывается на событие изменения размеров окна терминала.
   *
   * @param listener - Resize callback / Обработчик изменения размера.
   * @returns Unsubscribe function / Функция отписки.
   */
  onResize(listener: () => void): () => void;
}

/**
 * Abstraction over a terminal input stream (e.g., `process.stdin` or a test mock).
 * Абстракция входного потока терминала (например, `process.stdin` или мок для тестов).
 */
export interface ITerminalInputStream {
  /**
   * Indicates whether the input stream is attached to an interactive TTY.
   * Признак того, что входной поток подключен к интерактивному TTY.
   */
  readonly isTTY: boolean;

  /**
   * Enables or disables raw character-by-character input mode when supported.
   * Включает или отключает посимвольный raw-режим ввода, если он поддерживается потоком.
   *
   * @param mode - `true` for raw mode, `false` for cooked mode / `true` для raw-режима, `false` для обычного.
   */
  setRawMode?(mode: boolean): void;

  /**
   * Resumes reading chunks from the input stream.
   * Возобновляет чтение данных из входного потока.
   */
  resume(): void;

  /**
   * Pauses reading chunks from the input stream.
   * Приостанавливает чтение данных из входного потока.
   */
  pause(): void;

  /**
   * Subscribes to raw `Buffer` data chunks emitted by the terminal.
   * Подписывается на получение сырых буферов `Buffer` при нажатии клавиш.
   *
   * @param listener - Callback receiving raw byte chunks / Обработчик сырых байтов ввода.
   * @returns Unsubscribe function / Функция отписки.
   */
  onData(listener: (chunk: Buffer) => void): () => void;
}

/**
 * Normalized keyboard events emitted by `InputController`.
 * Нормализованные события клавиатуры, порождаемые контроллером ввода `InputController`.
 */
export type KeyEvent =
  | {
      /** Navigation or control key type / Тип навигационной или управляющей клавиши */
      readonly type: 'up' | 'down' | 'enter' | 'escape' | 'backspace' | 'ctrl-c';
    }
  | {
      /** Printable character event / Событие печатного символа */
      readonly type: 'char';
      /** Decoded UTF-8 character / Распознанный UTF-8 символ */
      readonly value: string;
    };

/**
 * Reads and decodes raw terminal keystrokes into structured `KeyEvent` values.
 * Считывает и декодирует сырые нажатия клавиш терминала в структурированные события `KeyEvent`.
 */
export interface IInputController {
  /**
   * Activates raw input mode and begins dispatching decoded key events.
   * Активирует raw-режим и начинает передавать распознанные события клавиш.
   *
   * @param onKey - Listener invoked per decoded keystroke / Обработчик событий клавиатуры.
   */
  start(onKey: (event: KeyEvent) => void): void;

  /**
   * Restores cooked terminal mode and stops reading from stdin.
   * Возвращает обычный (cooked) режим терминала и останавливает чтение stdin.
   */
  stop(): void;
}

/**
 * Manages terminal alternate screen mode, cursor visibility, resize hooks, and signal cleanup.
 * Управляет альтернативным буфером экрана, видимостью курсора, ресайзом и очисткой при сигналах.
 */
export interface ITerminalLifecycle {
  /**
   * Enters alternate screen buffer, hides the cursor, and registers signal hooks.
   * Переходит в альтернативный буфер экрана, скрывает курсор и регистрирует обработчики сигналов.
   */
  enterTuiMode(): void;

  /**
   * Restores cursor visibility, exits alternate screen buffer, and removes signal hooks.
   * Возвращает видимость курсора, выходит из альтернативного буфера и снимает обработчики сигналов.
   */
  exitTuiMode(): void;

  /**
   * Subscribes to terminal resize events.
   * Подписывается на события изменения размера окна терминала.
   *
   * @param listener - Resize callback / Обработчик изменения размера.
   * @returns Unsubscribe function / Функция отписки.
   */
  onResize(listener: () => void): () => void;

  /**
   * Registers a callback invoked on `SIGINT` or `SIGTERM`.
   * Регистрирует обработчик сигналов прерывания `SIGINT` или `SIGTERM`.
   *
   * @param listener - Callback receiving signal name / Обработчик с именем сигнала.
   * @returns Unsubscribe function / Функция отписки.
   */
  onInterrupt(listener: (signalName: string) => void): () => void;
}

/**
 * Single virtual character cell inside the double-buffered screen grid.
 * Одна виртуальная ячейка символа внутри двойного буфера экрана.
 */
export interface BufferCell {
  /**
   * Single visible character rendered at this cell (default `' '`).
   * Один отображаемый символ в данной ячейке (по умолчанию пробел `' '`).
   */
  readonly char: string;

  /**
   * Concatenated ANSI SGR style sequence applied to this cell (empty string for default style).
   * Строка ANSI SGR-стилей, применяемая к этой ячейке (пустая строка для стандартного стиля).
   */
  readonly style: string;
}

/**
 * Contract for the virtual 2D screen buffer consumed by the differential renderer.
 * Контракт виртуального двумерного буфера экрана для дифференциального рендерера.
 */
export interface IScreenBuffer {
  /**
   * Width of the virtual screen in columns.
   * Ширина виртуального экрана в столбцах.
   */
  readonly width: number;

  /**
   * Height of the virtual screen in rows.
   * Высота виртуального экрана в строках.
   */
  readonly height: number;

  /**
   * Reads the cell at `(row, col)` or returns `undefined` if outside buffer bounds.
   * Возвращает ячейку по координатам `(row, col)` или `undefined` при выходе за границы.
   *
   * @param row - 0-based row index / 0-индексированный номер строки.
   * @param col - 0-based column index / 0-индексированный номер столбца.
   * @returns Virtual cell or `undefined` / Ячейка буфера или `undefined`.
   */
  getCell(row: number, col: number): BufferCell | undefined;
}

/**
 * Differential terminal renderer contract (Zero-Flicker double-buffering).
 * Контракт дифференциального рендерера терминала (двойная буферизация без мерцания).
 */
export interface IDiffRenderer {
  /**
   * Computes minimal cell differences against the previous frame and flushes atomically.
   * Вычисляет минимальные отличия от предыдущего кадра и атомарно выводит их в терминал.
   *
   * @param nextBuffer - Next virtual frame to render / Следующий виртуальный кадр для отрисовки.
   */
  render(nextBuffer: IScreenBuffer): void;

  /**
   * Forces a full redraw on the next `render` call (e.g., after terminal resize).
   * Сбрасывает кэш предыдущего кадра для полной перерисовки (например, при изменении размера окна).
   */
  invalidate(): void;

  /**
   * Releases cached frame references on shutdown.
   * Освобождает кэшированный буфер кадра при завершении работы.
   */
  dispose(): void;
}

/**
 * High-level interactive TUI controller contract used by `ApplicationService` (DIP).
 * Высокоуровневый контракт интерактивного TUI-контроллера для `ApplicationService` (инверсия зависимостей DIP).
 */
export interface ITuiController {
  /**
   * Launches the interactive preset/URL selection menu until the user exits.
   * Запускает интерактивное меню выбора цели до явного выхода пользователя.
   *
   * @param presets - Predefined targets loaded from config / Список пресетов из конфигурации.
   */
  runInteractiveMenu(presets: readonly PresetTarget[]): Promise<void>;

  /**
   * Runs a single benchmark directly in TTY TUI mode and returns the summary.
   * Выполняет одиночный замер в TTY-режиме TUI и возвращает итоговую сводку.
   *
   * @param targetUrl - Validated HTTP(S) target URL / Проверенный целевой URL.
   * @returns Completed `BenchmarkSummary` / Итоговая сводка замера.
   */
  runDirectBenchmark(targetUrl: URL): Promise<BenchmarkSummary>;
}

/**
 * Selectable entry in the interactive main menu.
 * Элемент списка выбора в главном интерактивном меню.
 */
export type MenuEntry =
  | {
      /** Predefined preset entry / Предустановленный пресет */
      readonly kind: 'preset';
      /** Preset target metadata / Метаданные пресета */
      readonly preset: PresetTarget;
    }
  | {
      /** Opens custom URL input prompt / Переход к ручному вводу URL */
      readonly kind: 'custom-url';
    }
  | {
      /** Cycles active UI language / Переключение языка интерфейса */
      readonly kind: 'toggle-language';
    }
  | {
      /** Exits the application / Выход из приложения */
      readonly kind: 'exit';
    };

/**
 * State snapshot used to render the interactive menu view.
 * Снимок состояния для отрисовки главного меню.
 */
export interface MenuViewState {
  /**
   * Ordered list of selectable menu entries.
   * Упорядоченный список доступных пунктов меню.
   */
  readonly entries: readonly MenuEntry[];

  /**
   * 0-based index of the currently highlighted menu entry.
   * 0-индексированный номер выделенного в данный момент пункта меню.
   */
  readonly selectedIndex: number;

  /**
   * Number of loaded presets (used to show empty-presets warning when `0`).
   * Количество загруженных пресетов (при `0` выводится предупреждение).
   */
  readonly presetsCount: number;
}

/**
 * State snapshot used to render the custom URL input prompt view.
 * Снимок состояния для экрана ручного ввода произвольного URL.
 */
export interface CustomUrlViewState {
  /**
   * Current raw text typed by the user.
   * Текущий текст URL, введенный пользователем.
   */
  readonly inputValue: string;

  /**
   * Optional localized validation error displayed beneath the input box.
   * Необязательная локализованная ошибка валидации под полем ввода.
   */
  readonly validationError?: string | undefined;
}

/**
 * State snapshot used to render the live benchmark progress view.
 * Снимок состояния для экрана живого прогресса замера скорости.
 */
export interface BenchmarkViewState {
  /**
   * Target HTTP(S) URL currently being benchmarked.
   * Целевой HTTP(S) URL, по которому выполняется замер.
   */
  readonly targetUrl: string;

  /**
   * 1-based index of the active request iteration.
   * 1-индексированный номер текущей итерации запроса.
   */
  readonly currentIteration: number;

  /**
   * Planned total number of iterations in the benchmark.
   * Плановое общее количество запросов в замере.
   */
  readonly totalIterations: number;

  /**
   * Current frame counter driving the Braille spinner animation.
   * Индекс текущего кадра анимации спиннера.
   */
  readonly spinnerFrameIndex: number;

  /**
   * Bytes downloaded so far within the currently active iteration.
   * Количество байт, скачанных в текущей незавершенной итерации.
   */
  readonly currentIterationBytes: number;

  /**
   * Total bytes downloaded across all completed iterations.
   * Суммарный объем байт по всем уже завершенным итерациям.
   */
  readonly totalDownloadedBytes: number;

  /**
   * Elapsed wall-clock time since the benchmark started in milliseconds.
   * Прошедшее время с начала замера в миллисекундах.
   */
  readonly elapsedMs: number;

  /**
   * Instantaneous throughput of the current stream in Mbps.
   * Мгновенная скорость скачивания текущего потока в Mbps.
   */
  readonly instantSpeedMbps: number;

  /**
   * Instantaneous throughput of the current stream in MB/s.
   * Мгновенная скорость скачивания текущего потока в MB/s.
   */
  readonly instantSpeedMBps: number;

  /**
   * Running weighted average throughput across completed iterations in Mbps.
   * Текущая средняя скорость по завершенным итерациям в Mbps.
   */
  readonly runningAvgMbps: number;

  /**
   * Running weighted average throughput across completed iterations in MB/s.
   * Текущая средняя скорость по завершенным итерациям в MB/s.
   */
  readonly runningAvgMBps: number;

  /**
   * Metrics collected from iterations completed so far.
   * Массив метрик уже завершенных итераций.
   */
  readonly completedMetrics: readonly IterationMetric[];

  /**
   * Optional active retry notification banner shown during backoff pauses.
   * Необязательный баннер с информацией об ожидании перед повтором запроса.
   */
  readonly retryBanner?: string | undefined;

  /**
   * Whether the user requested cancellation and the active stream is winding down.
   * Признак того, что пользователь запросил прерывание и поток останавливается.
   */
  readonly aborting: boolean;
}

/**
 * State snapshot used to render the final benchmark report view.
 * Снимок состояния для экрана итогового отчета замера.
 */
export interface SummaryViewState {
  /**
   * Aggregated benchmark summary to display.
   * Агрегированные итоги замера для отображения.
   */
  readonly summary: BenchmarkSummary;
}

/**
 * State snapshot used to render an inline recoverable error view.
 * Снимок состояния для экрана восстановимой ошибки ресурса.
 */
export interface ErrorViewState {
  /**
   * Localized human-readable error message.
   * Локализованное сообщение об ошибке.
   */
  readonly message: string;

  /**
   * Optional target URL that triggered the error.
   * Необязательный целевой URL, при обращении к которому произошел сбой.
   */
  readonly targetUrl?: string | undefined;
}
