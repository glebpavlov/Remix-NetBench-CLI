/**
 * Centralized TUI grid coordinates, column offsets, margins, and widget sizing constants.
 * Eliminates magic numbers in `buffer.drawText(...)` calls and makes layout responsive to any locale.
 *
 * Централизованные константы координат сетки, отступов, ширины столбцов и размеров виджетов TUI.
 * Исключает «магические числа» в вызовах `buffer.drawText(...)` и адаптирует колонки под любую локаль.
 */
export const TUI_LAYOUT = {
  /**
   * Standard left margin (2 spaces from terminal column 0) used across all screens.
   * Стандартный левый отступ (2 пробела от левого края терминала) для всех экранов.
   */
  PADDING_LEFT: 2,

  /**
   * Total horizontal margin (2 cols left + 2 cols right) subtracted from terminal width for dividers.
   * Суммарный горизонтальный отступ (2 слева + 2 справа), вычитаемый из ширины терминала для разделителей.
   */
  HORIZONTAL_MARGIN: 4,

  /**
   * Minimum horizontal rule width so dividers never collapse on narrow terminals.
   * Минимальная ширина горизонтального разделителя для узких терминалов.
   */
  MIN_RULE_WIDTH: 10,

  /**
   * Minimum space gap inserted between the longest label (`label:`) and the value column.
   * Минимальный зазор (в пробелах) между самой длинной подписью (`label:`) и столбцом значений.
   */
  LABEL_VALUE_GAP: 2,

  /**
   * Default terminal fallback dimensions when `process.stdout` is not a TTY.
   * Размеры терминала по умолчанию для не-TTY окружений.
   */
  DEFAULT_TERMINAL: {
    COLUMNS: 80,
    ROWS: 24,
  },

  /**
   * Shared top application banner row indices (rows 0..2).
   * Общие координаты верхней шапки приложения (строки 0..2).
   */
  HEADER: {
    /** Row 0: bold application name / Строка 0: название приложения */
    APP_NAME_ROW: 0,
    /** Row 1: dimmed subtitle / Строка 1: подзаголовок */
    APP_SUBTITLE_ROW: 1,
    /** Row 2: full-width header divider rule / Строка 2: разделительная черта под шапкой */
    DIVIDER_ROW: 2,
  },

  /**
   * Shared bottom controls footer offsets relative to terminal height.
   * Отступы нижней панели подсказок относительно высоты терминала.
   */
  FOOTER: {
    /** Footer text sits 2 rows above the bottom edge (`height - 2`) / Подсказка на 2 строки выше нижнего края */
    BOTTOM_OFFSET: 2,
    /** Horizontal divider sits 1 row above footer text / Разделитель на 1 строку выше текста подсказки */
    DIVIDER_OFFSET: 1,
  },

  /**
   * Interactive main menu layout constants.
   * Координаты экрана главного меню.
   */
  MENU: {
    /** Row 4: section title (leaves row 3 as breathing room below header divider) / Строка 4: заголовок меню */
    TITLE_ROW: 4,
    /** Row 5: subtitle / Строка 5: подзаголовок меню */
    SUBTITLE_ROW: 5,
    /** Row 7: first preset/menu item (leaves row 6 blank) / Строка 7: первый пункт списка */
    LIST_START_ROW: 7,
    /** Extra rows reserved when displaying the empty-presets warning + blank line / Сдвиг при предупреждении об отсутствии пресетов */
    NO_PRESETS_ROW_STEP: 2,
    /** Rows reserved at bottom for footer divider + hint + 1 padding row / Зарезервировано снизу под футер */
    BOTTOM_RESERVED_ROWS: 3,
  },

  /**
   * Custom URL prompt screen layout constants.
   * Координаты экрана ручного ввода URL.
   */
  CUSTOM_URL: {
    /** Row 4: prompt screen title / Строка 4: заголовок ввода URL */
    TITLE_ROW: 4,
    /** Row 6: input label and editable URL field / Строка 6: приглашение ввода и текстовое поле */
    PROMPT_ROW: 6,
    /** Row 8: inline validation error banner / Строка 8: строка ошибки валидации */
    ERROR_ROW: 8,
    /** Minimum footer row so footer never overlaps error text / Минимальная строка футера */
    MIN_FOOTER_ROW: 10,
    /** Minimum visible width for the URL input box / Минимальная видимая ширина поля ввода */
    MIN_INPUT_WIDTH: 10,
    /** Horizontal padding reserved around prompt + cursor / Горизонтальный запас под отступы и курсор */
    INPUT_HORIZONTAL_MARGIN: 6,
  },

  /**
   * Live benchmark progress screen layout constants.
   * Координаты экрана живого прогресса замера скорости.
   */
  BENCHMARK: {
    /** Row 4: target URL header / Строка 4: целевой URL */
    TARGET_ROW: 4,
    /** Row 6: spinner + active request status / Строка 6: спиннер и статус текущего запроса */
    STATUS_ROW: 6,
    /** Row 7: overall progress bar + percentage / Строка 7: прогресс-бар и процент */
    PROGRESS_ROW: 7,
    /** Row 9: first live metric row (`Instant Speed`) / Строка 9: первая строка живых метрик */
    FIRST_METRIC_ROW: 9,
    /** Vertical gap between metrics block and retry banner or completed table / Отступ после блока метрик */
    POST_METRICS_GAP: 2,
    /** Minimum column offset for live metric values / Минимальный столбец значений живых метрик */
    MIN_VALUE_COL: 24,
    /** Minimum progress bar width in characters / Минимальная ширина шкалы прогресса */
    PROGRESS_BAR_MIN_WIDTH: 16,
    /** Maximum progress bar width in characters / Максимальная ширина шкалы прогресса */
    PROGRESS_BAR_MAX_WIDTH: 44,
    /** Columns reserved for label, brackets, percentage, and margins / Запас ширины вокруг прогресс-бара */
    PROGRESS_BAR_RESERVED_COLS: 30,
    /** Minimum internal bar width enforced by ScreenBuffer / Минимальная длина заполнения в ScreenBuffer */
    PROGRESS_BAR_BUFFER_MIN: 4,
    /** Extra columns after bar (`[` + `]` + 1 space) before percentage text / Смещение текста процентов после прогресс-бара */
    PROGRESS_PERCENT_OFFSET: 3,
    /** Minimum remaining rows before footer required to render completed iterations table / Запас строк снизу для таблицы */
    TABLE_MIN_BOTTOM_MARGIN: 4,
    /** Rows reserved below table for footer divider and hint / Отступ снизу под футер */
    TABLE_BOTTOM_RESERVED_ROWS: 3,
    /** Spinner animation frame interval in milliseconds (~11 FPS) / Интервал обновления кадров спиннера в мс */
    SPINNER_INTERVAL_MS: 90,
  },

  /**
   * Final summary report screen layout constants.
   * Координаты экрана итогового отчета замера.
   */
  SUMMARY: {
    /** Row 4: summary title / Строка 4: заголовок итогового отчета */
    TITLE_ROW: 4,
    /** Row 6: first summary key-value metric row / Строка 6: первая строка сводных метрик */
    FIRST_METRIC_ROW: 6,
    /** Minimum value column offset (dynamically expands if localized labels are longer) / Минимальный столбец значений */
    MIN_VALUE_COL: 28,
    /** Blank row gap between summary metrics and iterations table / Отступ между сводкой и таблицей итераций */
    TABLE_TOP_GAP: 1,
    /** Minimum bottom margin required to start rendering iterations table / Минимальный нижний отступ для начала таблицы */
    TABLE_MIN_BOTTOM_MARGIN: 4,
    /** Bottom margin reserved for footer divider and hint / Нижний отступ под разделитель и подсказку */
    TABLE_BOTTOM_RESERVED_ROWS: 3,
  },

  /**
   * Recoverable resource error screen layout constants.
   * Координаты экрана восстановимой сетевой/ресурсной ошибки.
   */
  ERROR_VIEW: {
    /** Row 4: error screen title / Строка 4: заголовок экрана ошибки */
    TITLE_ROW: 4,
    /** Row 6: failed target URL / Строка 6: проблемный URL */
    TARGET_ROW: 6,
    /** Row 8: first line of word-wrapped error details / Строка 8: начало текста ошибки */
    MESSAGE_START_ROW: 8,
    /** Minimum width when word-wrapping error message / Минимальная ширина переноса текста */
    MIN_WRAP_WIDTH: 20,
    /** Total horizontal padding subtracted when wrapping text (2 left + 4 right) / Горизонтальный отступ при переносе */
    WRAP_HORIZONTAL_MARGIN: 6,
    /** Bottom margin before footer / Отступ до футера */
    BOTTOM_RESERVED_ROWS: 3,
    /** Gap between last message line and footer / Отступ после текста ошибки до футера */
    FOOTER_GAP: 2,
  },

  /**
   * Fixed column pad widths for the per-iteration results table.
   * Ширина столбцов таблицы результатов по итерациям.
   */
  TABLE_COLUMNS: {
    INDEX_WIDTH: 4,
    BYTES_WIDTH: 13,
    DURATION_WIDTH: 12,
    MBPS_WIDTH: 11,
    MB_SEC_WIDTH: 9,
  },
} as const;
