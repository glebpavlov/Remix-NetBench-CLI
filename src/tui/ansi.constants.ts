/**
 * ANSI / VT100 escape sequences and terminal control constants.
 * Every property is documented with its exact byte sequence and visual/terminal effect.
 *
 * Константы управляющих ANSI / VT100 escape-последовательностей терминала.
 * Для каждого символа/кода указано его точное значение и выполняемое в терминале действие.
 */
export const ANSI = {
  /**
   * ASCII Escape byte (`0x1B` / `\x1b`). Prefix of all ANSI control sequences.
   * Управляющий байт ASCII Escape (`0x1B` / `\x1b`). Начало любой ANSI-последовательности.
   */
  ESC: '\x1b',

  /**
   * Control Sequence Introducer (`\x1b[`). Starts parameterized terminal commands (colors, cursor movement).
   * Ввод управляющей последовательности CSI (`\x1b[`). Открывает параметрические команды (цвета, перемещение курсора).
   */
  CSI: '\x1b[',

  /**
   * Single Shift 3 (`\x1bO`). Prefix emitted by terminals in application-cursor mode (SS3) for arrow keys.
   * Префикс SS3 (`\x1bO`). Отправляется некоторыми терминалами для клавиш стрелок в режиме application cursor.
   */
  SS3: '\x1bO',

  /**
   * CUP (Cursor Position) command suffix `'H'`, appended after `<row>;<col>` coordinates.
   * Завершающий символ `'H'` команды позиционирования курсора CUP (`\x1b[<row>;<col>H`).
   */
  CUP_SUFFIX: 'H',

  /**
   * RIS (Reset to Initial State, `\x1bc`). Full hard terminal reset — causes flicker; forbidden during TUI rendering.
   * Полный сброс терминала RIS (`\x1bc`). Вызывает мерцание; запрещен при дифференциальном рендеринге.
   */
  FULL_RESET: '\x1bc',

  /**
   * DECTCEM Hide Cursor (`\x1b[?25l`). Hides the blinking text cursor while TUI is active.
   * Скрытие текстового курсора DECTCEM (`\x1b[?25l`) на время работы полноэкранного TUI.
   */
  HIDE_CURSOR: '\x1b[?25l',

  /**
   * DECTCEM Show Cursor (`\x1b[?25h`). Restores cursor visibility when exiting TUI mode.
   * Восстановление видимости курсора DECTCEM (`\x1b[?25h`) при выходе из режима TUI.
   */
  SHOW_CURSOR: '\x1b[?25h',

  /**
   * Switches terminal to the Alternate Screen Buffer (`\x1b[?1049h`) so shell scrollback stays intact.
   * Переключает терминал на альтернативный буфер экрана (`\x1b[?1049h`), сохраняя историю командной строки.
   */
  ENTER_ALT_SCREEN: '\x1b[?1049h',

  /**
   * Restores the primary terminal screen buffer (`\x1b[?1049l`) on exit or fatal error.
   * Возвращает основной буфер экрана терминала (`\x1b[?1049l`) при завершении или критической ошибке.
   */
  EXIT_ALT_SCREEN: '\x1b[?1049l',

  /**
   * EL (Erase in Line, mode 2: `\x1b[2K`). Clears the entire current row from start to end without moving cursor.
   * Очистка всей текущей строки целиком (`\x1b[2K`) без сдвига курсора.
   */
  CLEAR_LINE: '\x1b[2K',

  /**
   * SGR Reset (`\x1b[0m`). Resets all active text styles, foreground, and background colors to terminal defaults.
   * Сброс всех атрибутов оформления текста SGR (`\x1b[0m`) к стандартным цветам терминала.
   */
  RESET: '\x1b[0m',

  /**
   * SGR Bold (`\x1b[1m`). Enables bold / high-intensity text rendering.
   * Полужирное начертание / повышенная яркость текста (`\x1b[1m`).
   */
  BOLD: '\x1b[1m',

  /**
   * SGR Dim (`\x1b[2m`). Enables faint / dimmed text intensity for secondary labels and dividers.
   * Приглушенный / тусклый текст (`\x1b[2m`) для второстепенных подписей, подсказок и разделителей.
   */
  DIM: '\x1b[2m',

  /**
   * SGR Inverse (`\x1b[7m`). Swaps foreground and background colors for inverted highlights.
   * Инверсия цветов текста и фона (`\x1b[7m`) для выделения элементов.
   */
  INVERSE: '\x1b[7m',

  /**
   * SGR Foreground Red (`\x1b[31m`). Sets standard red text color (errors / alerts).
   * Красный цвет текста (`\x1b[31m`) для критических ошибок и предупреждений.
   */
  FG_RED: '\x1b[31m',

  /**
   * SGR Foreground Green (`\x1b[32m`). Sets standard green text color (success states).
   * Зеленый цвет текста (`\x1b[32m`) для успешных статусов.
   */
  FG_GREEN: '\x1b[32m',

  /**
   * SGR Foreground Yellow (`\x1b[33m`). Sets standard yellow text color (warnings / retries).
   * Желтый цвет текста (`\x1b[33m`) для предупреждений и уведомлений о повторах.
   */
  FG_YELLOW: '\x1b[33m',

  /**
   * SGR Foreground Cyan (`\x1b[36m`). Sets standard cyan text color (URLs / prompts).
   * Бирюзовый цвет текста (`\x1b[36m`) для целевых URL и заголовков ввода.
   */
  FG_CYAN: '\x1b[36m',

  /**
   * SGR Foreground White (`\x1b[37m`). Sets standard white text color (primary values).
   * Белый цвет текста (`\x1b[37m`) для основных значений и строк таблиц.
   */
  FG_WHITE: '\x1b[37m',

  /**
   * SGR Bright Black / Gray (`\x1b[90m`). Sets muted gray foreground (empty progress bar track).
   * Темно-серый цвет текста (`\x1b[90m`) для незаполненной части прогресс-бара.
   */
  FG_BRIGHT_BLACK: '\x1b[90m',

  /**
   * SGR Bright Green (`\x1b[92m`). Sets vivid green foreground (selected menu item, progress fill).
   * Ярко-зеленый цвет текста (`\x1b[92m`) для активного пункта меню и шкалы прогресса.
   */
  FG_BRIGHT_GREEN: '\x1b[92m',

  /**
   * SGR Bright Cyan (`\x1b[96m`). Sets vivid cyan foreground (app title, instant/avg throughput highlights).
   * Ярко-бирюзовый цвет текста (`\x1b[96m`) для заголовка приложения и ключевых цифр скорости.
   */
  FG_BRIGHT_CYAN: '\x1b[96m',

  /**
   * SGR Background Blue (`\x1b[44m`). Sets blue background fill.
   * Синий цвет фона (`\x1b[44m`).
   */
  BG_BLUE: '\x1b[44m',

  /**
   * CSI Up Arrow input sequence (`\x1b[A`) emitted when the user presses Arrow Up.
   * Входная последовательность клавиши «Стрелка вверх» в режиме CSI (`\x1b[A`).
   */
  KEY_UP_CSI: '\x1b[A',

  /**
   * SS3 Up Arrow input sequence (`\x1bOA`) emitted in application cursor mode.
   * Входная последовательность клавиши «Стрелка вверх» в режиме SS3 (`\x1bOA`).
   */
  KEY_UP_SS3: '\x1bOA',

  /**
   * CSI Down Arrow input sequence (`\x1b[B`) emitted when the user presses Arrow Down.
   * Входная последовательность клавиши «Стрелка вниз» в режиме CSI (`\x1b[B`).
   */
  KEY_DOWN_CSI: '\x1b[B',

  /**
   * SS3 Down Arrow input sequence (`\x1bOB`) emitted in application cursor mode.
   * Входная последовательность клавиши «Стрелка вниз» в режиме SS3 (`\x1bOB`).
   */
  KEY_DOWN_SS3: '\x1bOB',

  /**
   * CSI bracket character `'['` immediately following `ESC` in multi-byte CSI escape sequences.
   * Открывающая квадратная скобка `'['`, идущая сразу после `ESC` в CSI-последовательностях.
   */
  CSI_BRACKET: '[',
} as const;

