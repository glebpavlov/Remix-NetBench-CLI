import { describe, expect, it } from 'vitest';
import { ANSI, TUI_GLYPHS } from '../src/tui/ansi.constants';
import { ScreenBuffer } from '../src/tui/screen.buffer';

describe('ScreenBuffer (Виртуальная 2D-сетка экрана)', () => {
  it('clips text writes cleanly at screen edges and sanitizes newlines/tabs / обрезает текст по краям экрана и заменяет переносы/табы пробелами', () => {
    const buffer = new ScreenBuffer(10, 3);
    buffer.drawText(0, 7, 'Hello\nWorld', ANSI.BOLD);

    expect(buffer.getCell(0, 7)).toEqual({ char: 'H', style: ANSI.BOLD });
    expect(buffer.getCell(0, 8)).toEqual({ char: 'e', style: ANSI.BOLD });
    expect(buffer.getCell(0, 9)).toEqual({ char: 'l', style: ANSI.BOLD });
    expect(buffer.getCell(0, 10)).toBeUndefined();

    // Negative col clips leading characters safely
    buffer.drawText(1, -2, 'ABCD');
    expect(buffer.getCell(1, 0)?.char).toBe('C');
    expect(buffer.getCell(1, 1)?.char).toBe('D');
  });

  it('renders progress bars with clamped ratio and brackets / рисует шкалу прогресса с ограничением доли в [0, 1]', () => {
    const buffer = new ScreenBuffer(20, 2);
    buffer.drawProgressBar(0, 1, 10, 0.5);

    expect(buffer.getCell(0, 1)?.char).toBe(TUI_GLYPHS.PROGRESS_OPEN);
    expect(buffer.getCell(0, 2)?.char).toBe(TUI_GLYPHS.PROGRESS_FILLED);
    expect(buffer.getCell(0, 6)?.char).toBe(TUI_GLYPHS.PROGRESS_FILLED);
    expect(buffer.getCell(0, 7)?.char).toBe(TUI_GLYPHS.PROGRESS_EMPTY);
    expect(buffer.getCell(0, 12)?.char).toBe(TUI_GLYPHS.PROGRESS_CLOSE);
  });

  it('fills rectangular areas and draws horizontal rules / заполняет прямоугольники и рисует горизонтальные разделители', () => {
    const buffer = new ScreenBuffer(8, 4);
    buffer.fillRect(1, 1, 2, 3, '*', ANSI.FG_CYAN);
    buffer.drawHorizontalRule(3, 0, 5, ANSI.DIM);

    expect(buffer.getCell(1, 1)).toEqual({ char: '*', style: ANSI.FG_CYAN });
    expect(buffer.getCell(2, 3)).toEqual({ char: '*', style: ANSI.FG_CYAN });
    expect(buffer.getCell(3, 0)).toEqual({ char: TUI_GLYPHS.HORIZONTAL_RULE, style: ANSI.DIM });
    expect(buffer.getCell(3, 4)).toEqual({ char: TUI_GLYPHS.HORIZONTAL_RULE, style: ANSI.DIM });
    expect(buffer.getCell(3, 5)).toEqual({ char: TUI_GLYPHS.SPACE, style: '' });
  });
});
