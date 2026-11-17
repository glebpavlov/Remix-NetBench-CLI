import { describe, expect, it } from 'vitest';
import type { BenchmarkSummary } from '../src/core/core.types';
import { I18nService } from '../src/i18n/i18n.service';
import { Locale } from '../src/i18n/i18n.types';
import type { ScreenBuffer } from '../src/tui/screen.buffer';
import {
  buildBenchmarkFrame,
  buildCustomUrlFrame,
  buildErrorFrame,
  buildMenuFrame,
  buildSummaryFrame,
  formatPlainTextSummary,
} from '../src/tui/views/tui.views';

function extractScreenRows(buffer: ScreenBuffer): string[] {
  const lines: string[] = [];
  for (let r = 0; r < buffer.height; r += 1) {
    let line = '';
    for (let c = 0; c < buffer.width; c += 1) {
      line += buffer.getCell(r, c)?.char ?? ' ';
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

describe('TUI Views & Plain Summary Formatter (Представления TUI и проверка отсутствия обрезки текста)', () => {
  const firstIterationMetric = {
    index: 1,
    bytesDownloaded: 1_000_000,
    durationMs: 100,
    speedMbps: 80,
    speedMBps: 10,
    retriesCount: 0,
  };

  const sampleSummary: BenchmarkSummary = {
    targetUrl: 'https://example.com/10MB.bin',
    completedIterations: 2,
    totalIterations: 2,
    totalBytes: 2_000_000,
    totalDurationMs: 200,
    averageDurationMs: 100,
    averageSpeedMbps: 80,
    averageSpeedMBps: 10,
    iterations: [
      firstIterationMetric,
      {
        index: 2,
        bytesDownloaded: 1_000_000,
        durationMs: 100,
        speedMbps: 80,
        speedMBps: 10,
        retriesCount: 1,
      },
    ],
  };

  it('renders full Russian label "Средняя пропускная способность:" without truncation by the value column / не обрезает длинную русскую подпись "Средняя пропускная способность:" вторым столбцом', () => {
    const i18n = new I18nService(Locale.RU);
    const frame = buildSummaryFrame(100, 24, { summary: sampleSummary }, i18n);
    const screenText = extractScreenRows(frame).join('\n');

    expect(screenText).toContain('Средняя пропускная способность:');
    expect(screenText).toContain('80.00 Mbps | 10.00 MB/s');
  });

  it('renders interactive menu with presets, empty-presets warning, and selected cursor / отрисовывает меню с пресетами и предупреждением при пустом списке', () => {
    const i18n = new I18nService(Locale.EN);
    const frame = buildMenuFrame(
      80,
      20,
      {
        entries: [{ kind: 'custom-url' }, { kind: 'toggle-language' }, { kind: 'exit' }],
        selectedIndex: 1,
        presetsCount: 0,
      },
      i18n,
    );

    const screenText = extractScreenRows(frame).join('\n');
    expect(screenText).toContain('No presets found in config');
    expect(screenText).toContain('❯ Language: EN');
  });

  it('renders custom URL input frame with horizontal scrolling and validation error / отрисовывает экран ввода URL со скроллингом и ошибкой валидации', () => {
    const i18n = new I18nService(Locale.RU);
    const frame = buildCustomUrlFrame(
      50,
      16,
      {
        inputValue: 'https://very-long-domain.example.com/path/to/large/file.bin',
        validationError: 'Некорректный формат URL.',
      },
      i18n,
    );

    const screenText = extractScreenRows(frame).join('\n');
    expect(screenText).toContain('URL:');
    expect(screenText).toContain('file.bin▏');
    expect(screenText).toContain('Некорректный формат URL.');
  });

  it('renders live benchmark frame with progress bar, retry banner, and completed iterations table / отрисовывает экран прогресса с баром, баннером ретрая и таблицей', () => {
    const i18n = new I18nService(Locale.RU);
    const frame = buildBenchmarkFrame(
      100,
      24,
      {
        targetUrl: 'https://example.com/10MB.bin',
        currentIteration: 2,
        totalIterations: 10,
        spinnerFrameIndex: 1,
        currentIterationBytes: 500_000,
        totalDownloadedBytes: 1_000_000,
        elapsedMs: 1_500,
        instantSpeedMbps: 64.5,
        instantSpeedMBps: 8.06,
        runningAvgMbps: 80,
        runningAvgMBps: 10,
        completedMetrics: [firstIterationMetric],
        retryBanner: 'Повтор 1/4 через 2.0с (HTTP 429)',
        aborting: false,
      },
      i18n,
    );

    const screenText = extractScreenRows(frame).join('\n');
    expect(screenText).toContain('Запрос 2 из 10');
    expect(screenText).toContain('10%');
    expect(screenText).toContain('Повтор 1/4 через 2.0с (HTTP 429)');
    expect(screenText).toContain('1.00 MB');
  });

  it('wraps long error messages on ErrorView frame / переносит длинный текст ошибки на экране ErrorView', () => {
    const i18n = new I18nService(Locale.EN);
    const frame = buildErrorFrame(
      45,
      18,
      {
        targetUrl: 'https://example.com/bad',
        message: 'Server returned HTTP 429 Too Many Requests after 4 consecutive retry attempts.',
      },
      i18n,
    );

    const rows = extractScreenRows(frame);
    expect(rows.some((line) => line.includes('Resource Unavailable'))).toBe(true);
    expect(rows.some((line) => line.includes('Server returned HTTP 429'))).toBe(true);
  });

  it('formats plain text summary report cleanly in active locale / формирует текстовый отчет в активной локали', () => {
    const i18n = new I18nService(Locale.EN);
    const report = formatPlainTextSummary(sampleSummary, i18n);

    expect(report).toContain('=== Benchmark Results ===');
    expect(report).toContain('Average Throughput: 80.00 Mbps (10.00 MB/s)');
    expect(report).toContain('https://example.com/10MB.bin');
  });
});
