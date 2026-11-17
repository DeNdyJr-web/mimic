// Theme management for Mimic (§2, §6).
//
// Applies `data-theme="dark"` / `data-theme="light"` on <html> and persists the user's choice (System/Dark/Light) in
// localStorage. `System` resolves via `prefers-color-scheme` and re-applies live when the OS theme changes.

/** User-selectable theme mode, matching the Settings dropdown options (§3.1). */
export type ThemeMode = 'system' | 'dark' | 'light';

/** localStorage key for the persisted theme choice (§6). */
export const THEME_STORAGE_KEY = 'mimic.theme';

const MODES: readonly ThemeMode[] = ['system', 'dark', 'light'];

/** Resolve a stored/persisted string to a valid ThemeMode, defaulting to System. */
export function parseTheme(value: string | null | undefined): ThemeMode {
  return (value && MODES.includes(value as ThemeMode) ? value : 'system') as ThemeMode;
}

/** Compute the concrete `data-theme` attribute for a mode, resolving System via the OS preference. */
function resolveDataTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') {
    const prefersDark = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

/** Apply the theme to <html> and persist the choice in localStorage (§6). Safe no-ops when storage is unavailable. */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = resolveDataTheme(mode);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* storage may be unavailable (private mode / SSR) — the in-memory `mode` still drives this session */
  }
}

/** Read the persisted theme choice, defaulting to System. */
export function getStoredTheme(): ThemeMode {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}
