// Screen 5 — Voting & Elimination (§3.5). Renders the authoritative room state: a 2-column player grid where each
// eligible OTHER player shows a `Vote` pill during the active voting step, which then transforms into a count-only badge
// once the server tallies (never revealing who voted for whom). The `Skip` button hides after tally; an elimination
// banner fades in when someone is eliminated (§3.5). All state comes from `roomState` — no client-side timers or fake
// counts (§2 blacklist: never fake timers, never hardcoded vote counts).

import { type FC, useMemo, useState } from 'react';

import type { TranslateFn } from './sharedTypes';
import type { RoomPublicState } from '../types';
import { getSocket, castVote } from '../api/socket';
import { AvatarImage } from './AvatarImage';

export interface VotingScreenProps {
  t: TranslateFn;
  roomState: RoomPublicState;
  onLeave: () => void;
}

/** The two voting sub-steps (§3.5): active voting, then the server-tallied results view. */
type VoteStep = 'voting' | 'vote_results';

/** Format the server-authoritative voting countdown as M:SS for the top bar (§3.5). */
function formatVoteTimer(seconds?: number): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export const VotingScreen: FC<VotingScreenProps> = ({ t, roomState, onLeave }) => {
  // §3.5 — results flow authoritatively through `roomState` (phase === 'vote_results'); everything else is active voting.
  const step: VoteStep = roomState.phase === 'vote_results' ? 'vote_results' : 'voting';
  const selfId = roomState.selfPlayerId;
  const players = roomState.players;

  // Authoritative per-player vote counts (§3.5 — count only, never who voted for whom).
  const votesByPlayer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const card of roomState.voteResults ?? []) map[card.playerId] = card.votesReceived;
    return map;
  }, [roomState.voteResults]);

  // §2 — once THIS client has cast a vote or skipped, hide every Vote button + the Skip button so they cannot click
  // anything else while waiting for others. The server additionally enforces at-most-one vote per round (§3.5).
  const [hasVoted, setHasVoted] = useState(false);

  const handleVote = (targetPlayerId: string) => {
    if (step !== 'voting' || targetPlayerId === selfId) return; // can't vote for yourself (§3.5)
    setHasVoted(true); // hide our controls immediately (§2); server rejects any duplicate anyway
    getSocket().emit('castVote', { targetPlayerId });
  };

  const handleSkip = () => {
    if (step !== 'voting') return;
    setHasVoted(true); // hide our controls immediately (§2); server rejects any duplicate anyway
    getSocket().emit('castVote', { skip: true });
  };

  // §3.5 — the elimination banner text is derived from the authoritative `eliminatedPlayerId` (always an ordinary player).
  let bannerText = '';
  if (step === 'vote_results') {
    const eliminated = players.find((p) => p.playerId === roomState.eliminatedPlayerId);
    bannerText = eliminated ? t('voting.eliminated', { alias: eliminated.alias }) : t('voting.noOneEliminated');
  }

  return (
    <section id="screen-voting" className="screen voting-screen is-active">
      <header className="voting-topbar">
        <span>{t('voting.timerLabel', { time: formatVoteTimer(roomState.votingTimeRemainingSec) })}</span>
        <button type="button" className="leave-btn" onClick={onLeave}>{t('lobby.leave')}</button>
      </header>

      <div className="voting-grid">
        {players.map((player) => {
          const isSelf = player.playerId === selfId;
          const eliminated = player.isEliminated;
          // §3.5 — only eligible OTHER, non-eliminated players get a live Vote button during active voting; self and
          // spectators show nothing until the tally turns every pill into a count badge.
          // §2 — once this client has voted/skipped, hide ALL vote buttons (canVote is false everywhere) so no further
          // clicks are possible while waiting for others to finish.
          const canVote = step === 'voting' && !eliminated && !isSelf && !hasVoted;

          return (
            <div key={player.playerId} className={`vote-card${eliminated ? ' is-eliminated' : ''}`}>
              <div className="player-info">
                <AvatarImage
                  avatarId={player.avatarId}
                  className="player-avatar"
                  style={{ opacity: eliminated ? 0.5 : 1 }}
                />
                <span className="player-name">{player.alias}</span>
              </div>

              {canVote ? (
                <button
                  type="button"
                  className="vote-action-pill"
                  onClick={() => handleVote(player.playerId)}
                >
                  {t('voting.vote')}
                </button>
              ) : step === 'vote_results' ? (
                // §3.5 — every participant's pill becomes a numerical count badge (including self + the eliminated player).
                <span className="vote-action-pill" aria-label={t('voting.votesReceived', { alias: player.alias, count: votesByPlayer[player.playerId] ?? 0 })}>
                  {votesByPlayer[player.playerId] ?? 0}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* §3.5 — the Skip button is available only during active voting; it hides once votes are tallied.
          §2 — it also disappears as soon as this client has voted/skipped so no further action is possible. */}
      {step === 'voting' && !hasVoted ? (
        <button type="button" className="skip-vote-btn" onClick={handleSkip}>{t('voting.skip')}</button>
      ) : null}

      {/* §3.5 — the elimination banner fades in during results: a named player, or the no-elimination notice. */}
      {step === 'vote_results' ? (
        <div className="elimination-banner is-visible">{bannerText}</div>
      ) : null}
    </section>
  );
};
