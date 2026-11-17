// Server-authoritative room manager for Mimic (Milestone 4).
// Handles real room creation, unique 5-character code generation (excluding ambiguous 0/O and 1/I), active-room
// listing, case-insensitive joining, host hand-off, and automatic cleanup of empty rooms (§3.2–§3.3, §6).
// Game roles/timers/voting live in later milestones; here the manager only owns lobby-phase membership + state.

import type { Socket } from 'socket.io';

import type {
  CastVoteInput,
  PlayerRolePayload,
  Phase,
  RoomListItem,
  RoomPublicState,
  RoomSettings,
  ServerErrorCode,
  VoteResultCard,
} from '../types';
import {
  AvatarId,
  computeMaxAllowedOrdinaryEliminations,
  determineWinner,
  MIN_PLAYERS,
  PLAYER_ALIASES,
  AVATAR_IDS,
  type Winner,
} from '../config/gameRules';
import { reassignMimicTarget, evaluateGameEnd, type GameEndCheck } from '../engine/gameLogic';

/** Internal server-side player record (extends the public shape with session identity for ban/reconnect). */
interface RoomPlayer {
  playerId: string;
  alias: string;
  avatarId: AvatarId;
  socketId: string; // live connection id, used to target broadcasts
  sessionToken: string; // §6 — used to ban and to restore membership on reconnect
  isEliminated: boolean;
  isHost: boolean;
}

/** Characters allowed in a room code: uppercase letters (no O/I) and digits (no 0/1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

/** Lobby name bounds, validated server-side (§3.3). Unicode/Cyrillic/Latin all allowed. */
export const MIN_NAME_LENGTH = 1;
export const MAX_NAME_LENGTH = 40;

export interface Room {
  lobbyCode: string; // canonical uppercase 5-char code (also the map key)
  lobbyName: string;
  settings: RoomSettings;
  players: Map<string, RoomPlayer>;
  hostPlayerId: string;
  /** §3.4/§6 — sessionTokens of players the host banned from this room; joinByCode rejects them (§6). */
  bannedSessionTokens: Set<string>;
  /** §5/§6 — current stage. `lobby` (start gate) → `round` (active countdown) → `voting` → `vote_results` → back to `lobby`, or the end-of-game `reveal`. */
  phase: Phase;
  /** Server-authoritative round countdown, set when the host starts a round (§3.4). Cleared back to undefined in lobby. */
  timeRemainingSec?: number;
  /** §6 — fixed voting-phase countdown (seconds), set at the start of each voting step (§3.5). */
  votingTimeRemainingSec?: number;

  /* ---- §6 roles + votes (kept out of `buildPublicState` so they never leak to public broadcasts) ---- */
  /** The Mimic's playerId for the current match; undefined until roles are dealt on first start. */
  mimicPlayerId?: string;
  /** The Mimic's current target playerId (§3.4/§4). Only ever shown to the Mimic via the private `role` event. */
  targetPlayerId?: string;
  /** §6 — each active voter's cast for the in-progress voting step: playerId -> chosen target, or null for a Skip. */
  votes: Map<string, string | null>;
  /** §6 — round counter (1-based); drives max-round safety limit and per-round target reassignment (§4). */
  roundNumber: number;
  /** §4 — player count at match start; the max-round safety limit is `roundNumber >= initialPlayerCount`. Fixed for the whole match. */
  initialPlayerCount: number;
  /** §6 — playerId eliminated THIS voting step (set during `vote_results`, cleared at the next start/voting). Always an ordinary player. */
  eliminatedPlayerId?: string;
}

export interface CreateInput {
  lobbyName: string;
  roundDurationMinutes: number;
  changeMimicTarget: boolean;
}

export type CreateResult =
  | { status: 'ok'; room: Room }
  | { status: 'error'; code: ServerErrorCode };

export type JoinResult =
  | { status: 'ok'; room: Room }
  | { status: 'error'; code: ServerErrorCode };

