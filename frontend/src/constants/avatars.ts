// Centralized avatar registry for Mimic.
// Source of truth for the AvatarId union used across the app (frontend/src/types.ts).
// Maps every actual .jpg file in `frontend/public/avatars/` to its public URL.
// Do NOT reference missing files or external URLs — only the 30 real assets below are valid.

/** Every assignable avatar id, matching a real file in `frontend/public/avatars/`. */
export type AvatarId =
  | 'axolotl'
  | 'bear'
  | 'capybara'
  | 'cat'
  | 'chameleon'
  | 'deer'
  | 'dog'
  | 'dolphin'
  | 'elephant'
  | 'fox'
  | 'frog'
  | 'giraffe'
  | 'hedgehog'
  | 'koala'
  | 'lion'
  | 'monkey'
  | 'octopus'
  | 'owl'
  | 'panda'
  | 'parrot'
  | 'penguin'
  | 'rabbit'
  | 'raccoon'
  | 'snake'
  | 'shark'
  | 'slow_loris'
  | 'squirrel'
  | 'tiger'
  | 'whale'
  | 'wolf';

// Ordered list (alphabetical) so color assignment is deterministic.
export const AVATAR_ORDER: AvatarId[] = [
  'axolotl', 'bear', 'capybara', 'cat', 'chameleon', 'deer', 'dog', 'dolphin', 'elephant', 'fox',
  'frog', 'giraffe', 'hedgehog', 'koala', 'lion', 'monkey', 'octopus', 'owl', 'panda', 'parrot',
  'penguin', 'rabbit', 'raccoon', 'snake', 'shark', 'slow_loris', 'squirrel', 'tiger', 'whale', 'wolf',
];

// Public URL for each avatar. Vite copies `public/` to the build root, so `/avatars/<name>.jpg` resolves at runtime.
export const AVATARS: Record<AvatarId, string> = Object.fromEntries(
  AVATAR_ORDER.map((id) => [id, `/avatars/${id}.jpg`]),
) as Record<AvatarId, string>;

// Fallback color for each avatar when its image fails to load (circular fallback).
// Points at the `--avatar-*` CSS custom properties defined in HANDOFF.md §2; these are already resolved on
// :root / [data-theme="dark"] / [data-theme="light"], so no hardcoded hex values leak into components.
export const AVATAR_COLORS: Record<AvatarId, string> = Object.fromEntries(
  AVATAR_ORDER.map((id, index) => [id, `--avatar-${['black', 'red', 'cyan', 'green', 'blue', 'purple', 'orange', 'yellow', 'lavender', 'skyblue', 'lime', 'white'][index % 12]}`]),
) as Record<AvatarId, string>;

export const AVATAR_COUNT = AVATAR_ORDER.length;
