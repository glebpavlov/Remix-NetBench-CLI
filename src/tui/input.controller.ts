import { ANSI, ASCII_CONTROL } from './ansi.constants';
import type { IInputController, ITerminalInputStream, KeyEvent } from './tui.types';

/**
 * Node.js `process.stdin` adapter implementing `ITerminalInputStream`.
 * Адаптер входного потока `process.stdin` Node.js, реализующий `ITerminalInputStream`.
 */
export class NodeTerminalInputStream implements ITerminalInputStream {
  private readonly stream: NodeJS.ReadStream;

  /**
   * Wraps a Node.js readable TTY stream (typically `process.stdin`).
   * Оборачивает читаемый поток Node.js (обычно `process.stdin`).
   *
   * @param stream - Underlying Node.js read stream / Базовый поток чтения.
   */
  public constructor(stream: NodeJS.ReadStream = process.stdin) {
    this.stream = stream;
  }

  /**
   * Indicates whether the input stream is attached to a TTY.
   * Признак подключения входного потока к интерактивному TTY.
   */
  public get isTTY(): boolean {
    return this.stream.isTTY;
  }

  /**
   * Toggles raw mode when supported by the underlying TTY stream.
   * Переключает raw-режим ввода, если поток поддерживает `setRawMode`.
   *
   * @param mode - `true` to enable raw keystroke delivery / `true` для включения raw-режима.
   */
  public setRawMode(mode: boolean): void {
    if (typeof this.stream.setRawMode === 'function') {
      this.stream.setRawMode(mode);
    }
  }

  /**
   * Resumes reading from stdin.
   * Возобновляет чтение из stdin.
   */
  public resume(): void {
    this.stream.resume();
  }

  /**
   * Pauses reading from stdin.
   * Приостанавливает чтение из stdin.
   */
  public pause(): void {
    this.stream.pause();
  }

  /**
   * Subscribes to raw data chunks and returns an unsubscribe callback.
   * Подписывается на получение сырых чанков данных и возвращает функцию отписки.
   *
   * @param listener - Callback receiving raw `Buffer` chunks / Обработчик буфера байтов.
   * @returns Unsubscribe function / Функция отписки.
   */
  public onData(listener: (chunk: Buffer) => void): () => void {
    this.stream.on('data', listener);
    return () => {
      this.stream.off('data', listener);
    };
  }
}

/**
 * Decodes raw terminal keystroke sequences into normalized `KeyEvent` objects.
 * Декодирует сырые последовательности клавиш терминала в нормализованные события `KeyEvent`.
 */
export class InputController implements IInputController {
  private readonly input: ITerminalInputStream;
  private unsubscribeData: (() => void) | null = null;
  private active = false;

  /**
   * Creates an input controller bound to an injected terminal input stream.
   * Создает контроллер клавиатурного ввода для указанного входного потока.
   *
   * @param input - Terminal input stream abstraction / Абстракция входного потока.
   */
  public constructor(input: ITerminalInputStream) {
    this.input = input;
  }

  /**
   * Activates raw mode and starts dispatching decoded keyboard events.
   * Включает raw-режим и начинает передачу распознанных событий клавиш.
   *
   * @param onKey - Listener invoked for each decoded `KeyEvent` / Обработчик каждого события клавиши.
   */
  public start(onKey: (event: KeyEvent) => void): void {
    if (this.active) {
      return;
    }
    this.active = true;

    if (this.input.isTTY && this.input.setRawMode !== undefined) {
      this.input.setRawMode(true);
    }
    this.input.resume();

    this.unsubscribeData = this.input.onData((chunk) => {
      for (const event of decodeKeyChunk(chunk)) {
        onKey(event);
      }
    });
  }

  /**
   * Restores cooked terminal mode and pauses the input stream.
   * Возвращает обычный режим терминала и приостанавливает поток ввода.
   */
  public stop(): void {
    if (!this.active) {
      return;
    }
    this.active = false;

    if (this.unsubscribeData !== null) {
      this.unsubscribeData();
      this.unsubscribeData = null;
    }

    if (this.input.isTTY && this.input.setRawMode !== undefined) {
      this.input.setRawMode(false);
    }
    this.input.pause();
  }
}

/**
 * Pure helper decoding a raw `Buffer` from stdin into one or more `KeyEvent` objects.
 * Чистая функция декодирования сырого `Buffer` из stdin в массив событий `KeyEvent`.
 *
 * @param chunk - Raw byte chunk from stdin / Сырой буфер байтов из stdin.
 * @returns Array of decoded `KeyEvent` items / Массив распознанных событий клавиатуры.
 *
 * @example
 * decodeKeyChunk(Buffer.from('\x1b[A')); // [{ type: 'up' }]
 */
export function decodeKeyChunk(chunk: Buffer): KeyEvent[] {
  const raw = chunk.toString('utf8');
  const events: KeyEvent[] = [];
  let index = 0;

  while (index < raw.length) {
    const arrowMatch = matchArrowSequence(raw, index);
    if (arrowMatch !== null) {
      events.push(arrowMatch.event);
      index += arrowMatch.consumedLength;
      continue;
    }

    const code = raw.charCodeAt(index);
    const controlResult = decodeSingleCode(raw, index, code);
    if (controlResult.event !== undefined) {
      events.push(controlResult.event);
    }
    index += controlResult.consumedLength;
  }

  return events;
}

function matchArrowSequence(
  raw: string,
  index: number,
): { readonly event: KeyEvent; readonly consumedLength: number } | null {
  if (raw.startsWith(ANSI.KEY_UP_CSI, index) || raw.startsWith(ANSI.KEY_UP_SS3, index)) {
    return { event: { type: 'up' }, consumedLength: ASCII_CONTROL.ARROW_SEQUENCE_LENGTH };
  }

  if (raw.startsWith(ANSI.KEY_DOWN_CSI, index) || raw.startsWith(ANSI.KEY_DOWN_SS3, index)) {
    return { event: { type: 'down' }, consumedLength: ASCII_CONTROL.ARROW_SEQUENCE_LENGTH };
  }

  return null;
}

function decodeSingleCode(
  raw: string,
  index: number,
  code: number,
): { readonly event?: KeyEvent; readonly consumedLength: number } {
  if (code === ASCII_CONTROL.CTRL_C) {
    return { event: { type: 'ctrl-c' }, consumedLength: 1 };
  }

  if (code === ASCII_CONTROL.CARRIAGE_RETURN || code === ASCII_CONTROL.LINE_FEED) {
    return { event: { type: 'enter' }, consumedLength: 1 };
  }

  if (code === ASCII_CONTROL.BACKSPACE_DEL || code === ASCII_CONTROL.BACKSPACE_BS) {
    return { event: { type: 'backspace' }, consumedLength: 1 };
  }

  if (code === ASCII_CONTROL.ESCAPE) {
    // Skip unrecognized 3-byte CSI sequences (e.g. Left/Right arrows) instead of treating them as Esc.
    // Пропускаем неизвестные 3-байтные CSI-последовательности (например, стрелки влево/вправо), не путая их с Esc.
    if (index + 1 < raw.length && raw[index + 1] === ANSI.CSI_BRACKET) {
      return { consumedLength: ASCII_CONTROL.ARROW_SEQUENCE_LENGTH };
    }
    return { event: { type: 'escape' }, consumedLength: 1 };
  }

  if (code >= ASCII_CONTROL.PRINTABLE_MIN) {
    const char = raw[index];
    if (char !== undefined) {
      return { event: { type: 'char', value: char }, consumedLength: 1 };
    }
  }

  return { consumedLength: 1 };
}
