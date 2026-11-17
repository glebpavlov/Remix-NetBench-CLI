import { describe, expect, it } from 'vitest';
import { ANSI } from '../src/tui/ansi.constants';
import { TerminalLifecycle } from '../src/tui/terminal.lifecycle';
import type { ITerminalOutputStream } from '../src/tui/tui.types';

describe('TerminalLifecycle (Управление альтернативным экраном и курсором)', () => {
  function createMockOutput(isTTY: boolean): {
    stream: ITerminalOutputStream;
    writes: string[];
    triggerResize: () => void;
  } {
    const writes: string[] = [];
    let resizeListener: (() => void) | null = null;

    return {
      stream: {
        columns: 80,
        rows: 24,
        isTTY,
        write: (chunk) => {
          writes.push(chunk);
          return true;
        },
        onResize: (listener) => {
          resizeListener = listener;
          return () => {
            resizeListener = null;
          };
        },
      },
      writes,
      triggerResize: () => {
        resizeListener?.();
      },
    };
  }

  it('writes alternate-screen and cursor ANSI sequences idempotently on TTY / идемпотентно переключает буфер экрана и курсор на TTY', () => {
    const { stream, writes } = createMockOutput(true);
    const lifecycle = new TerminalLifecycle(stream);

    lifecycle.enterTuiMode();
    lifecycle.enterTuiMode(); // second call must be a no-op
    expect(writes).toEqual([`${ANSI.ENTER_ALT_SCREEN}${ANSI.HIDE_CURSOR}`]);

    lifecycle.exitTuiMode();
    lifecycle.exitTuiMode(); // second call must be a no-op
    expect(writes).toEqual([
      `${ANSI.ENTER_ALT_SCREEN}${ANSI.HIDE_CURSOR}`,
      `${ANSI.RESET}${ANSI.SHOW_CURSOR}${ANSI.EXIT_ALT_SCREEN}`,
    ]);
  });

  it('skips ANSI escape writes on non-TTY streams while still cleaning up safely / не пишет ANSI-коды в не-TTY поток', () => {
    const { stream, writes } = createMockOutput(false);
    const lifecycle = new TerminalLifecycle(stream);

    lifecycle.enterTuiMode();
    lifecycle.exitTuiMode();

    expect(writes).toEqual([]);
  });

  it('forwards resize events and supports clean unsubscription / пробрасывает события resize и поддерживает отписку', () => {
    const { stream, triggerResize } = createMockOutput(true);
    const lifecycle = new TerminalLifecycle(stream);

    let count = 0;
    const unsub = lifecycle.onResize(() => {
      count += 1;
    });

    triggerResize();
    expect(count).toBe(1);

    unsub();
    triggerResize();
    expect(count).toBe(1);
  });
});
