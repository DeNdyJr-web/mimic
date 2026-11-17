# Mimic Localization — Contributor Guide

Mimic ships with six UI languages plus an English (US) fallback:

| Code | Language | File |
| --- | --- | --- |
| `en` | English (US) — default & fallback | `en.json` |
| `en-GB` | English (UK) | `en-GB.json` |
| `ru` | Russian | `ru.json` |
| `uk` | Ukrainian | `uk.json` |
| `es` | Spanish | `es.json` |
| `de` | German | `de.json` |

All strings are centralized in this folder. **Never hardcode UI text in components** and never call a runtime translation API — always go through the type-safe helper (`t`) from `../locales`.

## How translations work

- Each file is a flat JSON object with nested keys (e.g. `home.modals.settings.theme.dark`).
- The active language is stored in `localStorage` under `mimic.locale`; switching it updates instantly, no reload.
- If a key is missing from the active language, the UI falls back to `en.json`. Missing keys also log a dev console warning (once per key).
- Dynamic values use named placeholders: `"{{count}} players"` becomes `"5 players"` via `t('lobby.playersCount', { count: 5 })`.

## Adding a new language

1. **Copy the template.** Duplicate `template.json` into `<code>.json` (e.g. `fr.json`). The template already has every key with an empty string value, so structure is guaranteed correct.
2. **Translate values only — do not rename keys.** Keep the exact same nested key paths as `en.json`. Changing a key name breaks validation and the type-safe helper.
3. **Match types.** Every leaf must have the same JSON type as in `en.json` (strings, numbers, booleans, arrays/objects). For example, if `errors.nameTooShort` is `"…{{min}} characters"` (string) in English, keep it a string in your language too.
4. **Keep placeholders.** Preserve `{alias}`, `{count}`, `{max}`, etc., exactly as written so interpolation still works.
5. **Validate before committing:**
   ```bash
   npm run validate:locales
   ```
   This recursively checks every locale against `en.json` for missing keys, extra keys, structural mismatches, and type mismatches (and that template leaves stay empty). It exits non-zero on any problem.

## Quality checklist

- [ ] Every key in your file exists in `en.json`.
- [ ] No key exists in your file that isn't in `en.json`.
- [ ] All leaf value types match `en.json`.
- [ ] Placeholders are untouched.
- [ ] `npm run validate:locales` passes cleanly.

## Submitting

1. Push your branch to GitHub.
2. Open a Pull Request against `main` with the new language file (and any fixes it surfaces).
3. Reviewers will run `validate:locales`; keep the PR green before merging.

Thanks for helping MIMIC reach more players! 🎭