/** In-memory registry of every live room, keyed by lowercase lobby code. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  /** Create a room owned by `socket` (host). Validates the name and mints a unique code. */
  createRoom(socket: Socket, input: CreateInput): CreateResult {
    const trimmed = typeof input?.lobbyName === 'string' ? input.lobbyName.trim() : '';
    if (trimmed.length < MIN_NAME_LENGTH) return { status: 'error', code: 'NAME_TOO_SHORT' };
    if (trimmed.length > MAX_NAME_LENGTH) return { status: 'error', code: 'NAME_TOO_LONG' };

    const duration = Number.isInteger(input?.roundDurationMinutes) ? input!.roundDurationMinutes : NaN;
    const roundDurationMinutes = duration >= 1 && duration <= 10 ? duration : 5;
    const changeMimicTarget = Boolean(input?.changeMimicTarget);

    // §3 — leave any prior room first so the socket is never registered in two rooms at once (§6).
    this.detachSocketFromRooms(socket.id);

    const lobbyCode = this.mintUniqueCode();
    const room: Room = {
      lobbyCode,
      lobbyName: trimmed,
      settings: { roundDurationMinutes, changeMimicTarget },
      players: new Map(),
      hostPlayerId: '',
      bannedSessionTokens: new Set(),
      phase: 'lobby',
      votes: new Map(),
      roundNumber: 0,
      initialPlayerCount: 0,
    };

    const player = this.addPlayerToRoom(room, socket);
    room.hostPlayerId = player.playerId;
    player.isHost = true; // §3.3 — the creator is the host (§3.4 moderation/Start gate read this flag)
    room.players.set(player.playerId, player);
    this.rooms.set(room.lobbyCode.toLowerCase(), room);
    return { status: 'ok', room };
  }

  /** §3 — remove `socketId` from every room it is currently registered in, so a single connection can never be double-registered
   * across rooms (double registration would cause the same chat event to be broadcast to that socket twice). Called before
   * joining/creating a new room (§6: "a socket leaves any prior room before joining a new one"). */
  detachSocketFromRooms(socketId: string): void {
    for (const room of this.rooms.values()) {
      const stale = [...room.players.entries()].find(([, player]) => player.socketId === socketId);
      if (stale) this.removePlayer(room, stale[0]);
    }
  }

  /** Join an existing room by (case-insensitive) code. Returns ROOM_NOT_FOUND when unknown. */
  joinByCode(socket: Socket, rawCode: string): JoinResult {
    const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
    if (code.length !== CODE_LENGTH || !/^[A-Z0-9]+$/.test(code)) return { status: 'error', code: 'INVALID_CODE' };

    // §3 — leave any prior room first so the socket is never registered in two rooms at once (§6).
    this.detachSocketFromRooms(socket.id);

    const room = this.rooms.get(code.toLowerCase());
    if (!room) return { status: 'error', code: 'ROOM_NOT_FOUND' };
    // §1 — a match that has already started is no longer joinable; the client shows a localized "already started" error.
    if (room.phase !== 'lobby') return { status: 'error', code: 'GAME_STARTED' };
    // §3.4/§6 — a banned sessionToken cannot rejoin this room (ban is per-token, never per-IP).
    if (room.bannedSessionTokens.has(socket.data.sessionToken)) return { status: 'error', code: 'BANNED' };

    const player = this.addPlayerToRoom(room, socket);
    room.players.set(player.playerId, player);
    return { status: 'ok', room };
  }

  /** Public summaries of every live room for the "Find a lobby" list (§3.2). Never leaks secret data.
   * §1 — only rooms still in the `lobby` phase are listed; matches that have already started are hidden so players
   * cannot join an in-progress game from this list (joinByCode also rejects such joins server-side).
   */
  listRooms(): RoomListItem[] {
    return [...this.rooms.values()]
      .filter((room) => room.phase === 'lobby')
      .map((room) => ({
      lobbyCode: room.lobbyCode,
      lobbyName: room.lobbyName,
      playerCount: room.players.size,
    }));
  }

  /** Remove a player by id; hand off host if the departed player was host; delete empty rooms (§6). */
  removePlayer(room: Room, playerId: string): void {
    const existed = room.players.delete(playerId);
    if (!existed) return;

    if (room.hostPlayerId === playerId) {
      const next = [...room.players.values()][0];
      if (next) { room.hostPlayerId = next.playerId; next.isHost = true; } // §6 — transfer host privileges and flag it
    }
    if (room.players.size === 0) this.rooms.delete(room.lobbyCode.toLowerCase());
  }

  /**
   * Build the public, non-secret RoomPublicState for a room (§1 privacy invariant).
   *
   * `selfPlayerId` optionally marks the recipient's own playerId so clients can label themselves "(you)". It is set
   * server-authoritatively per-recipient (see broadcastRoom / create-join handlers) and omitted when unknown.
   */
  buildPublicState(room: Room, selfPlayerId?: string): RoomPublicState {
    return {
      roomId: room.lobbyCode,
      selfPlayerId,
      phase: room.phase,
      lobbyName: room.lobbyName,
      lobbyCode: room.lobbyCode,
      players: [...room.players.values()].map((p) => ({
        playerId: p.playerId,
        alias: p.alias,
        avatarId: p.avatarId,
        isEliminated: p.isEliminated,
        isHost: p.isHost,
      })),
      roundDurationMinutes: room.settings.roundDurationMinutes,
      changeMimicTarget: room.settings.changeMimicTarget,
      timeRemainingSec: room.timeRemainingSec,
      votingTimeRemainingSec: room.votingTimeRemainingSec,
      // §3.5 — only populated during the `vote_results` step so clients render count badges; never leaks who voted.
      ...(room.phase === 'vote_results' ? { voteResults: this.buildVoteResults(room) } : {}),
      // §3.5 — playerId of whoever was eliminated THIS round (always an ordinary player, never the Mimic).
      ...(room.phase === 'vote_results' && room.eliminatedPlayerId
        ? { eliminatedPlayerId: room.eliminatedPlayerId }
        : {}),
    };
  }

  /** Build the count-only vote tally for every currently-active player (§3.5). Counts never reveal who voted for whom. */
  private buildVoteResults(room: Room): VoteResultCard[] {
    const counts: Record<string, number> = {};
    for (const target of room.votes.values()) {
      if (target !== null) counts[target] = (counts[target] ?? 0) + 1;
    }
    // §3.5 — every participant gets a count badge (the tally never reveals who voted for whom). The player eliminated
    // THIS round is flagged `isEliminated` so their card carries `.is-eliminated` alongside the real count (§3); earlier
    // spectators are likewise flagged and dimmed. A Skip win leaves everyone at their actual received count.
    return [...room.players.values()].map((p) => ({
      playerId: p.playerId,
      votesReceived: counts[p.playerId] ?? 0,
      isEliminated: p.isEliminated,
    }));
  }

  /**
   * Deal the Mimic role and first-round target (§3.4/§4). Picks a random active player as the Mimic and a random other
   * active player as their secret target; both are stored on the room (never broadcast). Returns the Mimic's private
   * payload to be delivered via the dedicated `role` event — ordinary players receive nothing (§1 privacy invariant).
   */
  assignRoles(room: Room): PlayerRolePayload {
    const active = [...room.players.values()];
    const mimicPlayer = active[Math.floor(Math.random() * active.length)];
    const eligibleTargets = active
      .filter((p) => p.playerId !== mimicPlayer.playerId)
      .map((p) => p.playerId);
    const targetId = reassignMimicTarget(undefined, mimicPlayer.playerId, eligibleTargets, room.settings.changeMimicTarget);

    room.mimicPlayerId = mimicPlayer.playerId;
    room.targetPlayerId = targetId;
    room.roundNumber = 1;
    // §4 — capture the starting player count now so the max-round safety limit (`roundNumber >= initialPlayerCount`) is
    // fixed for the whole match, even as players are eliminated and become spectators.
    room.initialPlayerCount = room.players.size;
    // §2 — resolve the target's public alias so the Mimic's private role card can name them (never broadcast to others).
    const target = targetId ? room.players.get(targetId) : undefined;
    return { playerId: mimicPlayer.playerId, isMimic: true, targetPlayerId: room.targetPlayerId, targetAlias: target?.alias ?? '' };
  }

  /**
   * Record a single vote (§3.5) after server-authoritative validation: the voter must be an active, non-eliminated
   * member; a target vote must name another active player (never self); exactly one of {target, skip} may be set.
   * Invalid votes are dropped silently (the client's optimistic UI is simply not confirmed). Returns true when stored.
   */
  recordVote(room: Room, voterId: string, vote: CastVoteInput): boolean {
    const voter = room.players.get(voterId);
    if (!voter || voter.isEliminated) return false; // §4 — eliminated spectators cannot vote
    if (room.phase !== 'voting') return false; // only accepted during the active voting step
    // §2 — a player may submit at most one vote/skip per voting round: reject any second attempt so they can never
    // change their mind or cast twice while waiting for others. The client also hides its own controls once voted.
    if (room.votes.has(voterId)) return false;

    const hasTarget = typeof vote?.targetPlayerId === 'string' && vote.targetPlayerId.length > 0;
    const skip = Boolean(vote?.skip);
    if (!hasTarget && !skip) return false; // must either name a target or explicitly skip
    if (hasTarget && skip) return false; // exactly one option, not both

    if (hasTarget) {
      const target = room.players.get(vote!.targetPlayerId as string);
      if (!target || target.isEliminated) return false; // cannot vote for an eliminated spectator
      if (target.playerId === voterId) return false; // cannot vote for yourself (§3.5)
    }

    room.votes.set(voterId, hasTarget ? (vote!.targetPlayerId as string) : null);
    return true;
  }

  /** §4 — evaluate the two match-end conditions (active roster <= MIN_ACTIVE_PLAYERS_TO_END, or a unanimous Skip) and, if
   * the match ends, decide the winner via the size-scaled final-win rule. */
  checkGameEnd(room: Room): GameEndCheck {
    return evaluateGameEnd(
      [...room.players.values()].map((p) => ({ playerId: p.playerId, isEliminated: p.isEliminated })),
      room.mimicPlayerId,
      room.initialPlayerCount,
      room.votes,
    );
  }

  /** §4 — decide the winning side from a finished room's elimination state using the size-scaled casualty cap. Used by the
   * forfeit path (§7) so a mid-game drop that ends the match resolves the winner through the same canonical rule as a vote.
   * Ordinary win IFF `mimicEliminated && eliminatedOrdinaryCount <= maxAllowedOrdinaryEliminations`; otherwise the Mimic wins. */
  resolveWinner(room: Room): Winner {
    const players = [...room.players.values()];
    const mimicEliminated = !!room.mimicPlayerId && players.some((p) => p.playerId === room.mimicPlayerId && p.isEliminated);
    const ordinaryEliminated = players.filter(
      (p) => p.isEliminated && (!room.mimicPlayerId || p.playerId !== room.mimicPlayerId),
    ).length;
    return determineWinner(mimicEliminated, ordinaryEliminated, computeMaxAllowedOrdinaryEliminations(room.initialPlayerCount));
  }

  /** True when a room has at least MIN_PLAYERS connected (§3.4 start gate). */
  canStart(room: Room): boolean {
    return room.players.size >= MIN_PLAYERS;
  }

  /** Find the room a live socket currently belongs to, by its connection id (used to route chat/moderation). */
  findRoomBySocket(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if ([...room.players.values()].some((p) => p.socketId === socketId)) return room;
    }
    return undefined;
  }

  /** Find the room a `sessionToken` currently belongs to (used to sync a reconnecting client, §6). */
  findRoomBySessionToken(token: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if ([...room.players.values()].some((p) => p.sessionToken === token)) return room;
    }
    return undefined;
  }

  /** Ban `playerId` from `room`: remove them and record their sessionToken so they cannot rejoin this room (§3.4/§6).
   * Returns the (possibly now-empty) room after removal so the caller can broadcast + clean up. Never touches IP (§3.4). */
  banPlayer(room: Room, playerId: string): Room {
    const player = room.players.get(playerId);
    if (player) {
      room.bannedSessionTokens.add(player.sessionToken);
      this.removePlayer(room, playerId);
    }
    return room;
  }

  /**
   * Remove the player owning `token` from whichever room they are in (used on disconnect / ban). Returns the affected
   * room after removal so the caller can broadcast updated state and a system notice to the remaining players.
   */
  removePlayerBySessionToken(token: string): Room | undefined {
    for (const room of this.rooms.values()) {
      const player = [...room.players.values()].find((p) => p.sessionToken === token);
      if (player) {
        this.removePlayer(room, player.playerId);
        return room;
      }
    }
    return undefined;
  }

  /* ------------------------------------------------------------------ *
   * Internal helpers                                                    *
   * ------------------------------------------------------------------ */

  /** Mint a fresh, collision-free 5-char code (never contains 0/O or 1/I). */
  private mintUniqueCode(): string {
    for (let attempt = 0; attempt < 25; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code.toLowerCase())) return code;
    }
    // Extremely unlikely collision storm — fall back to a random suffix and retry next tick via caller.
    return this.mintUniqueCode();
  }

  /** Assign the connecting socket an alias + avatar unique within its room, then register it as a player. */
  private addPlayerToRoom(room: Room, socket: Socket): RoomPlayer {
    const usedAliases = new Set([...room.players.values()].map((p) => p.alias));
    const usedAvatars = new Set([...room.players.values()].map((p) => p.avatarId));
    // §5 — randomly assign an AVAILABLE (unused) avatar from the room's pool, then derive its default name so the
    // avatar and its matching animal alias always agree (e.g. 'penguin' -> 'Penguin'). Random selection avoids the
    // sequential 1st=Axolotl, 2nd=Bear… assignment; avatars are unique per room so their derived names are too — the
    // collision fallback below only matters if a manual alias already shadows this animal's name.
    const availableAvatars = AVATAR_IDS.filter((id) => !usedAvatars.has(id));
    const avatarId = availableAvatars[Math.floor(Math.random() * availableAvatars.length)];
    let alias = this.avatarDisplayName(avatarId);
    if (usedAliases.has(alias)) {
      alias = this.firstUnused(PLAYER_ALIASES, usedAliases);
    }

    return {
      playerId: crypto.randomUUID(),
      alias,
      avatarId,
      socketId: socket.id,
      sessionToken: socket.data.sessionToken,
      isEliminated: false,
      isHost: false,
    };
  }

  /** §4 — map an assigned avatar id to its default display name, e.g. 'penguin' -> 'Penguin', 'slow_loris' -> 'Slow Loris'. */
  private avatarDisplayName(id: AvatarId): string {
    return id.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  private firstUnused<T>(pool: readonly T[], used: Set<T>): T {
    for (const value of pool) if (!used.has(value)) return value;
    // Pool exhausted (shouldn't happen with 60 aliases / 30 avatars in a LAN game): fall back to a suffixed alias.
    let i = 1;
    do {
      const candidate = `${pool[0]}${i}` as T;
      if (!used.has(candidate)) return candidate;
      i++;
    } while (i < 1000);
    return pool[0];
  }
}
