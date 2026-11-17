import type { ITranslator } from '../../i18n/i18n.types';
import { ANSI, TUI_GLYPHS } from '../ansi.constants';
import { ScreenBuffer } from '../screen.buffer';
import { TUI_LAYOUT } from '../tui-layout.constants';
import type { MenuEntry, MenuViewState } from '../tui.types';
import { renderAppHeader, renderScreenFooter } from './tui-view.helpers';

/**
 * Builds the virtual screen frame for the interactive target selection menu.
 * Формирует виртуальный кадр экрана интерактивного выбора цели замера.
 *
 * @param width - Terminal width in columns / Ширина терминала в столбцах.
 * @param height - Terminal height in rows / Высота терминала в строках.
 * @param state - Menu selection and presets state / Состояние меню и список пресетов.
 * @param i18n - Read-only translation lookup / Сервис переводов.
 * @returns Populated `ScreenBuffer` frame / Заполненный буфер экрана.
 */
export function buildMenuFrame(
  width: number,
  height: number,
  state: MenuViewState,
  i18n: ITranslator,
): ScreenBuffer {
  const buffer = new ScreenBuffer(width, height);
  renderAppHeader(buffer, i18n);

  buffer.drawText(
    TUI_LAYOUT.MENU.TITLE_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('menu.title'), // «Выбор цели для замера»
    `${ANSI.BOLD}${ANSI.FG_WHITE}`,
  );
  buffer.drawText(
    TUI_LAYOUT.MENU.SUBTITLE_ROW,
    TUI_LAYOUT.PADDING_LEFT,
    i18n.t('menu.subtitle'), // «Пресеты из конфигурации или ручной ввод произвольного HTTP(S) URL»
    ANSI.DIM,
  );

  let row: number = TUI_LAYOUT.MENU.LIST_START_ROW;
  if (state.presetsCount === 0) {
    buffer.drawText(
      row,
      TUI_LAYOUT.PADDING_LEFT,
      i18n.t('menu.noPresetsWarning'), // «Список пресетов пуст. Вы можете ввести URL вручную.»
      ANSI.FG_YELLOW,
    );
    row += TUI_LAYOUT.MENU.NO_PRESETS_ROW_STEP;
  }

  row = renderMenuEntries(buffer, height, row, state, i18n);

  const footerRow = Math.max(row + 1, height - TUI_LAYOUT.FOOTER.BOTTOM_OFFSET);
  renderScreenFooter(
    buffer,
    width,
    footerRow,
    i18n.t('menu.controlsHint'), // «Управление: Вверх/Вниз - выбор | Enter - старт | q / Ctrl+C - выход»
  );

  return buffer;
}

function renderMenuEntries(
  buffer: ScreenBuffer,
  height: number,
  startRow: number,
  state: MenuViewState,
  i18n: ITranslator,
): number {
  const maxVisibleRows = Math.max(1, height - startRow - TUI_LAYOUT.MENU.BOTTOM_RESERVED_ROWS);
  const startIdx = Math.max(0, state.selectedIndex - maxVisibleRows + 1);
  const endIdx = Math.min(state.entries.length, startIdx + maxVisibleRows);
  let row = startRow;

  for (let i = startIdx; i < endIdx; i += 1) {
    const entry = state.entries[i];
    if (entry === undefined) {
      continue;
    }

    const isSelected = i === state.selectedIndex;
    const prefix = isSelected ? TUI_GLYPHS.MENU_CURSOR : TUI_GLYPHS.MENU_INDENT;
    const style = isSelected ? `${ANSI.BOLD}${ANSI.FG_BRIGHT_GREEN}` : ANSI.FG_WHITE;
    const label = formatMenuEntryLabel(entry, i18n);

    buffer.drawText(row, TUI_LAYOUT.PADDING_LEFT, `${prefix}${label}`, style);
    row += 1;
  }

  return row;
}

function formatMenuEntryLabel(entry: MenuEntry, i18n: ITranslator): string {
  switch (entry.kind) {
    case 'preset':
      return `${entry.preset.name} (${entry.preset.url})`;
    case 'custom-url':
      return i18n.t('menu.customUrlItem'); // «Ввести свой URL...»
    case 'toggle-language':
      return i18n.t('menu.languageItem', {
        lang: i18n.currentLocale.toUpperCase(),
      }); // «Язык интерфейса: {{lang}}»
    case 'exit':
      return i18n.t('menu.exitItem'); // «Выход»
  }
}
