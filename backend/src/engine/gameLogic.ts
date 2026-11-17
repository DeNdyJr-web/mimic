// Pure, side-effect-free game-loop decisions for Mimic (§3.5 voting resolution, §4 win/end conditions + edge cases).
// The Socket.IO timer orchestration in `index.ts` calls these; this module never touches sockets or rooms directly, so
// it stays unit-testable and free of I/O concerns. All elimination/win logic is server-authoritative (HANDOFF §1).

import {
  computeMaxAllowedOrdinaryEliminations,
  determineWinner,
  MIN_ACTIVE_PLAYERS_TO_END,
  type Winner,
} from '../config/gameRules';

/** Per-player vote tally for one round (§3.5): counts received by each target plus the distinct Skip bucket. */
export interface VoteTally {
  /** The player eliminated this round, or `undefined` when no one is eliminated (Skip win or any tie at the top). */
  eliminatedPlayerId?: string;
  skipCount: number; // how many eligible voters chose Skip
  countsByPlayer: Record<string, number>; // playerId -> votes received (count only — never who voted for whom)
}

/**
 * Apply the exact §3.5 elimination rules to a completed vote tally.
 *
 * A player is eliminated ONLY when they receive strictly more votes than every other candidate AND strictly more than
 * Skip — i.e. they are the unique maximum among {all players + Skip}. Any tie at the top (Skip included) means no one
 * is eliminated:
 *   - Skip gets the most votes            → no elimination.
 *   - Skip ties with >=1 player for highest → no elimination.
 *   - Two+ players tie for highest         → no elimination.
 *
 * @param votesByVoter maps each active voter to their chosen target, or `null` for a Skip.
 */
export function resolveVoteTally(votesByVoter: ReadonlyMap<string, string | null>): VoteTally {
  const countsByPlayer: Record<string, number> = {};
  let skipCount = 0;
  for (const target of votesByVoter.values()) {
    if (target === null) skipCount += 1;
    else countsByPlayer[target] = (countsByPlayer[target] ?? 0) + 1;
  }

  // Include Skip as a candidate so "strictly more than Skip" is enforced by the unique-maximum check.
  const candidates: ReadonlyArray<readonly [string, number]> = [
    ...Object.entries(countsByPlayer),
    ['__skip__', skipCount],
  ];
  const maxVotes = candidates.reduce((max, [, count]) => Math.max(max, count), 0);
  const leaders = candidates.filter(([, count]) => count === maxVotes);

  // Elimination requires a single, unambiguous leader that is a player (never Skip, never a tie).
  if (leaders.length === 1 && leaders[0][0] !== '__skip__') {
    return { eliminatedPlayerId: leaders[0][0], skipCount, countsByPlayer };
  }
  return { skipCount, countsByPlayer };
}

/** Result of evaluating whether the match should end after a voting round (§4). */
export interface GameEndCheck {
  ended: boolean;
  winner?: Winner; // defined only when `ended` is true
  /** Human-readable trigger, used for server logging / honest reporting — never sent to clients. */
  reason: 'active_players_low' | 'unanimous_skip';
}

/** Player records the end-check needs (public shape only — no secret role/target data). */
export interface EliminationAwarePlayer {
  playerId: string;
  isEliminated: boolean;
}

/**
 * Decide whether the match ends now and, if so, which side won (§4).
 *
 * The match ends ONLY when at least one of exactly two conditions holds — checked after the fixed vote-results window by
 * `advanceAfterResults`:
 *   1. active (non-eliminated) players drop to `<= MIN_ACTIVE_PLAYERS_TO_END` (only 2 or fewer remain), OR
 *   2. every active non-eliminated player voted Skip this round (unanimous Skip — they concluded the Mimic was caught).
 * The Mimic falling is NOT itself an end condition: even in a 15-player lobby the match keeps going blindly round after
 * round with zero hints about whether the Mimic is still active, so ordinary players keep voting until only two remain.
 *
 * The winning side is decided by the EXACT final-win rule (§4) via `determineWinner`, evaluated ONLY at match end:
 * ordinary wins iff `mimicEliminated && ordinaryEliminated <= maxAllowedOrdinaryEliminations`; otherwise the Mimic wins.
 * The casualty cap scales with starting size (`Math.max(1, Math.floor(initialPlayerCount / 3))`), so a small lobby where
 * one ordinary fell still lets the village win, while a large lobby tolerates more casualties before the Mimic is declared
 * the winner. An eliminated Mimic that took too many ordinary players with it (cap exceeded) still yields the win to the
 * Mimic — but this is decided at match end, never as an early trigger.
 *
 * @param players          active + eliminated player records for this room.
 * @param mimicPlayerId    the Mimic's playerId, or undefined before roles are dealt.
 * @param initialPlayerCount player count at match start; bounds the size-scaled casualty cap (§4).
 * @param votesByVoter     each active voter's cast for THIS round (playerId -> target, or null for Skip). Used to detect
 *                         an unanimous Skip. Omit when there is no voting round to evaluate.
 */
