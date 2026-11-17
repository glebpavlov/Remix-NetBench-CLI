import { describe, expect, it } from 'vitest';
import { ANSI, cursorTo } from '../src/tui/ansi.constants';
import { DiffRenderer } from '../src/tui/diff.renderer';
import { ScreenBuffer } from '../src/tui/screen.buffer';
import type { ITerminalOutputStream } from '../src/tui/tui.types';

class MockStdoutStream implements ITerminalOutputStream {
  public columns: number;
  public rows: number;
  public readonly isTTY = true;
  public readonly writes: string[] = [];

  public constructor(columns = 40, rows = 10) {
    this.columns = columns;
    this.rows = rows;
  }

  public write(chunk: string): boolean {
    this.writes.push(chunk);
    return true;
  }

  public onResize(_listener: () => void): () => void {
    return () => undefined;
  }
}

describe('DiffRenderer (Zero-Flicker дифференциальный рендеринг)', () => {
  it('never clears the whole terminal with RIS (\\x1bc) and emits nothing when frame is unchanged / не использует полный сброс и не пишет в stdout при неизменном кадре', () => {
    const stdout = new MockStdoutStream(40, 6);
    const renderer = new DiffRenderer(stdout);

    const frame1 = new ScreenBuffer(40, 6);
    frame1.drawText(0, 0, 'Header Line', ANSI.BOLD);
    frame1.drawText(2, 0, 'Progress: 10%', ANSI.FG_GREEN);

    renderer.render(frame1);
    expect(stdout.writes).toHaveLength(1);
    expect(stdout.writes[0]).not.toContain(ANSI.FULL_RESET);

    // Render identical frame -> zero stdout writes!
    // Отрисовка идентичного кадра -> ноль записей в stdout!
    const frame2 = new ScreenBuffer(40, 6);
    frame2.drawText(0, 0, 'Header Line', ANSI.BOLD);
    frame2.drawText(2, 0, 'Progress: 10%', ANSI.FG_GREEN);

    renderer.render(frame2);
    expect(stdout.writes).toHaveLength(1);
  });

  it('updates only the exact changed cells on subsequent frames / обновляет только изменившиеся сегменты ячеек', () => {
    const stdout = new MockStdoutStream(40, 6);
    const renderer = new DiffRenderer(stdout);

    const frame1 = new ScreenBuffer(40, 6);
    frame1.drawText(0, 0, 'Static Header', ANSI.BOLD);
    frame1.drawText(2, 0, 'Speed: 10.0 Mbps', ANSI.FG_CYAN);
    renderer.render(frame1);

    const frame2 = new ScreenBuffer(40, 6);
    frame2.drawText(0, 0, 'Static Header', ANSI.BOLD);
    frame2.drawText(2, 0, 'Speed: 25.0 Mbps', ANSI.FG_CYAN);
    renderer.render(frame2);

    expect(stdout.writes).toHaveLength(2);
    const delta = stdout.writes[1] ?? '';

    // Row 0 ('Static Header') must NOT be rewritten
    // Строка 0 ('Static Header') не должна перезаписываться повторно
    expect(delta).not.toContain('Static Header');
    // Only '25' at row 3 (1-based), col 8 (1-based: 'Speed: ' is 7 chars -> col 8) should be addressed
    // Обновляется только фрагмент '25' в строке 3 (с 1), столбце 8 (с 1)
    expect(delta).toContain(cursorTo(3, 8));
    expect(delta).toContain('25');
    expect(delta).not.toContain('Mbps');
  });

  it('detects style-only changes even when characters remain identical / реагирует на изменение стиля даже при тех же символах', () => {
    const stdout = new MockStdoutStream(30, 4);
    const renderer = new DiffRenderer(stdout);

    const frame1 = new ScreenBuffer(30, 4);
    frame1.drawText(1, 2, 'Item', ANSI.FG_WHITE);
    renderer.render(frame1);

    const frame2 = new ScreenBuffer(30, 4);
    frame2.drawText(1, 2, 'Item', `${ANSI.BOLD}${ANSI.FG_BRIGHT_GREEN}`);
    renderer.render(frame2);

    expect(stdout.writes).toHaveLength(2);
    const delta = stdout.writes[1] ?? '';
    expect(delta).toContain(cursorTo(2, 3));
    expect(delta).toContain(ANSI.FG_BRIGHT_GREEN);
    expect(delta).toContain('Item');
    expect(delta).toContain(ANSI.RESET);
  });

  it('performs full redraw when terminal dimensions change, buffer is invalidated, or disposed / перерисовывает кадр целиком при ресайзе, invalidate() и dispose()', () => {
    const stdout = new MockStdoutStream(40, 6);
    const renderer = new DiffRenderer(stdout);

    const frame1 = new ScreenBuffer(40, 6);
    frame1.drawText(0, 0, 'Line 1');
    renderer.render(frame1);

    // Resize to 50x8
    const resizedFrame = new ScreenBuffer(50, 8);
    resizedFrame.drawText(0, 0, 'Line 1');
    renderer.render(resizedFrame);

    expect(stdout.writes).toHaveLength(2);
    expect(stdout.writes[1]).toContain(cursorTo(8, 1));

    // Explicit invalidate forces redraw even with identical content
    renderer.invalidate();
    renderer.render(resizedFrame);
    expect(stdout.writes).toHaveLength(3);

    // Dispose clears cached previous buffer so next render also performs full redraw
    renderer.dispose();
    renderer.render(resizedFrame);
    expect(stdout.writes).toHaveLength(4);
  });
});
