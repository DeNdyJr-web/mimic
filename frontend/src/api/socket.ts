// Shared Socket.IO client for Mimic (Milestone 4).
//
// Exposes a single lazily-created, same-origin `socket.io-client` connection plus the per-tab session token that the
// server validates on connect (§6). Same-origin so Vite's `/socket.io` proxy forwards to the backend on :3000 during
// development and the backend serves it directly in production (Milestone 7) — no hardcoded URLs leak into components.

import { io, type Socket } from 'socket.io-client';

import type {
  CastVoteInput,
  ChatMessageInput,
  CreateRoomInput,
  JoinByCodeInput,
  RoomListItem,
  RoomPublicState,
  ServerError,
  SystemNotice,
} from '../types';
import type {
  SocketIOClientToServerEvents,
  SocketIOServerToClientEvents,
} from '../types';

/** sessionStorage key for the per-tab session token (§6). Each browser tab is therefore a distinct player. */
export const SESSION_TOKEN_KEY = 'mimic.sessionToken';

/** Generate a short opaque token; stored in sessionStorage so it survives refreshes within a single tab. */
function generateToken(): string {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Return the current tab's session token, creating + persisting it in sessionStorage on first use (§6). */
export function getSessionToken(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (existing) return existing;
  } catch {
    /* storage unavailable (e.g. private mode) — fall through to an in-memory token so the app still runs */
  }
  const token = generateToken();
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch {
    /* ignore — token stays in memory only */
  }
  return token;
}

let socket: Socket | null = null;

/**
 * Create (once) and return the shared Socket.IO client. Auth carries the per-tab session token (§6).
 *
 * The socket is left at its default event typing because socket.io-client v4.8.x's `io()` takes no type arguments and
 * annotating the variable makes `emit` resolve every event's args to `never` (a known limitation of this version's
 * typed-events inference). Event-name + arg safety is instead provided by the typed emit helpers below, which pass
 * well-formed, strongly-typed payloads. Same-origin so Vite proxies /socket.io -> :3000 in dev and the backend serves
 * it directly in production (Milestone 7).
 */
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    forceNew: true,
    reconnection: true,
    auth: { sessionToken: getSessionToken() },
  });
  return socket;
}

/** Disconnect the shared client (used when leaving a room). Safe to call multiple times. */
export function disconnectSocket(): void {
  socket?.disconnect();
}

/* ------------------------------------------------------------------ *
 * Thin, typed emit helpers — keeps components free of raw event names *
 * ------------------------------------------------------------------ */

export function createRoom(lobbyName: string, roundDurationMinutes: number, changeMimicTarget: boolean): void {
  getSocket().emit('createRoom', { lobbyName, roundDurationMinutes, changeMimicTarget } as CreateRoomInput);
}

export function joinByCode(code: string): void {
  getSocket().emit('joinByCode', { code } as JoinByCodeInput);
}

export function listRooms(): void {
  getSocket().emit('listRooms');
}

export function leaveRoom(): void {
  getSocket().emit('leaveRoom');
}

// §3.4 — lobby chat + host moderation (Kick/Ban by sessionToken) + the Start precondition.

export function sendChatMessage(text: string): void {
  getSocket().emit('chatMessage', { text } as ChatMessageInput);
}

/** Host-only moderation. `kick` removes the player (rejoinable with the code); `ban` also records their sessionToken (§3.4/§6). */
export function kickPlayer(playerId: string): void {
  getSocket().emit('kickPlayer', playerId);
}

export function banPlayer(playerId: string): void {
  getSocket().emit('banPlayer', playerId);
}

/** Host starts the round; server enforces the >= MIN_PLAYERS precondition (§3.4). */
export function startGame(): void {
  getSocket().emit('startGame');
}

/** §3.5 — cast a vote for another active player OR skip (exactly one option). Server validates eligibility + tallies (§3.5). */
export function castVote(targetPlayerId?: string, skip?: boolean): void {
  getSocket().emit('castVote', { targetPlayerId, skip } as CastVoteInput);
}
