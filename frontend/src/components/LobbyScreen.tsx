// Screen 4 — Lobby & Active Round workspace (§3.4). Orchestrates the live room: subscribes to real-time chat + system
// notices, exposes host moderation / Start through typed socket helpers, and renders the split layout (top bar +
// sidebar + chat). Player identities are server-assigned (§3.2/§5) so there is no profile editing. The countdown timer
// is purely a *view* of the server-authoritative
// `roomState.timeRemainingSec` — no client-side timer (§2 blacklist: never fake timers).

import { type FC, useEffect, useState } from 'react';

import type { TranslateFn } from './sharedTypes';
import { getSocket } from '../api/socket';
import { sendChatMessage, kickPlayer, banPlayer, startGame } from '../api/socket';
import type { ChatMessage, RoomPublicState, SystemNotice } from '../types';
import { Sidebar, type SidebarRole } from './Sidebar';
import { ChatArea, type ChatLine } from './ChatArea';

export interface LobbyScreenProps {
  t: TranslateFn;
  roomState: RoomPublicState;
  myRole?: SidebarRole; // §3.4 — the Mimic's private target (only for the mimic); renders "Find mimic" otherwise
  onLeave: () => void;
}

type Line = ChatLine;

/** Format server-authoritative seconds as M:SS for the top-bar countdown (§3.4). */
function formatTimer(seconds?: number): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export const LobbyScreen: FC<LobbyScreenProps> = ({ t, roomState, myRole, onLeave }) => {
  const [lines, setLines] = useState<Line[]>([]);

  // Subscribe to live events once. Updater functions keep handlers stable without depending on `socket`.
  useEffect(() => {
    const socket = getSocket();
    // §3 — deduplicate incoming chat by its stable server-side messageId, so a message delivered twice (e.g. after a peer
    // joined/left/was kicked and the socket was momentarily double-registered) is only ever appended once (§3).
    const seenMessages = new Set<string>();
    const pushMessage = (message: ChatMessage) => {
      if (seenMessages.has(message.messageId)) return;
      seenMessages.add(message.messageId);
      setLines((prev) => [...prev, { kind: 'message', message }]);
    };
    const pushNotice = (notice: SystemNotice) =>
      setLines((prev) => [...prev, { kind: 'notice', notice }]);

    socket.on('chatMessage', pushMessage);
    socket.on('systemNotice', pushNotice);
    // §3.4 — host starts a match: wipe every prior chat message + system notice so the active match begins empty.
    const handleClearChat = () => {
      seenMessages.clear();
      setLines([]);
    };
    socket.on('clearChat', handleClearChat);
    return () => {
      socket.off('chatMessage', pushMessage);
      socket.off('systemNotice', pushNotice);
      socket.off('clearChat', handleClearChat);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — handlers are stable

  const selfPlayerId = roomState.selfPlayerId;
  const selfPlayer = roomState.players.find((p) => p.playerId === selfPlayerId);
  const actorIsHost = selfPlayer?.isHost ?? false;
  // §4 — eliminated spectators can watch but cannot send chat during a round.
  const canSend = !(selfPlayer?.isEliminated ?? true);

  const handleSend = (text: string) => sendChatMessage(text);
  const handleKick = (playerId: string) => kickPlayer(playerId);
  const handleBan = (playerId: string) => banPlayer(playerId);
  const handleStart = () => startGame();

  return (
    <section id="screen-lobby" className="screen lobby-screen is-active">
      <header className="lobby-topbar">
        <div className="lobby-topbar-left">
          <span>{t('lobby.listPlayers')}</span>
          {roomState.phase === 'lobby' ? (
            <span className="topbar-interactive-label">{t('lobby.playersCount', { count: roomState.players.length })}</span>
          ) : null}
        </div>
        <div className="lobby-topbar-right">
          {roomState.phase === 'round' ? (
            <span className="topbar-interactive-label topbar-timer">{formatTimer(roomState.timeRemainingSec)}</span>
          ) : (
            <span className="topbar-interactive-label">{roomState.lobbyName}</span>
          )}
          <button type="button" className="leave-btn" onClick={onLeave}>{t('lobby.leave')}</button>
        </div>
      </header>

      <div className="lobby-workspace">
        <Sidebar
          t={t}
          roomState={roomState}
          myRole={myRole}
          actorIsHost={actorIsHost}
          onKick={handleKick}
          onBan={handleBan}
          onStart={handleStart}
        />
        <ChatArea t={t} lines={lines} selfPlayerId={selfPlayerId} canSend={canSend} onSend={handleSend} />
      </div>
    </section>
  );
};
