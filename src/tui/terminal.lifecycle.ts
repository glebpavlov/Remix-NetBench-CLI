import { ANSI } from './ansi.constants';
import { TUI_LAYOUT } from './tui-layout.constants';
import type { ITerminalLifecycle, ITerminalOutputStream } from './tui.types';

/**
 * Node.js `process.stdout` adapter implementing `ITerminalOutputStream`.
 * Адаптер потока `process.stdout` Node.js, реализующий контракт `ITerminalOutputStream`.
 */
export class NodeTerminalOutputStream implements ITerminalOutputStream {
  private readonly stream: NodeJS.WriteStream;

  /**
   * Wraps a Node.js writable TTY stream (typically `process.stdout`).
   * Оборачивает поток записи Node.js (как правило, `process.stdout`).
   *
   * @param stream - Underlying Node.js write stream / Базовый поток вывода.
   */
  public constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
  }

  /**
   * Current terminal column count, defaulting safely to `TUI_LAYOUT.DEFAULT_TERMINAL.COLUMNS` (80) in non-TTY mode.
   * Текущее число столбцов терминала (по умолчанию `80` вне TTY).
   *
   * @returns Terminal width in columns / Ширина терминала в столбцах.
   */
  public get columns(): number {
    return this.stream.columns > 0 ? this.stream.columns : TUI_LAYOUT.DEFAULT_TERMINAL.COLUMNS;
  }

  /**
   * Current terminal row count, defaulting safely to `TUI_LAYOUT.DEFAULT_TERMINAL.ROWS` (24) in non-TTY mode.
   * Текущее число строк терминала (по умолчанию `24` вне TTY).
   *
   * @returns Terminal height in rows / Высота терминала в строках.
   */
  public get rows(): number {
    return this.stream.rows > 0 ? this.stream.rows : TUI_LAYOUT.DEFAULT_TERMINAL.ROWS;
  }

  /**
   * Indicates whether the underlying stream is attached to an interactive TTY.
   * Показывает, подключен ли поток к интерактивному TTY-терминалу.
   */
  public get isTTY(): boolean {
    return this.stream.isTTY;
  }

  /**
   * Writes a string chunk directly to the underlying stream.
   * Записывает строковый фрагмент напрямую в поток вывода.
   *
   * @param chunk - String chunk to write / Записываемая строка.
   * @returns `true` if the stream accepts further writes immediately / `true`, если буфер не переполнен.
   */
  public write(chunk: string): boolean {
    return this.stream.write(chunk);
  }

  /**
   * Subscribes to terminal resize events and returns an unsubscribe callback.
   * Подписывается на событие изменения размеров окна терминала.
   *
   * @param listener - Callback executed on resize / Обработчик события `resize`.
   * @returns Unsubscribe function / Функция отписки.
   */
  public onResize(listener: () => void): () => void {
    this.stream.on('resize', listener);
    return () => {
      this.stream.off('resize', listener);
    };
  }
}

/**
 * Manages entering/exiting alternate screen mode, hiding/restoring the cursor,
 * listening for resize events, and restoring terminal state on `SIGINT`/`SIGTERM`.
 *
 * Управляет входом и выходом из альтернативного экрана терминала, скрытием/показом курсора,
 * подпиской на изменение размера окна и безопасным восстановлением терминала при `SIGINT`/`SIGTERM`.
 */
export class TerminalLifecycle implements ITerminalLifecycle {
  private readonly output: ITerminalOutputStream;
  private active = false;
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;
  private readonly interruptListeners = new Set<(signalName: string) => void>();

  /**
   * Creates a terminal lifecycle manager for the given output stream.
   * Создает менеджер жизненного цикла терминала для указанного выходного потока.
   *
   * @param output - Terminal output stream abstraction / Абстракция выходного потока.
   */
  public constructor(output: ITerminalOutputStream) {
    this.output = output;
  }

  /**
   * Enters alternate screen buffer, hides the cursor, and registers signal handlers.
   * Переключается в альтернативный экран, скрывает курсор и регистрирует обработчики сигналов.
   */
  public enterTuiMode(): void {
    if (this.active) {
      return;
    }
    this.active = true;

    if (this.output.isTTY) {
      this.output.write(`${ANSI.ENTER_ALT_SCREEN}${ANSI.HIDE_CURSOR}`);
    }

    this.sigintHandler = () => {
      this.notifyInterrupt('SIGINT');
    };
    this.sigtermHandler = () => {
      this.notifyInterrupt('SIGTERM');
    };

    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }

  /**
   * Restores cursor visibility, exits alternate screen buffer, and unregisters signal handlers.
   * Safe to call multiple times (idempotent).
   *
   * Восстанавливает курсор, выходит из альтернативного буфера экрана и снимает обработчики сигналов.
   * Идемпотентный метод: безопасен при повторных вызовах.
   */
  public exitTuiMode(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    if (this.sigintHandler !== null) {
      process.off('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }
    if (this.sigtermHandler !== null) {
      process.off('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }

    if (this.output.isTTY) {
      this.output.write(`${ANSI.RESET}${ANSI.SHOW_CURSOR}${ANSI.EXIT_ALT_SCREEN}`);
    }
  }

  /**
   * Subscribes to terminal resize events.
   * Подписывается на события изменения размеров терминала.
   *
   * @param listener - Callback executed on resize / Обработчик изменения размера.
   * @returns Unsubscribe function / Функция отписки.
   */
  public onResize(listener: () => void): () => void {
    return this.output.onResize(listener);
  }

  /**
   * Registers a callback invoked on `SIGINT` or `SIGTERM`.
   * Регистрирует обработчик сигналов прерывания `SIGINT` / `SIGTERM`.
   *
   * @param listener - Callback receiving the signal name / Обработчик с именем сигнала.
   * @returns Unsubscribe function / Функция отписки.
   */
  public onInterrupt(listener: (signalName: string) => void): () => void {
    this.interruptListeners.add(listener);
    return () => {
      this.interruptListeners.delete(listener);
    };
  }

  private notifyInterrupt(signalName: string): void {
    for (const listener of this.interruptListeners) {
      listener(signalName);
    }
  }
}
