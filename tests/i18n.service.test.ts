import { describe, expect, it } from 'vitest';
import { I18nService } from '../src/i18n/i18n.service';
import { Locale } from '../src/i18n/i18n.types';
import { EN_DICTIONARY } from '../src/i18n/locales/en.locale';
import { RU_DICTIONARY } from '../src/i18n/locales/ru.locale';

describe('I18nService (Расширяемая система локализации и enum+string локали)', () => {
  it('ensures built-in RU and EN dictionaries contain the exact same set of translation keys / проверяет полную синхронизацию ключей RU и EN словарей', () => {
    const ruKeys = Object.keys(RU_DICTIONARY).sort();
    const enKeys = Object.keys(EN_DICTIONARY).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it('interpolates {{param}} placeholders and preserves unknown placeholders / подставляет {{param}} и сохраняет неизвестные плейсхолдеры', () => {
    const i18n = new I18nService(Locale.EN);

    expect(i18n.t('benchmark.iterationStatus', { current: 3, total: 10 })).toBe('Request 3 of 10');
    expect(i18n.t('benchmark.iterationStatus', { current: 3 })).toBe('Request 3 of {{total}}');
  });

  it('supports registering a custom string locale at runtime with fallback to EN / поддерживает регистрацию новой строковой локали с откатом на EN', () => {
    const i18n = new I18nService(Locale.RU);

    i18n.registerLocale('de', {
      'menu.exitItem': 'Beenden',
    });

    expect(i18n.hasLocale('de')).toBe(true);
    expect(i18n.getAvailableLocales()).toEqual([Locale.RU, Locale.EN, 'de']);

    i18n.setLocale('de');
    expect(i18n.currentLocale).toBe('de');
    expect(i18n.t('menu.exitItem')).toBe('Beenden');
    // Key not translated in 'de' falls back cleanly to EN dictionary
    expect(i18n.t('app.name')).toBe('NetBench CLI');
    // Completely unknown key returns the key itself safely
    expect(i18n.t('non.existent.key')).toBe('non.existent.key');
  });

  it('cycles across all registered locales dynamically without hardcoding 2 languages / циклически переключает любое количество локалей', () => {
    const i18n = new I18nService(Locale.RU);
    i18n.registerLocale('fr', { 'menu.exitItem': 'Quitter' });

    expect(i18n.currentLocale).toBe(Locale.RU);
    expect(i18n.cycleLocale()).toBe(Locale.EN);
    expect(i18n.cycleLocale()).toBe('fr');
    expect(i18n.cycleLocale()).toBe(Locale.RU);
  });
});
