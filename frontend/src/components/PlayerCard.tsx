// Single player row in the lobby sidebar (§3.4). Shows the 58px avatar, bold alias with `(you)` / `(host)` suffixes, and —
// for the host only — `Kick` / `Ban` moderation buttons on every OTHER player's card. Eliminated players get the
// `.is-eliminated` styling (dimmed name + avatar opacity) per §3.4.

import { type FC } from 'react';

import type { TranslateFn } from './sharedTypes';
import type { PlayerPublicState } from '../types';
import { AvatarImage } from './AvatarImage';

export interface PlayerCardProps {
  t: TranslateFn;
  player: PlayerPublicState;
  isSelf: boolean; // this record is the current viewer
  actorIsHost: boolean; // the current viewer holds host privileges (shows mod buttons)
  isLobbyPhase: boolean; // §1 — host badge + Kick/Ban are only visible in lobby; hidden during play so everyone looks equal
  onKick: (playerId: string) => void;
  onBan: (playerId: string) => void;
}

/** Builds the display name with the correct `(you)` / `(host)` suffixes (§3.4).
 * The `(host)` suffix is hidden once play begins so every participant looks equal during a match (§1). */
function displayName(t: TranslateFn, player: PlayerPublicState, isSelf: boolean, inLobby: boolean): string {
  const base = player.alias;
  if (isSelf) return `${base} ${t('lobby.youSuffix')}${player.isHost && inLobby ? ` ${t('lobby.hostSuffix')}` : ''}`;
  return player.isHost && inLobby ? `${base} ${t('lobby.hostSuffix')}` : base;
}

export const PlayerCard: FC<PlayerCardProps> = ({ t, player, isSelf, actorIsHost, isLobbyPhase, onKick, onBan }) => {
  const eliminated = player.isEliminated;
  const label = displayName(t, player, isSelf, isLobbyPhase);

  return (
    <div className={`player-card${eliminated ? ' is-eliminated' : ''}`}>
      <div className="player-info">
        <AvatarImage avatarId={player.avatarId} className="player-avatar" style={{ opacity: eliminated ? 0.5 : 1 }} />
        <span className="player-name">{label}</span>
      </div>

      {actorIsHost && !isSelf && isLobbyPhase ? (
        <div className="host-actions">
          <button type="button" className="mod-btn" onClick={() => onKick(player.playerId)}>
            {t('lobby.kick')}
          </button>
          <button
            type="button"
            className="mod-btn mod-btn--danger"
            aria-label={t('lobby.banAria', { alias: player.alias })}
            onClick={() => onBan(player.playerId)}
          >
            {t('lobby.ban')}
          </button>
        </div>
      ) : null}
    </div>
  );
};