/**
 * ASCII character codes handled by the raw-mode terminal input decoder.
 * Коды символов ASCII, обрабатываемые декодером клавиатурного ввода в raw-режиме.
 */
export const ASCII_CONTROL = {
  /** End of Text (`Ctrl+C`, `0x03`) / Прерывание `Ctrl+C` (ETX, код `3`) */
  CTRL_C: 3,
  /** Backspace (`BS`, `0x08`) / Клавиша Backspace в старых терминалах (код `8`) */
  BACKSPACE_BS: 8,
  /** Line Feed (`\n`, `0x0A`) / Перевод строки LF (код `10`) */
  LINE_FEED: 10,
  /** Carriage Return (`\r`, `0x0D`, Enter key in raw mode) / Возврат каретки CR, клавиша Enter (код `13`) */
  CARRIAGE_RETURN: 13,
  /** Escape (`ESC`, `0x1B`) / Клавиша Escape (код `27`) */
  ESCAPE: 27,
  /** First printable ASCII code (`Space`, `0x20`) / Первый печатный символ ASCII — пробел (код `32`) */
  PRINTABLE_MIN: 32,
  /** Delete / modern Backspace (`DEL`, `0x7F`) / Современный код клавиши Backspace (DEL, код `127`) */
  BACKSPACE_DEL: 127,
  /** Byte length of standard 3-byte CSI/SS3 arrow escape sequence (e.g. `\x1b[A`) / Длина 3-байтной последовательности стрелки */
  ARROW_SEQUENCE_LENGTH: 3,
} as const;

