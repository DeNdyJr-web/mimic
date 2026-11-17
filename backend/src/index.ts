import fs from 'node:fs';
import net from 'node:net';
import path from 'path';
import express, { type Express } from 'express';
import http from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';

import { RoomManager, type CreateInput, type Room } from './managers/roomManager';
import type {
  CastVoteInput,
  ChatMessage,
  EndOfGameReveal,
  ModerationAction,
  Phase,
  PlayerRolePayload,
  RoomPublicState,
  ServerErrorCode,
  SystemNoticeType,
} from './types';
import {
  AvatarId,
  MAX_CHAT_MESSAGE_LENGTH,
  MIN_ACTIVE_PLAYERS_TO_END,
  MIN_PLAYERS,
  VOTING_DURATION_SEC,
  type Winner,
} from './config/gameRules';
import { reassignMimicTarget, resolveVoteTally } from './engine/gameLogic';

// §6 — extend Socket.IO's socket data so `socket.data.sessionToken` is typed without casting.
declare module 'socket.io' {
  interface SocketData {
    sessionToken: string;
  }
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

/** §6 — a transient disconnect keeps a player's lobby membership for this long before it is dropped, so a reconnect restores them (§3.4). */
const RECONNECT_GRACE_MS = 45_000;

// Express app. In production (Milestone 7) this also serves the built frontend via `express.static`, so LAN devices can
// open a single backend URL and get both the API + UI. The path is resolved two levels up to `frontend/dist` from BOTH
// run contexts (`backend/src` under `tsx dev`, `backend/dist` under `node dist/index.js`) — a bare `'dist'` would
// otherwise point at the compiled *server* dir in production and 404 on every page. The existence guard keeps dev quiet
// when no frontend build exists yet.
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
const app: Express = express();
if (fs.existsSync(FRONTEND_DIST)) app.use(express.static(FRONTEND_DIST));

// Socket.IO server attached to the same HTTP server.
// NOTE: The typed event contract (ClientToServerEvents / ServerToClientEvents / RoomPublicState) is defined in
// `src/types.ts`. Room membership + code generation live in `managers/roomManager.ts`; chat/moderation/start live here.
// A single HTTP server is shared by both Express (static assets) and Socket.IO — they must not run on separate
// servers, or the /socket.io/ handshake would 404.
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*' } });

const roomManager = new RoomManager();

/** Every active session token mapped to its live Socket, used to prevent duplicate concurrent sockets (§6). */
const tokenToSocket = new Map<string, Socket>();

/** §6 — tokens with a pending grace-window removal (sessionToken -> timer handle). */
const reconnectGrace = new Map<string, ReturnType<typeof setTimeout>>();

/** §5 — per-room authoritative round countdown timers (lobbyCode -> interval handle), cleared when the room leaves `round`. */
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** §6 — end-of-game reveal staging timers (lobbyCode -> {stage1, stage2}), cleared when the room leaves `reveal`. */
const revealTimers = new Map<
  string,
  { stage1: ReturnType<typeof setTimeout>; stage2: ReturnType<typeof setTimeout> }
>();

/* ------------------------------------------------------------------ *
 * Socket helpers                                                     *
 * ------------------------------------------------------------------ */

/** A valid session token is a short non-empty string generated client-side and stored in sessionStorage. */
function normalizeToken(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128 ? value : null;
}

/**
 * Read the `sessionToken` from a freshly connected socket.
 *
 * Socket.IO v4 delivers client auth inside the CONNECT packet, which surfaces on `socket.handshake.auth`. In this
 * codebase's runtime (Socket.IO 4.8.x) `socket.auth` / `socket.data` are NOT populated with it, so reading those would
 * silently drop every token and reject all clients. We read `handshake.auth` first and fall back to `socket.auth`
 * for forward-compatibility.
 */
function readSessionToken(socket: Socket): string | null {
  const handshake = socket.handshake as { auth?: { sessionToken?: unknown } };
  const direct = (socket as { auth?: { sessionToken?: unknown } }).auth;
  return normalizeToken(handshake?.auth?.sessionToken ?? direct?.sessionToken);
}

/** Find the internal player record owning `sessionToken` within `room`, returning its playerId (or undefined). */
function findSelfId(
  room: { players: Map<string, { playerId: string; sessionToken: string }> },
  sessionToken: string,
): string | undefined {
  return [...room.players.values()].find((p) => p.sessionToken === sessionToken)?.playerId;
}

/** Find the internal player record owning `socketId` within `room`, or undefined. */
function findPlayerBySocketId(room: Room, socketId: string) {
  return [...room.players.values()].find((p) => p.socketId === socketId);
}

/** Emit a machine-readable error mapped to a localized client key (§7.4). Never send raw messages. */
function emitError(socket: Socket, code: ServerErrorCode, params?: Record<string, string | number>): void {
  socket.emit('error', { code, params });
}

/** Broadcast an event to every current member of `room` (server-authoritative recipient set — excludes kicked/banned). */
function broadcastToRoom(room: Room, event: string, payload: unknown): void {
  for (const player of room.players.values()) io.to(player.socketId).emit(event, payload);
}

/** Per-recipient public state with `selfPlayerId` marked (§3.4 "(you)" labeling), sent to each member. */
function broadcastRoomState(room: Room): void {
  for (const player of room.players.values()) {
    const state = roomManager.buildPublicState(room, player.playerId);
    io.to(player.socketId).emit('roomState', state);
  }
}

/** System notice to every member except `excludePlayerId` (§3.4 chat notices). */
function broadcastSystemNotice(room: Room, notice: { type: SystemNoticeType; playerId: string; alias?: string }, excludePlayerId = ''): void {
  for (const player of room.players.values()) {
    if (player.playerId === excludePlayerId) continue;
    io.to(player.socketId).emit('systemNotice', notice);
  }
}

/** Start the authoritative round countdown for `room` (§3.4). Clears any existing timer first. */
function startRoundTimer(room: Room): void {
  stopRoundTimer(room); // clears interval + returns the room to `lobby` if it was mid-round
  room.phase = 'round'; // §6 — authoritative round phase (drives the live top-bar countdown on clients)
  const total = Math.max(1, Math.round(room.settings.roundDurationMinutes * 60));
  room.timeRemainingSec = total;
  broadcastRoomState(room);
  const handle = setInterval(() => {
    if (room.phase !== 'round') { stopRoundTimer(room); return; }
    room.timeRemainingSec = Math.max(0, (room.timeRemainingSec ?? 0) - 1);
    broadcastRoomState(room);
    if ((room.timeRemainingSec ?? 0) === 0) beginVoting(room); // §6 — round ended → voting step
  }, 1000);
  roomTimers.set(room.lobbyCode, handle);
}

/** Clear a room's countdown timer and return it to lobby state (§3.4). */
function stopRoundTimer(room: Room): void {
  const existing = roomTimers.get(room.lobbyCode);
  if (existing) { clearInterval(existing); roomTimers.delete(room.lobbyCode); }
  if (room.phase !== 'lobby') {
    room.phase = 'lobby';
    room.timeRemainingSec = undefined;
    broadcastRoomState(room);
  }
}

/** §6 — schedule graceful removal of `token`'s membership after the grace window; a reconnect clears this first. */
function scheduleGraceCleanup(room: Room, token: string): void {
  const existing = reconnectGrace.get(token);
  if (existing) clearTimeout(existing);
  // Capture the alias before the record is removed so the eventual "left" notice stays named (§3.4).
  const alias = [...room.players.values()].find((p) => p.sessionToken === token)?.alias;
  const handle = setTimeout(() => {
    reconnectGrace.delete(token);
    const leftRoom = roomManager.removePlayerBySessionToken(token);
    if (leftRoom) {
      broadcastSystemNotice(leftRoom, { type: 'left', playerId: '', alias });
      // §7 — after the grace window elapses, resolve a forfeit if active players fell too low so the match never stalls.
      maybeResolveForfeit(leftRoom);
    }
  }, RECONNECT_GRACE_MS);
  // Never keep the Node process alive solely for a grace timer.
  handle.unref?.();
  reconnectGrace.set(token, handle);
}

/** Find a player record by id within `room` (§6 helpers). */
function findPlayerById(room: Room, playerId: string) {
  return [...room.players.values()].find((p) => p.playerId === playerId);
}

/** Clear a single suffixed room timer handle (round / vote / next-round) by its map key (§6). clearTimeout clears both intervals and timeouts in Node. */
function clearRoomTimer(key: string): void {
  const existing = roomTimers.get(key);
  if (existing) clearTimeout(existing as unknown as ReturnType<typeof setTimeout>);
  roomTimers.delete(key);
}

/* ------------------------------------------------------------------ *
 * §6 — Server-authoritative game loop (round → voting → results → next/end)
 * ------------------------------------------------------------------ */

const REVEAL_STAGE1_MS = 2500; // §3.6 — Stage 1 "The mimic was..." duration.
const REVEAL_STAGE2_MS = 3500; // §3.6 — Stage 2 "You won / lost" duration.
const RESULTS_BANNER_MS = 4000; // §3 — fixed vote-results window shown after EVERY voting round before advancing (§4).

/** Deliver the secret role ONLY to the Mimic's own socket (§1). Ordinary players receive nothing. */
function emitRoleToMimic(room: Room, rolePayload: PlayerRolePayload): void {
  const mimic = findPlayerById(room, rolePayload.playerId);
  if (mimic) io.to(mimic.socketId).emit('role', rolePayload);
}

/** §6 — transition a finished round into the voting step (§3.5): reset votes and start the fixed 1-minute vote timer. */
function beginVoting(room: Room): void {
  clearRoomTimer(room.lobbyCode); // stop the round interval (keyed by lobbyCode)
  room.phase = 'voting';
  room.votes.clear();
  room.eliminatedPlayerId = undefined;
  room.votingTimeRemainingSec = VOTING_DURATION_SEC;
  broadcastRoomState(room); // clients switch to the voting screen on phase === 'voting'
  startVotingTimer(room);
}

/** §6 — fixed voting-phase countdown (§3.5). Cleared when voting resolves or the room leaves `voting`. */
function startVotingTimer(room: Room): void {
  const key = `${room.lobbyCode}:vote`;
  clearRoomTimer(key);
  const handle = setInterval(() => {
    if (room.phase !== 'voting') { clearInterval(handle); clearRoomTimer(key); return; }
    room.votingTimeRemainingSec = Math.max(0, (room.votingTimeRemainingSec ?? 0) - 1);
    broadcastRoomState(room);
    if ((room.votingTimeRemainingSec ?? 0) === 0) {
      clearInterval(handle);
      clearRoomTimer(key);
      finalizeVoting(room);
    }
  }, 1000);
  roomTimers.set(key, handle);
}

/** §3 — lock votes, tally (exact Skip/tie rules), resolve the elimination, then ALWAYS show the results screen for a
 * fixed window before advancing (§4). Idempotent: once `phase` leaves `voting`, any late call is a no-op, so a timer
 * expiry racing an early "all voted" exit can never double-advance. */
function finalizeVoting(room: Room): void {
  if (room.phase !== 'voting') return; // already finalized — guards the timer/vote race above
  clearRoomTimer(`${room.lobbyCode}:vote`); // stop the vote interval (idempotent — also cleared on timer expiry)

  const tally = resolveVoteTally(room.votes);
  if (tally.eliminatedPlayerId) {
    const target = findPlayerById(room, tally.eliminatedPlayerId);
    if (target) {
      target.isEliminated = true;
      room.eliminatedPlayerId = target.playerId;
    }
  }

  // §3 — results are authoritative via `roomState` (phase === 'vote_results' carries counts + the just-eliminated player).
  room.phase = 'vote_results';
  broadcastRoomState(room);

  scheduleResultsAdvance(room);
}

/** §3 — after the fixed vote-results window, advance to either end-of-game or the next round (§4). */
function scheduleResultsAdvance(room: Room): void {
  const key = `${room.lobbyCode}:results`;
  clearRoomTimer(key);
  const handle = setTimeout(() => { clearRoomTimer(key); advanceAfterResults(room); }, RESULTS_BANNER_MS);
  roomTimers.set(key, handle);
}

/** §3/§4 — evaluate the match-end conditions once the results banner has shown; end the match or start the next round.
 * This is the single funnel through which EVERY voting round advances (§4: never end just because the Mimic fell, and
 * always after the 4s results window). */
function advanceAfterResults(room: Room): void {
  const endCheck = roomManager.checkGameEnd(room);
  if (endCheck.ended) {
    stopAllRoomTimers(room); // no dangling timers before the reveal sequence (§6 cleanup)
    handleGameEnd(room, endCheck.winner!);
    return;
  }
  scheduleNextRound(room);
}

/** §3 — when every active (non-eliminated) player has cast a vote, end voting early rather than waiting for the timer.
 * Disconnects still fall back to the fixed vote timer (§3.5: "disconnects do not stall voting"). */
function maybeEndVotingEarly(room: Room): void {
  if (room.phase !== 'voting') return;
  const activeIds = [...room.players.values()]
    .filter((p) => !p.isEliminated)
    .map((p) => p.playerId);
  if (activeIds.length === 0) return;
  if (activeIds.every((id) => room.votes.has(id))) finalizeVoting(room);
}

/** §4 — after the results banner, begin the next round (§3.4/§4). */
function scheduleNextRound(room: Room): void {
  const key = `${room.lobbyCode}:next`;
  clearRoomTimer(key);
  const handle = setTimeout(() => { clearRoomTimer(key); beginNextRound(room); }, RESULTS_BANNER_MS);
  roomTimers.set(key, handle);
}

/** §4 — begin the next round: reassign the Mimic's target per `changeMimicTarget`, reset votes, restart the countdown. */
function beginNextRound(room: Room): void {
  const eligibleActive = [...room.players.values()]
    .filter((p) => !p.isEliminated && p.playerId !== room.mimicPlayerId)
    .map((p) => p.playerId);
  const newTargetId = reassignMimicTarget(room.targetPlayerId, room.mimicPlayerId ?? '', eligibleActive, room.settings.changeMimicTarget);
  room.targetPlayerId = newTargetId;
  // §4 — if the target changed this round (e.g. Change Mimic target ON, or previous target was eliminated), tell the
  // Mimic privately so their role card reflects the fresh target (§1 privacy: never broadcast to others).
  const nextMimic = findPlayerById(room, room.mimicPlayerId ?? '');
  if (nextMimic && newTargetId) {
    const nextTarget = findPlayerById(room, newTargetId);
    emitRoleToMimic(room, { playerId: nextMimic.playerId, isMimic: true, targetPlayerId: newTargetId, targetAlias: nextTarget?.alias ?? '' });
  }
  room.roundNumber += 1;
  room.votes.clear();
  room.eliminatedPlayerId = undefined;
  startRoundTimer(room); // sets phase='round' + broadcasts
}

/** §3.6 — emit one reveal stage to every client with per-client win/loss (never leaks identity before the card shows). */
function broadcastRevealStage(
  room: Room,
  stage: 1 | 2,
  mimicAlias: string,
  mimicAvatarId: AvatarId | undefined,
  winner: Winner,
  mimicId: string | undefined,
): void {
  for (const player of room.players.values()) {
    const isWinForClient = (player.playerId === mimicId) === (winner === 'mimic');
    io.to(player.socketId).emit('reveal', {
      mimicPlayerId: mimicId ?? '',
      mimicAlias,
      mimicAvatarId,
      isWinForClient,
      revealStage: stage,
    });
  }
}

/** §6 — match ended: send the two server-timed reveal stages (§3.6), then return the room to lobby state for a fresh match. */
function handleGameEnd(room: Room, winner: Winner): void {
  const mimic = findPlayerById(room, room.mimicPlayerId ?? '');
  const mimicAlias = mimic?.alias ?? '';
  const mimicAvatarId = mimic?.avatarId as AvatarId | undefined;

  stopReveal(room); // clear any prior staging for this room before starting a new sequence

  // §3.6 — Stage 1 immediately: "The mimic was..." above the true Mimic's card.
  broadcastRevealStage(room, 1, mimicAlias, mimicAvatarId, winner, room.mimicPlayerId);

  const stage1 = setTimeout(() => {
    // §3.6 — Stage 2 after ~2.5s: keep the card visible, update heading to "You won / lost".
    broadcastRevealStage(room, 2, mimicAlias, mimicAvatarId, winner, room.mimicPlayerId);
  }, REVEAL_STAGE1_MS);

  const stage2 = setTimeout(() => { endRevealAndResetRoom(room); }, REVEAL_STAGE1_MS + REVEAL_STAGE2_MS);
  revealTimers.set(room.lobbyCode, { stage1, stage2 });
}

/** §6 — after the reveal sequence, return the room to lobby state for a fresh match (§3.6). */
function endRevealAndResetRoom(room: Room): void {
  clearRoomTimer(`${room.lobbyCode}:vote`);
  for (const player of room.players.values()) player.isEliminated = false;
  room.phase = 'lobby';
  room.timeRemainingSec = undefined;
  room.votingTimeRemainingSec = undefined;
  room.votes.clear();
  room.roundNumber = 0;
  room.mimicPlayerId = undefined;
  room.targetPlayerId = undefined;
  room.eliminatedPlayerId = undefined;
  broadcastRoomState(room); // clients switch from the reveal screen back to the lobby (§3.6)
}

/** Clear any pending reveal staging timers for `room` (§6). */
function stopReveal(room: Room): void {
  const handles = revealTimers.get(room.lobbyCode);
  if (handles) {
    clearTimeout(handles.stage1);
    clearTimeout(handles.stage2);
    revealTimers.delete(room.lobbyCode);
  }
}

/** §7 — clear every per-room timer handle so a mid-game forfeit can never leave a dangling round/vote/next interval running. */
function stopAllRoomTimers(room: Room): void {
  clearRoomTimer(room.lobbyCode);
  clearRoomTimer(`${room.lobbyCode}:vote`);
  clearRoomTimer(`${room.lobbyCode}:next`);
}

/**
 * §7 — server-authoritative forfeit resolution for mid-game drops. When a player (or the Mimic) leaves during an active
 * match and the count of active (non-eliminated) players falls to `<= MIN_ACTIVE_PLAYERS_TO_END`, end the match now via
 * the same canonical path as an elimination so round progression never stalls waiting for an artificial vote (§4 edge-case #3).
 */
function maybeResolveForfeit(room: Room): void {
  // Only meaningful once roles are dealt and the match is in progress (not lobby/reveal).
  if (!room.mimicPlayerId || room.phase === 'lobby' || room.phase === 'reveal') return;
  const activeCount = [...room.players.values()].filter((p) => !p.isEliminated).length;
  // Everyone dropped — the manager already cleaned up an empty room; nothing to resolve.
  if (activeCount === 0) return;
  if (activeCount <= MIN_ACTIVE_PLAYERS_TO_END) {
    stopAllRoomTimers(room);
    // §4 — the match ends via this same canonical path; resolve the winner through the size-scaled final-win rule so an
    // already-eliminated Mimic still lets the village win within the casualty cap (rather than always awarding the Mimic).
    handleGameEnd(room, roomManager.resolveWinner(room));
  }
}

io.on('connection', (socket) => {
  // `auth` is only typed when the server is instantiated with full event maps; read it defensively here.
  const token = readSessionToken(socket);
  if (!token) {
    // Reject unauthenticated connections: emit a machine-readable error, then drop the socket so it cannot linger.
    emitError(socket, 'INVALID_CODE');
    socket.disconnect(true);
    return;
  }
  socket.data.sessionToken = token;

  // §6 — prevent duplicate concurrent sockets for the same token. Supersede any live connection, then drop it.
  const prevSocket = tokenToSocket.get(token);
  if (prevSocket && prevSocket.id !== socket.id) {
    prevSocket.emit('sessionReplaced');
    prevSocket.disconnect(true);
    tokenToSocket.delete(token);
  }
  tokenToSocket.set(token, socket);

  // §6 — reconnecting into an active lobby: membership was preserved by the grace window, so sync current state
  // immediately and let the client keep its view rather than forcing a rejoin (§3.4).
  const returningRoom = roomManager.findRoomBySessionToken(token);
  if (returningRoom) {
    const selfId = findSelfId(returningRoom, token);
    socket.emit('roomState', roomManager.buildPublicState(returningRoom, selfId));
  }

  // §3.3 — create a lobby; creator becomes host and receives the generated unique code via roomState.
  socket.on('createRoom', (data) => {
    const input: CreateInput = {
      lobbyName: typeof data?.lobbyName === 'string' ? data.lobbyName : '',
      roundDurationMinutes: Number.isInteger(data?.roundDurationMinutes) ? data!.roundDurationMinutes : NaN,
      changeMimicTarget: Boolean(data?.changeMimicTarget),
    };
    const result = roomManager.createRoom(socket, input);
    if (result.status === 'error') {
      // Build params separately so the union resolves to a clean Record<string, string | number> (§7.4 interpolation).
      let params: Record<string, string | number> | undefined;
      if (result.code === 'NAME_TOO_SHORT') params = { min: 1 };
      else if (result.code === 'NAME_TOO_LONG') params = { max: 40 };
      emitError(socket, result.code, params);
      return;
    }
    // Mark the creator as "self" so their lobby view can show "(you)" (§3.3).
    const selfId = findSelfId(result.room, socket.data.sessionToken);
    const state = roomManager.buildPublicState(result.room, selfId);
    socket.emit('roomState', state);
  });

  // §3.2 — join an existing lobby by (case-insensitive) 5-char code.
  socket.on('joinByCode', (data) => {
    const result = roomManager.joinByCode(socket, typeof data?.code === 'string' ? data.code : '');
    if (result.status === 'error') {
      // §3.4/§6 — a banned token is rejected here; the client maps BANNED to its own localized string.
      emitError(socket, result.code);
      return;
    }
    const selfId = findSelfId(result.room, socket.data.sessionToken);
    socket.emit('roomState', roomManager.buildPublicState(result.room, selfId));
    // §3 — the notice names whoever just joined (the joining socket), NOT an existing member. The old code emitted
    // `player.alias` for each current member, so a viewer saw their OWN name in every "joined" notice (§3 bug).
    const joiner = [...result.room.players.values()].find((p) => p.socketId === socket.id);
    for (const player of result.room.players.values()) {
      if (player.socketId === socket.id) continue;
      io.to(player.socketId).emit('roomState', roomManager.buildPublicState(result.room, player.playerId));
      io.to(player.socketId).emit('systemNotice', { type: 'joined' as SystemNoticeType, playerId: '', alias: joiner?.alias ?? '' });
    }
  });

  // §3.2 — list active rooms for the "Find a lobby" list.
  socket.on('listRooms', () => {
    socket.emit('roomsList', roomManager.listRooms());
  });

  // §3.4 — real-time lobby chat, fully server-authoritative. Text is validated (trim + length) and recipients are the
  // current member set; eliminated spectators cannot send game chat (§4). Broadcast to every member including sender.
  socket.on('chatMessage', (data) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;
    const raw = typeof data?.text === 'string' ? data.text : '';
    const text = raw.trim();
    // Empty/whitespace-only is dropped silently (client also soft-guards); over-length messages are rejected server-side.
    if (!text || raw.length > MAX_CHAT_MESSAGE_LENGTH) return;

    const sender = findPlayerBySocketId(room, socket.id);
    if (!sender || sender.isEliminated) return; // §4 — spectators cannot send game chat.

    const message: ChatMessage = {
      messageId: crypto.randomUUID(),
      senderPlayerId: sender.playerId,
      senderAlias: sender.alias,
      senderAvatarId: sender.avatarId,
      text,
      timestamp: Date.now(),
    };
    broadcastToRoom(room, 'chatMessage', message);
  });

  // §3.4 — host moderation: kick a player from the room (they can rejoin with the code). Host-only, server-authoritative.
  socket.on('kickPlayer', (playerId) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;
    const actor = findPlayerBySocketId(room, socket.id);
    if (!actor?.isHost) return; // non-host kick ignored (§3.4 host privileges).
    if (room.phase !== 'lobby') return; // §1 — moderation is lobby-only; ignore Kick/Ban once the match has started.
    const target = room.players.get(playerId as string);
    if (!target || target.socketId === socket.id) return; // can't kick self / unknown player
    // §1 — tell the target's OWN client to leave BEFORE removing them, so they can reset room state + navigate home (§1).
    io.to(target.socketId).emit('moderationAction', { action: 'kicked' as ModerationAction });
    roomManager.removePlayer(room, playerId as string);
    broadcastSystemNotice(room, { type: 'kicked', playerId: target.playerId, alias: target.alias }, target.playerId);
    broadcastRoomState(room);
  });

