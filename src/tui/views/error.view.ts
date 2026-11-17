import type { ITranslator } from '../../i18n/i18n.types';
import { ANSI } from '../ansi.constants';
import { ScreenBuffer } from '../screen.buffer';
import { TUI_LAYOUT } from '../tui-layout.constants';
import type { ErrorViewState } from '../tui.types';
import { renderAppHeader, renderScreenFooter, wrapText } from './tui-view.helpers';

/**
 * Builds the virtual screen frame for displaying a recoverable resource error.
 * Формирует виртуальный кадр экрана восстановимой ошибки сетевого ресурса.
 *
 * @param width - Terminal width in columns / Ширина терминала в столбцах.
 * @param height - Terminal height in rows / Высота терминала в строках.
 * @param state - Localized error message and optional target URL / Сообщение об ошибке и URL.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 * @returns Populated `ScreenBuffer` frame / Заполненный буфер экрана.
 */
export function buildErrorFrame(
  width: number,
  height: number,
  state: ErrorViewState,
  i18n: ITranslator,
): ScreenBuffer {
  const buffer = new ScreenBuffer(width, height);
  renderAppHeader(buffer, i18n);

  buffer.drawText(
    TUI_LAYOUT.ERROR_VIEW.TITLE_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('errorView.title'), // «Ресурс недоступен»
    `${ANSI.BOLD}${ANSI.FG_RED}`,
  );

  if (state.targetUrl !== undefined) {
    buffer.drawText(
      TUI_LAYOUT.ERROR_VIEW.TARGET_ROW,
      TUI_LAYOUT.PADDING_LEFT,
      i18n.t('benchmark.header', { url: state.targetUrl }), // «Цель: {{url}}»
      ANSI.DIM,
    );
  }

  const wrapWidth = Math.max(
    TUI_LAYOUT.ERROR_VIEW.MIN_WRAP_WIDTH,
    width - TUI_LAYOUT.ERROR_VIEW.WRAP_HORIZONTAL_MARGIN,
  );
  const wrappedLines = wrapText(state.message, wrapWidth);

  let row: number = TUI_LAYOUT.ERROR_VIEW.MESSAGE_START_ROW;
  for (const line of wrappedLines) {
    if (row >= height - TUI_LAYOUT.ERROR_VIEW.BOTTOM_RESERVED_ROWS) {
      break;
    }
    buffer.drawText(row, TUI_LAYOUT.PADDING_LEFT, line, ANSI.FG_YELLOW);
    row += 1;
  }

  const footerRow = Math.max(
    row + TUI_LAYOUT.ERROR_VIEW.FOOTER_GAP,
    height - TUI_LAYOUT.FOOTER.BOTTOM_OFFSET,
  );
  if (footerRow < height) {
    renderScreenFooter(
      buffer,
      width,
      footerRow,
      i18n.t('errorView.controlsHint'), // «Enter / Esc - вернуться в меню | q / Ctrl+C - выход»
    );
  }

  return buffer;
}
