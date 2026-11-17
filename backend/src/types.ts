// Shared game types & Socket.IO contract for Mimic (server side).
// Kept byte-for-byte identical to frontend/src/types.ts except for the AvatarId import path.
// Importing AvatarId from our own constants keeps a single source of truth per project.

import type { AvatarId } from './config/gameRules';

/* ------------------------------------------------------------------ *
 * Phases & shared settings                                             *
 * ------------------------------------------------------------------ */

/** Game phases mapped to screens: §3 (lobby/join/create) and §3.4–§3.6 (lobby/round/voting/reveal). */
export type Phase = 'lobby' | 'round' | 'voting' | 'vote_results' | 'reveal';

export interface RoomSettings {
  roundDurationMinutes: number; // 1..10, validated on room creation
  changeMimicTarget: boolean;   // true = "ON" (new target each round), false = "OFF" (keep previous valid target)
}

/* ------------------------------------------------------------------ *
 * Public, non-secret payloads                                          *
 * ------------------------------------------------------------------ */

/** A player as seen by everyone in the room. Contains only display-safe data — never secret role/target info. */
export interface PlayerPublicState {
  playerId: string;      // stable id for this player within the room
  alias: string;         // public display name
  avatarId: AvatarId;    // assigned avatar (public)
  isEliminated: boolean; // spectator flag once eliminated
  isHost: boolean;       // host flag — NOT secret role information
}

/** Vote tally for one player. Shows the COUNT only — never who voted for whom (§3.5). */
export interface VoteResultCard {
  playerId: string;
  votesReceived: number;
  isEliminated: boolean;
}

/* ------------------------------------------------------------------ *
 * Secret role payload                                                  *
 * ------------------------------------------------------------------ */
/**
 * The Mimic's private assignment. Sent ONLY to the authorized client via the dedicated `role` event — never in any
 * public broadcast. `targetPlayerId` exists only when `isMimic === true` and must remain secret until end-of-game.
 */
export interface PlayerRolePayload {
  playerId: string;      // self id
  isMimic: boolean;
  targetPlayerId?: string;
  /** §1/§3.4 — the Mimic's current target public alias, delivered privately so their role card can name them (§2). */
  targetAlias?: string;
}

/* ------------------------------------------------------------------ *
 * Chat & system notices                                                *
 * ------------------------------------------------------------------ */
export type SystemNoticeType = 'joined' | 'left' | 'kicked' | 'banned';

export interface SystemNotice {
  type: SystemNoticeType;
  playerId: string;      // affected player id (null for room-level notices)
  alias?: string;        // affected player's public name
}

/** Client chat input. Non-empty after trim and within MAX_CHAT_MESSAGE_LENGTH — validated server-side (§3.4). */
export interface ChatMessageInput {
  text: string;
}

/** §1/§3.4 — host moderation outcome delivered to the TARGET's own socket before they are removed from the room.
 * `kicked` = removed but may rejoin with the code; `banned` = removed and their sessionToken is recorded so they cannot rejoin (§6). */
export type ModerationAction = 'kicked' | 'banned';

/** Server -> client chat message broadcast to every room member (§3.4). `senderPlayerId` lets each recipient mark their own bubble `.is-self`. */
export interface ChatMessage {
  messageId: string; // stable id (client key); collision-free via crypto.randomUUID()
  senderPlayerId: string;
  senderAlias: string;
  senderAvatarId: AvatarId;
  text: string;
  timestamp: number; // server Date.now() for ordering
}

/* ------------------------------------------------------------------ *
 * Voting (§3.5)                                                      *
 * ------------------------------------------------------------------ */
/**
 * Client -> server vote cast during the voting step (§3.5). Exactly one of the two fields is set:
 *   - vote for a player: `{ targetPlayerId }`
 *   - skip:               `{ skip: true }` (no `targetPlayerId`).
 *
 * The server re-validates eligibility (voter must be an active, non-eliminated member; target must be another active
 * player) and never trusts the client's choice. Tallying + exact Skip/tie resolution is fully server-authoritative.
 */
export interface CastVoteInput {
  targetPlayerId?: string; // eligible active OTHER player to eliminate
  skip?: boolean;          // true → this voter opts out of voting (counted as a distinct option)
}

/* ------------------------------------------------------------------ *
 * Public room state                                                    *
 * ------------------------------------------------------------------ */
/**
 * Broadcast to everyone in the room.
 *
 * PRIVACY INVARIANT (non-negotiable, §1): this and every other public payload deliberately OMIT `mimicPlayerId` and
 * `targetPlayerId`. The secret Mimic identity is only ever delivered through the private `role` event (§3) or the
 * end-of-game `reveal` event — never via roomState or any public broadcast.
 */
