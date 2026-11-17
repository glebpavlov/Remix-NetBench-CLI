import type { ITranslator } from '../../i18n/i18n.types';
import { ANSI, TUI_GLYPHS } from '../ansi.constants';
import { ScreenBuffer } from '../screen.buffer';
import { TUI_LAYOUT } from '../tui-layout.constants';
import type { CustomUrlViewState } from '../tui.types';
import { renderAppHeader, renderScreenFooter } from './tui-view.helpers';

/**
 * Builds the virtual screen frame for entering a custom HTTP(S) URL.
 * Формирует виртуальный кадр экрана ручного ввода произвольного HTTP(S) URL.
 *
 * @param width - Terminal width in columns / Ширина терминала в столбцах.
 * @param height - Terminal height in rows / Высота терминала в строках.
 * @param state - Current URL input string and optional validation error / Текущий ввод и ошибка валидации.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 * @returns Populated `ScreenBuffer` frame / Заполненный буфер экрана.
 */
export function buildCustomUrlFrame(
  width: number,
  height: number,
  state: CustomUrlViewState,
  i18n: ITranslator,
): ScreenBuffer {
  const buffer = new ScreenBuffer(width, height);
  renderAppHeader(buffer, i18n);

  buffer.drawText(
    TUI_LAYOUT.CUSTOM_URL.TITLE_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('menu.customUrlTitle'), // «Ввод произвольного URL»
    `${ANSI.BOLD}${ANSI.FG_WHITE}`,
  );

  const prompt = i18n.t('menu.customUrlPrompt'); // «URL: »
  buffer.drawText(
    TUI_LAYOUT.CUSTOM_URL.PROMPT_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    prompt,
    `${ANSI.BOLD}${ANSI.FG_CYAN}`,
  );

  // Horizontally scroll long URLs from the left so the trailing cursor stays visible.
  // Прокручиваем длинный ввод по горизонтали, чтобы текстовый курсор всегда оставался в кадре.
  const maxInputWidth = Math.max(
    TUI_LAYOUT.CUSTOM_URL.MIN_INPUT_WIDTH,
    width - TUI_LAYOUT.CUSTOM_URL.INPUT_HORIZONTAL_MARGIN - prompt.length,
  );
  const visibleInput =
    state.inputValue.length > maxInputWidth
      ? state.inputValue.slice(state.inputValue.length - maxInputWidth)
      : state.inputValue;

  buffer.drawText(
    TUI_LAYOUT.CUSTOM_URL.PROMPT_ROW,
    TUI_LAYOUT.PADDING_LEFT + prompt.length,
    `${visibleInput}${TUI_GLYPHS.TEXT_CURSOR}`,
    ANSI.FG_WHITE,
  );

  if (state.validationError !== undefined) {
    buffer.drawText(
      TUI_LAYOUT.CUSTOM_URL.ERROR_ROW,
      TUI_LAYOUT.PADDING_LEFT,
      state.validationError,
      `${ANSI.BOLD}${ANSI.FG_RED}`,
    );
  }

  const footerRow = Math.max(
    TUI_LAYOUT.CUSTOM_URL.MIN_FOOTER_ROW,
    height - TUI_LAYOUT.FOOTER.BOTTOM_OFFSET,
  );
  renderScreenFooter(
    buffer,
    width,
    footerRow,
    i18n.t('menu.customUrlHint'), // «Введите http:// или https:// адрес | Enter - запуск | Esc - назад»
  );

  return buffer;
}
