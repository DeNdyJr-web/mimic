// Shared prop types for Mimic components (§5 — all UI text is routed through this typed `t()` helper).

import type { TranslationKey } from '../locales';

/** Typed translation function passed to every component; falls back to en.json and warns on missing keys. */
export type TranslateFn = (key: TranslationKey, params?: Record<string, unknown>) => string;
