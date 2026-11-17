// Centralized, type-safe localization provider for Mimic.
// Provides t(key, params?), nested-key lookup, localStorage persistence, immediate reactive language switching,
// fallback to en.json, and dev console warnings for missing keys (HANDOFF.md §5).

import en from './en.json';
import enGB from './en-GB.json';
import ru from './ru.json';
import uk from './uk.json';
import es from './es.json';
import de from './de.json';

// TranslationKey is a generated literal union (see scripts/gen-translation-keys.mjs). The original recursive KeysOf<T>
// mapped type flattened nested keys into individual names ("home" | "title") instead of dotted paths ("home.title"),
// so every valid t() key failed typechecking. The generator walks en.json and emits the exact union below.
import type { TranslationKey } from './translationKeys';

const STORAGE_KEY = 'mimic.locale';

/** Supported UI languages (matches the six real locale files). */
export type Lang = 'en' | 'en-GB' | 'ru' | 'uk' | 'es' | 'de';

export const SUPPORTED_LANGS: readonly Lang[] = ['en', 'en-GB', 'ru', 'uk', 'es', 'de'];

/** All loaded locales keyed by language code. */
const LOCALES: Record<Lang, unknown> = { en, 'en-GB': enGB, ru, uk, es, de };

/* ------------------------------------------------------------------ *
 * Deep type inference from en.json (single source of truth for keys)  *
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Deep type inference from en.json (single source of truth for keys) *
 * ------------------------------------------------------------------ */

/**
 * Deep structural type of a JSON value. Written as flat single-level conditionals plus separate aliases because the
 * TypeScript parser in this sandbox rejects nested conditional types and recursion inside template-literal,
 * `[keyof T]`-indexed mapped types (TS1005). This equivalent form parses cleanly while yielding the same deep type.
 */
type DeepArr<T> = T extends readonly (infer E)[] ? DeepJson<E>[] : never;
type DeepObj<T> = { [K in keyof T]: DeepJson<T[K]> };
export type DeepJson<T> = T extends readonly unknown[] ? DeepArr<T> : DeepObj<T>;

/** All deep structural translations for the current locale shape (used to type interpolated values). */
export type TranslationType = DeepJson<typeof en>;

/**
 * Union of every valid key path found anywhere in the locale tree (intermediate + leaf), enabling autocomplete and
 * key safety. Generated from en.json into `./translationKeys` — see scripts/gen-translation-keys.mjs. Nested dotted
 * paths resolve at runtime via fallback lookup in `t()`.
 */
export type { TranslationKey } from './translationKeys';

/* ------------------------------------------------------------------ *
 * Provider singleton                                                   *
 * ------------------------------------------------------------------ */

class Localization {
  private cache = new Map<Lang, Record<string, unknown>>();
  private language: Lang = 'en';
  private warned = new Set<string>();

  /** Resolve the initial language from localStorage (validated), defaulting to English. */
  private resolveInitial(): Lang {
    if (typeof localStorage === 'undefined') return 'en';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (SUPPORTED_LANGS.includes(stored as Lang) ? (stored as Lang) : 'en') : 'en';
  }

  /** Populate the cache and pick the persisted language. Safe to call once at app start. */
  init(): void {
    this.language = this.resolveInitial();
    for (const lang of SUPPORTED_LANGS) this.cache.set(lang, LOCALES[lang] as Record<string, unknown>);
  }

  getLanguage(): Lang {
    return this.language;
  }

  isSupported(lang: string): lang is Lang {
    return SUPPORTED_LANGS.includes(lang as Lang);
  }

  /** Switch language immediately (synchronously) and persist it. UI re-renders pick up new strings on next render. */
  setLanguage(lang: Lang): void {
    if (!this.isSupported(lang)) throw new Error(`Unsupported locale: ${lang}`);
    this.language = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage may be unavailable in some environments */ }
  }

  /** All translations for the current language (debug/testing). */
  getTranslations(): Record<string, unknown> {
    return this.cache.get(this.language) as Record<string, unknown>;
  }

  private lookup(key: string): string | undefined {
    const root = this.cache.get(this.language);
    if (!root) return undefined;
    let node: unknown = root;
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null || !(part in (node as Record<string, unknown>))) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : undefined;
  }

  private fallbackLookup(key: string): string | undefined {
    // Fall back to English if the active language lacks the key.
    const root = this.cache.get('en');
    if (!root) return undefined;
    let node: unknown = root;
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null || !(part in (node as Record<string, unknown>))) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : undefined;
  }

  private interpolate(value: string, params?: Record<string, unknown>): string {
    if (!params) return value;
    // Locales use double-curly-brace placeholders (e.g. `{{count}}`, `{{alias}}`). Match BOTH braces so the
    // substituted value fully consumes them — a single-brace pattern would leave a stray `{`/`}` in the output.
    return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
      const val = params[name];
      return val === undefined || val === null ? match : String(val);
    });
  }

  /** Translate a key (dot-notation for nesting), interpolate named `{param}` placeholders, and warn on missing keys. */
  t(key: TranslationKey, params?: Record<string, unknown>): string {
    const found = this.lookup(key);
    if (found === undefined) {
      if (!this.warned.has(key)) {
        this.warned.add(key);
        // eslint-disable-next-line no-console
        console.warn(`[MIMIC i18n] Missing translation key: "${key}"`);
      }
      const fallback = this.fallbackLookup(key);
      return fallback ?? key;
    }
    return this.interpolate(found, params);
  }
}

/** Shared localization instance. Call `init()` once at startup (e.g. in main.tsx) before rendering UI. */
export const i18n = new Localization();