/**
 * Reusable Unicode glyphs and spinner frames used across TUI views and screen buffers.
 * Переиспользуемые символы Unicode и кадры спиннера для отрисовки интерфейса TUI.
 */
export const TUI_GLYPHS = {
  /** Blank space character filling empty virtual cells / Символ пробела для пустых ячеек буфера */
  SPACE: ' ',
  /** Horizontal box-drawing rule character (`─`) / Символ горизонтального разделителя (`─`) */
  HORIZONTAL_RULE: '─',
  /** Filled progress bar block (`█`) / Заполненный сегмент шкалы прогресса (`█`) */
  PROGRESS_FILLED: '█',
  /** Unfilled progress bar track block (`░`) / Незаполненный сегмент шкалы прогресса (`░`) */
  PROGRESS_EMPTY: '░',
  /** Progress bar left bracket / Левая скобка шкалы прогресса */
  PROGRESS_OPEN: '[',
  /** Progress bar right bracket / Правая скобка шкалы прогресса */
  PROGRESS_CLOSE: ']',
  /** Active menu selection cursor prefix / Указатель активного пункта меню */
  MENU_CURSOR: '❯ ',
  /** Inactive menu item left indentation matching cursor width / Отступ неактивного пункта меню */
  MENU_INDENT: '  ',
  /** Caret glyph rendered at the end of text input fields / Курсор ввода текста в поле URL */
  TEXT_CURSOR: '▏',
  /** Braille spinner animation frames / Кадры анимации спиннера на базе символов Брайля */
  SPINNER_FRAMES: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const,
} as const;

/**
 * Generates an ANSI CUP (Cursor Position) escape sequence using 1-based row and column coordinates.
 * Генерирует ANSI-последовательность CUP (позиционирование курсора) с координатами, начинающимися с 1.
 *
 * @param rowOneBased - 1-based terminal row index (`>= 1`) / 1-индексированный номер строки терминала (`>= 1`).
 * @param colOneBased - 1-based terminal column index (`>= 1`) / 1-индексированный номер столбца терминала (`>= 1`).
 * @returns ANSI CUP sequence `\x1b[<row>;<col>H` / Готовая ANSI-команда позиционирования курсора.
 *
 * @example
 * cursorTo(3, 8); // "\x1b[3;8H"
 */
export function cursorTo(rowOneBased: number, colOneBased: number): string {
  const safeRow = Math.max(1, Math.floor(rowOneBased));
  const safeCol = Math.max(1, Math.floor(colOneBased));
  return `${ANSI.CSI}${safeRow};${safeCol}${ANSI.CUP_SUFFIX}`;
}