  // §3.4/§6 — host moderation: ban a player by resolving their OWN sessionToken (never ban by IP in LAN). Host-only.
  socket.on('banPlayer', (playerId) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;
    const actor = findPlayerBySocketId(room, socket.id);
    if (!actor?.isHost) return; // non-host ban ignored (§3.4 host privileges).
    if (room.phase !== 'lobby') return; // §1 — moderation is lobby-only; ignore Kick/Ban once the match has started.
    const target = room.players.get(playerId as string);
    if (!target || target.socketId === socket.id) return; // can't ban self / unknown player
    // §1 — tell the target's OWN client to leave BEFORE removing them, so they can reset room state + navigate home (§1).
    io.to(target.socketId).emit('moderationAction', { action: 'banned' as ModerationAction });
    const leftRoom = roomManager.banPlayer(room, playerId as string);
    broadcastSystemNotice(leftRoom, { type: 'banned', playerId: target.playerId, alias: target.alias }, target.playerId);
    broadcastRoomState(leftRoom);
  });

  // §3.4 — host starts the round. Requires >= MIN_PLAYERS connected; otherwise a localized warning is emitted (§7.4).
  // On success the room transitions to `round` and an authoritative countdown begins (server-authoritative timers).
  socket.on('startGame', () => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;
    const actor = findPlayerBySocketId(room, socket.id);
    if (!actor?.isHost) return; // non-host start ignored (§3.4 host privileges).
    if (room.phase !== 'lobby') return; // §6 — only start from lobby; Milestone 6 owns all other re-entry gating.
    if (!roomManager.canStart(room)) {
      emitError(socket, 'MIN_PLAYERS', { current: room.players.size, required: MIN_PLAYERS });
      return;
    }
    // §6 — deal the secret role and deliver it ONLY to the Mimic's socket (§1); ordinary players learn nothing.
    const rolePayload = roomManager.assignRoles(room);
    emitRoleToMimic(room, rolePayload);
    startRoundTimer(room); // sets phase='round' + starts the authoritative countdown
    // §3.4 — a new match begins: wipe every prior lobby chat message + system notice on all clients so the active
    // match starts from an empty log (the LobbyScreen resets its line list on this event).
    broadcastToRoom(room, 'clearChat', undefined);
  });

  // §3.5 — a player casts a vote (for another active player OR skip). Server validates eligibility + stores it; the tally
  // is fully server-authoritative (§3.5). Invalid votes are dropped silently so optimistic client UI isn't confirmed.
  // §3 — once every active player has voted, end voting early rather than waiting for the timer.
  socket.on('castVote', (data: CastVoteInput) => {
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) return;
    const voter = findPlayerBySocketId(room, socket.id);
    if (!voter) return;
    const stored = roomManager.recordVote(room, voter.playerId, data ?? {});
    if (stored) maybeEndVotingEarly(room);
  });

  // §6 — leave the current room (membership removed; host hand-off + cleanup happen inside the manager).
  socket.on('leaveRoom', () => {
    const grace = reconnectGrace.get(socket.data.sessionToken);
    if (grace) { clearTimeout(grace); reconnectGrace.delete(socket.data.sessionToken); }
    const leavingRoom = roomManager.findRoomBySocket(socket.id);
    if (leavingRoom) { stopRoundTimer(leavingRoom); stopReveal(leavingRoom); }
    // §3 — capture the leaver's name before removal so the "left" notice names them, not an empty string.
    const leaver = [...(leavingRoom?.players.values() ?? [])].find((p) => p.sessionToken === socket.data.sessionToken);
    const room = roomManager.removePlayerBySessionToken(socket.data.sessionToken);
    if (room) {
      broadcastSystemNotice(room, { type: 'left', playerId: leaver?.playerId ?? '', alias: leaver?.alias ?? '' });
      // §7 — a deliberate leave mid-match is also a drop; resolve a forfeit if active players fell too low.
      maybeResolveForfeit(room);
    }
  });

  socket.on('disconnect', () => {
    for (const [t, s] of tokenToSocket) if (s.id === socket.id) tokenToSocket.delete(t);
    const grace = reconnectGrace.get(socket.data.sessionToken);
    if (grace) { clearTimeout(grace); reconnectGrace.delete(socket.data.sessionToken); }
    const room = roomManager.findRoomBySocket(socket.id);
    if (!room) { roomManager.removePlayerBySessionToken(socket.data.sessionToken); return; }
    stopReveal(room);
    // §2 — in the LOBBY phase a closed tab must drop the player immediately so remaining players see "<Alias> left the
    // game" + an updated roster right away (just like Leave/Kick). Only preserve the reconnection grace window while a
    // match is actively in progress (round/voting/reveal), where membership must survive a transient drop.
    if (room.phase === 'lobby') {
      const leaver = [...room.players.values()].find((p) => p.sessionToken === socket.data.sessionToken);
      const leftRoom = roomManager.removePlayerBySessionToken(socket.data.sessionToken);
      if (leftRoom) {
        broadcastSystemNotice(leftRoom, { type: 'left', playerId: leaver?.playerId ?? '', alias: leaver?.alias ?? '' });
        broadcastRoomState(leftRoom);
      }
    } else {
      // §6 — keep membership during the grace window so a reconnect restores it; drop after the window elapses.
      scheduleGraceCleanup(room, socket.data.sessionToken);
    }
  });
});

interface NetInterface { family?: string; internal?: boolean; address?: string; }

function detectLanIp(): string {
  try {
    const netMod = net as unknown as { interfaces(): Record<string, NetInterface[]> };
    const interfaces = netMod.interfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address ?? '';
      }
    }
  } catch {
    /* no usable network interface */
  }
  return '';
}

server.listen(PORT, HOST, () => {
  // In production, print the host machine's LAN IPv4 so other devices on the network can join.
  const base = `http://${HOST}:${PORT}`;
  console.log(`Mimic backend listening on ${base}`);
  const lanIp = detectLanIp();
  if (lanIp) console.log(`LAN URL: http://${lanIp}:${PORT}`);
});
