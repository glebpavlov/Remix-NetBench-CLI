import { describe, expect, it } from 'vitest';
import { InputController, decodeKeyChunk } from '../src/tui/input.controller';
import type { ITerminalInputStream, KeyEvent } from '../src/tui/tui.types';

class MockTerminalInputStream implements ITerminalInputStream {
  public readonly isTTY = true;
  public rawModeCalls: boolean[] = [];
  public resumed = false;
  public paused = false;
  private listener: ((chunk: Buffer) => void) | null = null;

  public setRawMode(mode: boolean): void {
    this.rawModeCalls.push(mode);
  }

  public resume(): void {
    this.resumed = true;
    this.paused = false;
  }

  public pause(): void {
    this.paused = true;
  }

  public onData(listener: (chunk: Buffer) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  public emit(data: string | Buffer): void {
    const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    this.listener?.(buf);
  }
}

describe('InputController & decodeKeyChunk (Декодирование клавиш терминала)', () => {
  it('decodes CSI and SS3 arrow up/down sequences / распознает стрелки вверх/вниз в режимах CSI и SS3', () => {
    expect(decodeKeyChunk(Buffer.from('\x1b[A'))).toEqual([{ type: 'up' }]);
    expect(decodeKeyChunk(Buffer.from('\x1bOA'))).toEqual([{ type: 'up' }]);
    expect(decodeKeyChunk(Buffer.from('\x1b[B'))).toEqual([{ type: 'down' }]);
    expect(decodeKeyChunk(Buffer.from('\x1bOB'))).toEqual([{ type: 'down' }]);
  });

  it('decodes Ctrl+C, Enter (CR/LF), Backspace (DEL/BS), and bare Escape / распознает Ctrl+C, Enter, Backspace и Escape', () => {
    expect(decodeKeyChunk(Buffer.from([3]))).toEqual([{ type: 'ctrl-c' }]);
    expect(decodeKeyChunk(Buffer.from([13]))).toEqual([{ type: 'enter' }]);
    expect(decodeKeyChunk(Buffer.from([10]))).toEqual([{ type: 'enter' }]);
    expect(decodeKeyChunk(Buffer.from([127]))).toEqual([{ type: 'backspace' }]);
    expect(decodeKeyChunk(Buffer.from([8]))).toEqual([{ type: 'backspace' }]);
    expect(decodeKeyChunk(Buffer.from([27]))).toEqual([{ type: 'escape' }]);
  });

  it('ignores unrecognized 3-byte CSI sequences (e.g. Left/Right arrows) instead of emitting escape / игнорирует неизвестные CSI-последовательности', () => {
    expect(decodeKeyChunk(Buffer.from('\x1b[C\x1b[D'))).toEqual([]);
  });

  it('decodes mixed pasted text and control keys in one Buffer chunk / корректно декодирует смешанный буфер символов и управляющих клавиш', () => {
    expect(decodeKeyChunk(Buffer.from('abc\r'))).toEqual([
      { type: 'char', value: 'a' },
      { type: 'char', value: 'b' },
      { type: 'char', value: 'c' },
      { type: 'enter' },
    ]);
  });

  it('manages TTY rawMode, resume/pause, and listener lifecycle idempotently / идемпотентно управляет rawMode и подписками', () => {
    const stream = new MockTerminalInputStream();
    const controller = new InputController(stream);
    const received: KeyEvent[] = [];

    controller.start((ev) => received.push(ev));
    controller.start((ev) => received.push(ev)); // idempotent second start
    expect(stream.rawModeCalls).toEqual([true]);
    expect(stream.resumed).toBe(true);

    stream.emit('q');
    expect(received).toEqual([{ type: 'char', value: 'q' }]);

    controller.stop();
    controller.stop(); // idempotent second stop
    expect(stream.rawModeCalls).toEqual([true, false]);
    expect(stream.paused).toBe(true);

    // Events emitted after stop must not reach listener
    stream.emit('x');
    expect(received).toHaveLength(1);
  });
});
