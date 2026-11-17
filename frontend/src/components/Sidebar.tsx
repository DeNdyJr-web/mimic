// Left sidebar (§3.4): the player list, the "code copied" toast slot, and the footer which switches between phases —
// lobby phase shows the copyable `Lobby code` pill (+ host `Start`), round phase shows the role card. The 62px self
// avatar is purely decorative: identities are server-assigned (§3.2/§5) so it never opens a profile editor and does
// nothing when clicked. Copy-to-clipboard state is local UI only.

import { type FC, useEffect, useRef, useState } from 'react';

import type { TranslateFn } from './sharedTypes';
import type { RoomPublicState } from '../types';
import { AvatarImage } from './AvatarImage';
import { PlayerCard } from './PlayerCard';

export interface SidebarRole {
  isMimic: boolean;
  targetAlias?: string; // only set for the mimic; never leaked to others (§1)
}

export interface SidebarProps {
  t: TranslateFn;
  roomState: RoomPublicState;
  actorIsHost: boolean;
  myRole?: SidebarRole; // undefined in M5 (roles dealt by server in M6); renders "Find mimic" until then
  onKick: (playerId: string) => void;
  onBan: (playerId: string) => void;
  onStart: () => void;
}

const COPIED_MS = 2000;

export const Sidebar: FC<SidebarProps> = ({ t, roomState, actorIsHost, myRole, onKick, onBan, onStart }) => {
  const [copied, setCopied] = useState(false);
  // `| null` keeps `.current` mutable under the React 19 ref overloads (matches App.tsx's pendingRef pattern).
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const handleCopyCode = async () => {
    try { await navigator.clipboard.writeText(roomState.lobbyCode); }
    catch { /* clipboard unavailable (e.g. insecure context) — toast still gives feedback */ }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const selfPlayerId = roomState.selfPlayerId;
  const isLobby = roomState.phase === 'lobby';
  // §3.4 — host Start gate: disable until >= 3 players are connected (server re-enforces the same rule).
  const canStart = roomState.players.length >= 3;

  return (
    <aside className="lobby-sidebar">
      <div className="player-list">
        {roomState.players.map((player) => (
          <PlayerCard
            key={player.playerId}
            t={t}
            player={player}
            isSelf={player.playerId === selfPlayerId}
            actorIsHost={actorIsHost}
            isLobbyPhase={isLobby} // §1 — host badge + Kick/Ban only during lobby
            onKick={onKick}
            onBan={onBan}
          />
        ))}
      </div>

      <div className="sidebar-toast-slot">
        <div className={`copied-toast${copied ? ' is-visible' : ''}`} role="status" aria-live="polite">
          <span className="copied-toast-text">{t('lobby.codeCopiedToast')}</span>
          <button type="button" className="circle-icon-btn" aria-label={t('lobby.copyClose')} onClick={() => setCopied(false)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="sidebar-footer">
        {isLobby ? (
          <>
            <button type="button" className="lobby-code-btn" onClick={handleCopyCode}>
              {roomState.lobbyCode}
            </button>
            {actorIsHost ? (
              <button
                type="button"
                className="lobby-code-btn lobby-start-btn"
                disabled={!canStart}
                style={{ opacity: canStart ? 1 : 0.5 }}
                title={canStart ? '' : t('lobby.startRequiresMin')}
                onClick={onStart}
              >
                {t('lobby.start')}
              </button>
            ) : null}
          </>
        ) : (
          <div className="role-status-card" title={t('profile.title')}>
            {myRole?.isMimic ? (
              <span>
                {t('roleCard.youAreMimic')}<span className="role-underline">{t('roleCard.mimicKeyword')}</span>
                {'\n'}
                {t('roleCard.yourTargetPrefix')}<span className="role-underline">{myRole.targetAlias ?? ''}</span>
              </span>
            ) : (
              t('roleCard.findMimic')
            )}
          </div>
        )}

        {/* §3.2/§3.4/§5 — player identities are strictly server-assigned and never edited by players, so this 62px
            avatar is purely decorative: no click handler, no hover/cursor feedback (see theme.css). */}
        <button type="button" className="self-footer-avatar-btn" aria-label={t('profile.title')}>
          <AvatarImage avatarId={roomState.players.find((p) => p.playerId === selfPlayerId)?.avatarId ?? roomState.players[0]?.avatarId ?? 'fox'} className="self-footer-avatar" />
        </button>
      </div>
    </aside>
  );
};