export function evaluateGameEnd(
  players: ReadonlyArray<EliminationAwarePlayer>,
  mimicPlayerId: string | undefined,
  initialPlayerCount: number,
  votesByVoter?: ReadonlyMap<string, string | null>,
): GameEndCheck {
  const mimicEliminated = !!mimicPlayerId && players.some((p) => p.playerId === mimicPlayerId && p.isEliminated);
  const ordinaryEliminated = players.filter(
    (p) => p.isEliminated && (!mimicPlayerId || p.playerId !== mimicPlayerId),
  ).length;

  // §4 — unanimous Skip: every active non-eliminated player opted out of voting and chose to conclude the game. Requires
  // that *every* active player actually cast a (Skip) vote this round. Winner per the exact final-win rule.
  if (votesByVoter && initialPlayerCount > 0) {
    const activeIds = players.filter((p) => !p.isEliminated).map((p) => p.playerId);
    const allActiveVoted = activeIds.length > 0 && activeIds.every((id) => votesByVoter.has(id));
    const allSkipped = activeIds.every((id) => votesByVoter.get(id) === null);
    if (allActiveVoted && allSkipped) {
      return { ended: true, winner: determineWinner(mimicEliminated, ordinaryEliminated, computeMaxAllowedOrdinaryEliminations(initialPlayerCount)), reason: 'unanimous_skip' };
    }
  }

  // §4 — active players drop to <= MIN_ACTIVE_PLAYERS_TO_END. Winner per the exact final-win rule (an eliminated Mimic
  // within the casualty cap still lets the village win; exceeding it, or a surviving Mimic, gives the win to the Mimic).
  const activeCount = players.filter((p) => !p.isEliminated).length;
  if (activeCount <= MIN_ACTIVE_PLAYERS_TO_END) {
    return { ended: true, winner: determineWinner(mimicEliminated, ordinaryEliminated, computeMaxAllowedOrdinaryEliminations(initialPlayerCount)), reason: 'active_players_low' };
  }

  // Neither §4 end condition fired — continue to the next round (§4: never end just because the Mimic fell). The former
  // Mimic becomes a spectator; beginNextRound reuses the same role for them until an end condition eventually fires.
  return { ended: false, reason: 'active_players_low' };
}

/**
 * Pick the Mimic's target for a new round (§4). Returns the previous target when it is still valid and `changeMimicTarget`
 * is OFF; otherwise picks a fresh random eligible target.
 *
 * @param currentTargetId   the Mimic's target from the prior round (undefined on the first round).
 * @param mimicPlayerId     the Mimic's own playerId (never re-targeted at themselves).
 * @param eligibleActiveIds active (non-eliminated) players who may be targeted — already excludes the Mimic + spectators.
 * @param changeMimicTarget ON  → new target each round; OFF → keep the previous one if still valid.
 */
export function reassignMimicTarget(
  currentTargetId: string | undefined,
  mimicPlayerId: string,
  eligibleActiveIds: ReadonlyArray<string>,
  changeMimicTarget: boolean,
): string {
  const candidates = eligibleActiveIds.filter((id) => id !== mimicPlayerId);
  if (candidates.length === 0) return currentTargetId ?? ''; // no eligible target left (pre-end edge case)

  // OFF + a still-valid previous target → keep it (§4).
  if (!changeMimicTarget && currentTargetId && candidates.includes(currentTargetId)) {
    return currentTargetId;
  }
  // ON, or the previous target was eliminated → pick a fresh random eligible target.
  return candidates[Math.floor(Math.random() * candidates.length)];
}
