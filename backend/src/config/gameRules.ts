// Game constants and configurable edge-case rules for Mimic.
// Isolated here per HANDOFF.md §4 so tuning is a one-file change. The backend game loop (Milestone 6) imports these;
// the frontend mirrors the same values in its own config to stay in sync.

/* ------------------------------------------------------------------ *
 * Core tunables                                                       *
 * ------------------------------------------------------------------ */

/** A room cannot start with fewer than this many connected players (§3.4/§3.5 start gate). */
export const MIN_PLAYERS = 3;

/** Max chat message length, trimmed (§3.4). Enforced server-side; clients may soft-guard for UX only. */
export const MAX_CHAT_MESSAGE_LENGTH = 500;

/** Fixed voting window once a round reaches 0:00 — always 1 minute / `1:00` (§3.5). */
export const VOTING_DURATION_SEC = 60;

/** Player aliases and avatars stay fixed for the whole match, never re-randomized mid-game (§4 edge-case #1). */
export const KEEP_IDENTITIES_ACROSS_ROUNDS = true;

/* ------------------------------------------------------------------ *
 * End-trigger thresholds                                              *
 * ------------------------------------------------------------------ */

/** The match ALSO ends when the active (non-eliminated) roster shrinks to <= this many players (§4). This is one of exactly
 * two end triggers; it scales to every lobby size because it counts who is still actively playing, not a fixed casualty count. */
export const MIN_ACTIVE_PLAYERS_TO_END = 2;

/** §4 — maximum number of ordinary-player casualties the village may sustain and STILL win, scaled by starting size:
 * `Math.max(1, Math.floor(initialPlayerCount / 3))`. Used ONLY to decide the winner when the match ends (never as an end
 * trigger): 3–5 players → 1, 6–8 → 2, 9–11 → 3, 12–14 → 4, 15 → 5. */
export function computeMaxAllowedOrdinaryEliminations(initialPlayerCount: number): number {
  return Math.max(1, Math.floor(initialPlayerCount / 3));
}

/** Lobby alias bounds, validated server-side on create + profile update (§3.3, §3.4). Matches roomManager limits. */
export const MIN_ALIAS_LENGTH = 1;
export const MAX_ALIAS_LENGTH = 40;

/* ------------------------------------------------------------------ *
 * Public player aliases                                               *
 * ------------------------------------------------------------------ */
// Sufficiently large pool of unique, animal/fun public aliases. Case-sensitive uniqueness is intentional (e.g. `dOG`).
export const PLAYER_ALIASES: readonly string[] = [
  'Fox', 'Penguin', 'Slow Loris', 'Raccoon', 'dOG', 'Tiger', 'Capybara', 'Wholf', 'Turtle', 'Owl',
  'Hedgehog', 'Koala', 'Monkey', 'Panda', 'Parrot', 'Rabbit', 'Lion', 'Elephant', 'Giraffe', 'Chameleon',
  'Axolotl', 'Bear', 'Deer', 'Dolphin', 'Frog', 'Squirrel', 'Snake', 'Shark', 'Whale', 'Wolf', 'Cat',
  'Dog', 'Chicken', 'Duck', 'Goose', 'Moose', 'Beaver', 'Otter', 'Lemur', 'Meerkat', 'Sloth',
  'Armadillo', 'Kangaroo', 'Ostrich', 'Flamingo', 'Peacock', 'Falcon', 'Lynx', 'Badger', 'Mole', 'Shrew',
  'Weasel', 'Ferret', 'Marmot', 'Wombat', 'Possum', 'Wallaby', 'Meerkat', 'Cheetah', 'Leopard', 'Jaguar',
];

/* ------------------------------------------------------------------ *
 * Avatars (shared with frontend/src/constants/avatars.ts)             *
 * ------------------------------------------------------------------ */
// Kept identical to the frontend registry. Without a shared package these must stay in sync by hand.
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

export const AVATAR_IDS: readonly AvatarId[] = [
  'axolotl', 'bear', 'capybara', 'cat', 'chameleon', 'deer', 'dog', 'dolphin', 'elephant', 'fox',
  'frog', 'giraffe', 'hedgehog', 'koala', 'lion', 'monkey', 'octopus', 'owl', 'panda', 'parrot',
  'penguin', 'rabbit', 'raccoon', 'snake', 'shark', 'slow_loris', 'squirrel', 'tiger', 'whale', 'wolf',
];

/* ------------------------------------------------------------------ *
 * Server-side win / end logic                                         *
 * ------------------------------------------------------------------ */
export type Winner = 'mimic' | 'ordinary';

/** §4 — decide the winning side from elimination state. Ordinary players win IFF the Mimic was eliminated AND the village did
 * not exceed the size-scaled casualty cap (`ordinaryEliminated <= maxAllowedOrdinaryEliminations`); otherwise the Mimic wins.
 * This is evaluated ONLY at match end, so a surviving Mimic always wins (Case C), and an eliminated Mimic only loses when it
 * took too many ordinary players with it (cap exceeded). The old "solo mimic kill" / "2+ ordinary = Mimic win" shortcuts are
 * subsumed here: 0 casualties is always within the cap, and exceeding the cap flips the result to the Mimic. */
export function determineWinner(
  mimicEliminated: boolean,
  ordinaryEliminated: number,
  maxAllowedOrdinaryEliminations: number,
): Winner {
  if (!mimicEliminated) return 'mimic'; // Case C — Mimic survives to the end.
  return ordinaryEliminated <= maxAllowedOrdinaryEliminations ? 'ordinary' : 'mimic';
}
