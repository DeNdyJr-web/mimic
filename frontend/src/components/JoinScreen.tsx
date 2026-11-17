// Screen 2 — Join Lobby (§3.2). Ported markup/CSS from `MIMIC Prototype.html`; all visible text routed through t().

import { type FC, type FormEvent, useState } from 'react';

import type { TranslateFn } from './sharedTypes';
import type { RoomListItem } from '../types';

export interface JoinProps {
  t: TranslateFn;
  rooms: RoomListItem[];
  onBack: () => void;
  onJoinByCode: (code: string) => void;
  onRefresh: () => void;
}

/**
 * Join Lobby screen: code input + real "Join" button, an `or` divider, and a scrollable "Find a lobby" list fed by
 * the server's active-room registry. The refresh button toggles `.is-spinning` so its icon spins (§3.2).
 */
export const JoinScreen: FC<JoinProps> = ({ t, rooms, onBack, onJoinByCode, onRefresh }) => {
  const [code, setCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  /** Case-insensitive 5-char lookup happens server-side (§3.2); trim + uppercase here so the input mirrors intent. */
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return; // client-side guard — also surfaced via t('join.noCodeError') downstream
    onJoinByCode(trimmed);
  };

  /** Fetch active rooms and spin the refresh icon for a short, visible duration (§3.2). */
  const handleRefresh = () => {
    if (refreshing) return;
    setRefreshing(true);
    onRefresh();
    setTimeout(() => setRefreshing(false), 460);
  };

  return (
    <section id="screen-join" className="screen sub-screen is-active">
      <button type="button" className="back-btn" onClick={onBack}>
        {t('join.back')}
      </button>
      <h2 className="sub-title">{t('join.title')}</h2>

      <form className="join-code-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="dark-input join-code-input"
          placeholder={t('join.codePlaceholder')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          aria-label={t('join.codePlaceholder')}
        />
        <button type="submit" className="rect-action-btn join-code-btn">
          {t('join.joinButton')}
        </button>
      </form>

      <div className="or-divider">
        <span className="or-line" />
        <span>{t('join.or')}</span>
        <span className="or-line" />
      </div>

      <div className="panel-card">
        <div className="card-header">
          <h3 className="card-title">{t('join.findLobby')}</h3>
          <button
            type="button"
            className={`circle-icon-btn refresh-btn${refreshing ? ' is-spinning' : ''}`}
            aria-label={t('join.refresh')}
            onClick={handleRefresh}
          >
            <svg className="refresh-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 0 0-15.36-6.36L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 15.36 6.36L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
        </div>
        <div className="lobby-list-scroll">
          {rooms.length === 0 ? (
            <p className="lobby-empty">{t('join.empty')}</p>
          ) : (
            rooms.map((room) => (
              <div key={room.lobbyCode} className="lobby-list-row">
                <div className="lobby-name-pill">{room.lobbyName}</div>
                <button
                  type="button"
                  className="lobby-row-join-btn"
                  onClick={() => onJoinByCode(room.lobbyCode)}
                >
                  {t('join.joinButton')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
