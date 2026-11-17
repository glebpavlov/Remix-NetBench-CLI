import { ANSI, TUI_GLYPHS, cursorTo } from './ansi.constants';
import type { BufferCell, IDiffRenderer, IScreenBuffer, ITerminalOutputStream } from './tui.types';

const EMPTY_CELL: BufferCell = { char: TUI_GLYPHS.SPACE, style: '' };

/**
 * Zero-flicker differential terminal renderer.
 * Compares the next virtual frame cell-by-cell against the previously flushed frame
 * and emits ANSI cursor-positioning sequences ONLY for contiguous changed cell runs,
 * flushing the entire frame delta in a single atomic `stdout.write` call.
 *
 * Дифференциальный рендерер терминала без мерцания (Zero-Flicker).
 * Поячеечно сравнивает новый виртуальный кадр с предыдущим и генерирует ANSI-команды
 * позиционирования курсора ТОЛЬКО для изменившихся непрерывных сегментов,
 * отправляя весь кадр одним атомарным вызовом `write`.
 */
export class DiffRenderer implements IDiffRenderer {
  private readonly output: ITerminalOutputStream;
  private previousBuffer: IScreenBuffer | null = null;

  /**
   * Creates a differential renderer bound to an injected terminal output stream.
   * Создает дифференциальный рендерер, привязанный к выходному потоку терминала.
   *
   * @param output - Terminal output stream abstraction / Абстракция выходного потока терминала.
   */
  public constructor(output: ITerminalOutputStream) {
    this.output = output;
  }

  /**
   * Computes the minimal ANSI delta between the previous frame and `nextBuffer`
   * and writes it atomically to the output stream.
   *
   * Вычисляет минимальную ANSI-дельту между предыдущим и новым кадром `nextBuffer`
   * и записывает ее одним вызовом в поток вывода.
   *
   * @param nextBuffer - Next virtual frame to display / Следующий виртуальный кадр.
   */
  public render(nextBuffer: IScreenBuffer): void {
    const prev = this.previousBuffer;
    const isFullRedraw =
      prev === null || prev.width !== nextBuffer.width || prev.height !== nextBuffer.height;

    const chunks: string[] = [];

    if (isFullRedraw) {
      this.renderFullRedraw(nextBuffer, chunks);
    } else {
      this.renderDelta(prev, nextBuffer, chunks);
    }

    if (chunks.length > 0) {
      this.output.write(chunks.join(''));
    }

    this.previousBuffer = nextBuffer;
  }

  /**
   * Invalidates the cached previous frame (e.g., on terminal resize)
   * so the next render refreshes all lines cleanly without `\x1bc`.
   *
   * Сбрасывает кэш предыдущего кадра (например, при ресайзе терминала),
   * чтобы следующая отрисовка полностью обновила строки без полного сброса экрана.
   */
  public invalidate(): void {
    this.previousBuffer = null;
  }

  /**
   * Releases cached frame state on disposal.
   * Освобождает кэшированный буфер кадра при завершении работы.
   */
  public dispose(): void {
    this.previousBuffer = null;
  }

  private renderFullRedraw(nextBuffer: IScreenBuffer, chunks: string[]): void {
    let activeStyle = '';

    for (let row = 0; row < nextBuffer.height; row += 1) {
      chunks.push(cursorTo(row + 1, 1), ANSI.CLEAR_LINE);

      const lastNonEmptyCol = this.findLastNonEmptyCol(nextBuffer, row);
      for (let col = 0; col <= lastNonEmptyCol; col += 1) {
        const cell = nextBuffer.getCell(row, col) ?? EMPTY_CELL;
        activeStyle = this.writeCellWithStyle(cell, activeStyle, chunks);
      }

      if (activeStyle !== '') {
        chunks.push(ANSI.RESET);
        activeStyle = '';
      }
    }
  }

  private renderDelta(prev: IScreenBuffer, next: IScreenBuffer, chunks: string[]): void {
    for (let row = 0; row < next.height; row += 1) {
      let col = 0;

      while (col < next.width) {
        const prevCell = prev.getCell(row, col) ?? EMPTY_CELL;
        const nextCell = next.getCell(row, col) ?? EMPTY_CELL;

        if (this.cellsEqual(prevCell, nextCell)) {
          col += 1;
          continue;
        }

        // Flush a contiguous run of changed cells on this row starting at `col`.
        // Выводим непрерывный фрагмент изменившихся ячеек, начиная с `col`.
        col = this.flushChangedRun(prev, next, row, col, chunks);
      }
    }
  }

  private flushChangedRun(
    prev: IScreenBuffer,
    next: IScreenBuffer,
    row: number,
    startCol: number,
    chunks: string[],
  ): number {
    chunks.push(cursorTo(row + 1, startCol + 1));

    let col = startCol;
    let activeStyle = '';

    while (col < next.width) {
      const prevCell = prev.getCell(row, col) ?? EMPTY_CELL;
      const nextCell = next.getCell(row, col) ?? EMPTY_CELL;

      if (this.cellsEqual(prevCell, nextCell)) {
        break;
      }

      activeStyle = this.writeCellWithStyle(nextCell, activeStyle, chunks);
      col += 1;
    }

    if (activeStyle !== '') {
      chunks.push(ANSI.RESET);
    }

    return col;
  }

  private findLastNonEmptyCol(buffer: IScreenBuffer, row: number): number {
    // Trim trailing unstyled spaces to keep full redraw sequences compact.
    // Отбрасываем хвостовые нестилизованные пробелы, чтобы уменьшить объем вывода.
    for (let col = buffer.width - 1; col >= 0; col -= 1) {
      const cell = buffer.getCell(row, col) ?? EMPTY_CELL;
      if (cell.char !== TUI_GLYPHS.SPACE || cell.style !== '') {
        return col;
      }
    }
    return -1;
  }

  private writeCellWithStyle(cell: BufferCell, activeStyle: string, chunks: string[]): string {
    let nextActiveStyle = activeStyle;

    if (cell.style !== activeStyle) {
      if (activeStyle !== '') {
        chunks.push(ANSI.RESET);
      }
      if (cell.style !== '') {
        chunks.push(cell.style);
      }
      nextActiveStyle = cell.style;
    }

    chunks.push(cell.char);
    return nextActiveStyle;
  }

  private cellsEqual(a: BufferCell, b: BufferCell): boolean {
    return a.char === b.char && a.style === b.style;
  }
}