export interface RoomPublicState {
  roomId: string;
  /** The recipient's own playerId within this room (server marks the current socket via sessionToken). Enables "(you)" labeling. */
  selfPlayerId?: string;
  phase: Phase;
  lobbyName: string;
  lobbyCode: string;
  players: PlayerPublicState[];
  roundDurationMinutes: number;
  changeMimicTarget: boolean;
  timeRemainingSec?: number;        // active-round countdown (seconds)
  votingTimeRemainingSec?: number;  // voting-phase countdown (seconds)
  voteResults?: VoteResultCard[];   // tally counts only
  eliminatedPlayerId?: string;      // player eliminated THIS round — always an ordinary player, never the Mimic (§3.5)
}

/* ------------------------------------------------------------------ *
 * End-of-game reveal                                                   *
 * ------------------------------------------------------------------ */
/** Sent ONLY when the match ends (§3.6). The true Mimic identity is safe to broadcast once play has stopped. */
export interface EndOfGameReveal {
  mimicPlayerId: string;   // the true Mimic (safe post-game)
  mimicAlias: string;
  mimicAvatarId: AvatarId;
  isWinForClient: boolean; // false → "You lost!" for this client; true → "You won!"
  revealStage?: 1 | 2;     // §6 — server-timed staging: 1 = "The mimic was...", 2 = "You won / lost" (defaults to 1)
}

/* ------------------------------------------------------------------ *
 * Client -> server input payloads                                      *
 * ------------------------------------------------------------------ */
export interface CreateRoomInput {
  lobbyName: string;      // trimmed, non-empty, length validated server-side
  roundDurationMinutes: number; // 1..10
  changeMimicTarget: boolean;   // ON/OFF
}

export interface JoinByCodeInput {
  code: string;           // case-insensitive 5-char lookup
}

/** Public summary of an active room for the "Find a lobby" list (§3.2). Never reveals secret data. */
export interface RoomListItem {
  lobbyCode: string;      // 5-char code (uppercase on the wire)
  lobbyName: string;
  playerCount: number;
}

/* ------------------------------------------------------------------ *
 * Socket.IO typed contracts                                            *
 * ------------------------------------------------------------------ */

/** Client -> server actions. */
export type SocketIOClientToServerEvents = {
  createRoom: [data: CreateRoomInput];
  joinByCode: [data: JoinByCodeInput];
  listRooms: [];
  chatMessage: [data: ChatMessageInput];
  kickPlayer: [playerId: string]; // host only
  banPlayer: [playerId: string]; // host only — server resolves the target's own sessionToken to ban (§3.4, §6)
  startGame: []; // host only — requires >= MIN_PLAYERS connected (§3.4 start gate)
  castVote: [data: CastVoteInput]; // §3.5 — eligible active player votes for another OR skips (server validates)
  leaveRoom: [];
};

/** Server -> client events. `role` is PRIVATE (Mimic only); everything else is room/public or end-of-game. */
export type SocketIOServerToClientEvents = {
  roomState: [state: RoomPublicState];
  role: [payload: PlayerRolePayload]; // PRIVATE — emitted only to the authorized Mimic client
  systemNotice: [notice: SystemNotice];
  // §3.4 — host starts a match: wipe all prior lobby chat + system notices so the active match begins with an empty log.
  clearChat: [];
  // §3.5 results are delivered authoritatively through `roomState` (phase === 'vote_results' carries voteResults +
  // eliminatedPlayerId); no separate tally/elimination events are needed, so roomState stays the single source of truth.
  reveal: [reveal: EndOfGameReveal]; // end-of-game only
  roomsList: [rooms: RoomListItem[]]; // active rooms for the "Find a lobby" list (§3.2)
  error: [err: ServerError]; // validation / lookup failure, mapped to a locale key on the client (§7.4)
  sessionReplaced: []; // §6 — this socket was superseded by another connection with the same token; stop reconnecting it
  moderationAction: [action: ModerationAction]; // §1/§3.4 — host kicked/banned you; emit BEFORE removal so the client can reset + return home (§1)
};

/** A machine-readable failure code. The client maps `code` to a localized string via t() — never send raw messages.
 * `BANNED` / `ALIAS_TAKEN` / `INVALID_AVATAR` gate lobby moderation + profile updates (§3.4, §6). */
export type ServerErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'GAME_STARTED' // a match has already begun; the room is no longer joinable (§1)
  | 'INVALID_CODE'
  | 'NAME_TOO_SHORT'
  | 'NAME_TOO_LONG'
  | 'MIN_PLAYERS' // start gate: fewer than MIN_PLAYERS connected (§3.4)
  | 'BANNED' // banned from this room by the host (§3.4/§6)
  | 'ALIAS_INVALID' // alias out of range OR already taken in the room (§3.4)
  | 'INVALID_AVATAR'; // avatar id missing or already claimed by another player (§3.4)

export interface ServerError {
  code: ServerErrorCode;
  params?: Record<string, string | number>; // interpolation values for localized error strings (e.g. {min})
}
