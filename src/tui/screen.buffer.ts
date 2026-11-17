import { ANSI, TUI_GLYPHS } from './ansi.constants';
import { TUI_LAYOUT } from './tui-layout.constants';
import type { BufferCell, IScreenBuffer } from './tui.types';

const EMPTY_CELL: BufferCell = { char: TUI_GLYPHS.SPACE, style: '' };

/**
 * Double-buffered 2D virtual terminal screen grid.
 * Stores exact character and ANSI style per cell, clipping all writes cleanly
 * to terminal bounds to prevent line-wrapping artifacts.
 *
 * Виртуальная двумерная сетка экрана терминала для двойной буферизации.
 * Хранит точный символ и ANSI-стиль каждой ячейки, аккуратно обрезая вывод по границам экрана
 * для исключения артефактов переноса строк.
 */
export class ScreenBuffer implements IScreenBuffer {
  /**
   * Virtual screen width in columns / Ширина виртуального экрана в столбцах.
   */
  public readonly width: number;

  /**
   * Virtual screen height in rows / Высота виртуального экрана в строках.
   */
  public readonly height: number;

  private readonly cells: BufferCell[][];

  /**
   * Allocates a blank virtual screen buffer with the given dimensions.
   * Создает пустой виртуальный буфер экрана заданных размеров.
   *
   * @param width - Terminal width in columns (`>= 1`) / Ширина терминала в столбцах (`>= 1`).
   * @param height - Terminal height in rows (`>= 1`) / Высота терминала в строках (`>= 1`).
   */
  public constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => EMPTY_CELL),
    );
  }

  /**
   * Returns the virtual cell at `(row, col)` or `undefined` if out of bounds.
   * Возвращает ячейку буфера по координатам `(row, col)` или `undefined`, если координаты вне границ.
   *
   * @param row - 0-based row index / 0-индексированная строка.
   * @param col - 0-based column index / 0-индексированный столбец.
   * @returns `BufferCell` or `undefined` / Объект ячейки или `undefined`.
   */
  public getCell(row: number, col: number): BufferCell | undefined {
    const rowData = this.cells[row];
    if (rowData === undefined) {
      return undefined;
    }
    return rowData[col];
  }

  /**
   * Draws a text string starting at `(row, col)` with optional ANSI style,
   * clipping cleanly at the right edge of the virtual screen.
   *
   * Выводит строку текста начиная с позиции `(row, col)` с необязательным ANSI-стилем,
   * безопасно обрезая символы, выходящие за правую границу экрана.
   *
   * @param row - 0-based target row index / Номер строки (с 0).
   * @param col - 0-based starting column index / Начальный столбец (с 0).
   * @param text - Plain text string to render / Текст для отрисовки.
   * @param style - Concatenated ANSI SGR codes (defaults to `''`) / ANSI-стиль (по умолчанию пустой).
   */
  public drawText(row: number, col: number, text: string, style = ''): void {
    if (row < 0 || row >= this.height || col >= this.width) {
      return;
    }

    const targetRow = this.cells[row];
    if (targetRow === undefined) {
      return;
    }

    // Replace control whitespace with spaces so raw newlines/tabs never corrupt grid coordinates.
    // Заменяем управляющие переносы и табы пробелами, чтобы не нарушить координаты сетки.
    const sanitized = text.replace(/[\r\n\t]/g, TUI_GLYPHS.SPACE);
    let currentCol = col;

    for (const ch of sanitized) {
      if (currentCol >= this.width) {
        break;
      }
      if (currentCol >= 0) {
        targetRow[currentCol] = { char: ch, style };
      }
      currentCol += 1;
    }
  }

  /**
   * Fills a rectangular region with a character and style.
   * Заполняет прямоугольную область заданным символом и стилем.
   *
   * @param startRow - Top-left row index / Начальная строка.
   * @param startCol - Top-left column index / Начальный столбец.
   * @param rows - Rectangle height in rows / Высота прямоугольника в строках.
   * @param cols - Rectangle width in columns / Ширина прямоугольника в столбцах.
   * @param char - Fill glyph (defaults to space) / Символ заполнения.
   * @param style - ANSI style string (defaults to `''`) / ANSI-стиль.
   */
  public fillRect(
    startRow: number,
    startCol: number,
    rows: number,
    cols: number,
    char: string = TUI_GLYPHS.SPACE,
    style = '',
  ): void {
    const maxRow = Math.min(this.height, startRow + rows);
    const maxCol = Math.min(this.width, startCol + cols);

    for (let r = Math.max(0, startRow); r < maxRow; r += 1) {
      const targetRow = this.cells[r];
      if (targetRow === undefined) {
        continue;
      }
      for (let c = Math.max(0, startCol); c < maxCol; c += 1) {
        targetRow[c] = { char, style };
      }
    }
  }

  /**
   * Draws a horizontal divider line across the specified row and column span.
   * Рисует горизонтальную разделительную линию на указанной строке и ширине.
   *
   * @param row - 0-based row index / Индекс строки.
   * @param startCol - Starting column index (defaults to `0`) / Начальный столбец.
   * @param length - Optional span length (defaults to remaining width) / Длина линии.
   * @param style - ANSI style (defaults to `ANSI.DIM`) / Стиль линии (по умолчанию `ANSI.DIM`).
   */
  public drawHorizontalRule(row: number, startCol = 0, length?: number, style = ANSI.DIM): void {
    const span = length ?? this.width - startCol;
    if (span <= 0) {
      return;
    }
    this.drawText(row, startCol, TUI_GLYPHS.HORIZONTAL_RULE.repeat(span), style);
  }

  /**
   * Renders a clean Unicode progress bar at `(row, col)` with the given width and ratio `[0, 1]`.
   * Рисует Unicode-шкалу прогресса в позиции `(row, col)` с заданной шириной и долей `[0, 1]`.
   *
   * @param row - 0-based row index / Строка отрисовки.
   * @param col - 0-based starting column index / Начальный столбец.
   * @param barWidth - Inner width of the progress track (clamped `>= 4`) / Внутренняя ширина шкалы (`>= 4`).
   * @param ratio - Completion ratio clamped to `[0, 1]` / Доля выполнения `[0, 1]`.
   * @param filledStyle - Style for filled blocks / Стиль заполненной части.
   * @param emptyStyle - Style for unfilled track / Стиль пустой части.
   */
  public drawProgressBar(
    row: number,
    col: number,
    barWidth: number,
    ratio: number,
    filledStyle = ANSI.FG_BRIGHT_GREEN,
    emptyStyle = ANSI.FG_BRIGHT_BLACK,
  ): void {
    const clampedWidth = Math.max(TUI_LAYOUT.BENCHMARK.PROGRESS_BAR_BUFFER_MIN, barWidth);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const filledCount = Math.round(clampedWidth * clampedRatio);
    const emptyCount = clampedWidth - filledCount;

    this.drawText(row, col, TUI_GLYPHS.PROGRESS_OPEN, ANSI.DIM);
    this.drawText(row, col + 1, TUI_GLYPHS.PROGRESS_FILLED.repeat(filledCount), filledStyle);
    this.drawText(
      row,
      col + 1 + filledCount,
      TUI_GLYPHS.PROGRESS_EMPTY.repeat(emptyCount),
      emptyStyle,
    );
    this.drawText(row, col + 1 + clampedWidth, TUI_GLYPHS.PROGRESS_CLOSE, ANSI.DIM);
  }
}
