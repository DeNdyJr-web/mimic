// Root component for Mimic (Milestone 4). Owns screen routing, Socket.IO connection, theme + language persistence
// (§2, §6), and the per-tab session token (handled inside `api/socket.ts` via sessionStorage). Screens 1–3 plus a
// clean Lobby placeholder are wired here; the live lobby/voting/reveal workspace ships in Milestones 5–6.

import { type FC, useEffect, useMemo, useRef, useState } from 'react';

import { HomeScreen } from './components/HomeScreen';
import { Modals, type ModalKey } from './components/Modals';
import { JoinScreen } from './components/JoinScreen';
import { CreateScreen, type CreatePayload } from './components/CreateScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { VotingScreen } from './components/VotingScreen';
import { RevealScreen } from './components/RevealScreen';

import { i18n, type Lang } from './locales';
import { getStoredTheme, applyTheme, type ThemeMode } from './theme';
import { getSocket, createRoom, joinByCode, listRooms, leaveRoom } from './api/socket';
import type {
  ModerationAction,
  RoomPublicState,
  RoomListItem,
  ServerErrorCode,
  PlayerRolePayload,
  EndOfGameReveal,
} from './types';
import type { TranslateFn } from './components/sharedTypes';

/** Which full-screen view is currently mounted. Voting/reveal are driven by server phase + private events (§3.5/§3.6). */
type Screen = 'home' | 'join' | 'create' | 'lobby' | 'voting' | 'reveal';

/** Map a machine-readable server error code to its localized string (§7.4) — never surface raw codes to the user. */
function mapErrorCode(code: ServerErrorCode, t: TranslateFn): string {
  switch (code) {
    case 'INVALID_CODE':
      return t('errors.invalidCode');
    case 'ROOM_NOT_FOUND':
      return t('errors.roomNotFound');
    case 'GAME_STARTED':
      return t('errors.gameStarted');
    case 'NAME_TOO_SHORT':
      return t('errors.nameTooShort', { min: 1 });
    case 'NAME_TOO_LONG':
      return t('errors.tooLong', { max: 40 });
    case 'MIN_PLAYERS':
      return t('errors.minPlayers');
    case 'BANNED':
      return t('errors.banned');
    case 'ALIAS_INVALID':
      return t('errors.aliasInvalid');
    case 'INVALID_AVATAR':
      return t('errors.invalidAvatar');
    default:
      return t('errors.generic');
  }
}

export const App: FC = () => {
  // Theme + language are persisted to localStorage (§6) and drive re-renders so the UI updates live.
  const [theme, setThemeState] = useState<ThemeMode>(() => getStoredTheme());
  const [language, setLanguageState] = useState<Lang>(() => i18n.getLanguage());

  // Screen routing + modal state.
  const [screen, setScreen] = useState<Screen>('home');
  const [activeModal, setActiveModal] = useState<ModalKey | null>(null);

  // Server-driven data: active-room list for "Find a lobby", and the joined room's public state (placeholder view).
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomState, setRoomState] = useState<RoomPublicState | null>(null);

  // §3.4/§3.6 — the Mimic's private role/target (only ever delivered via the private `role` event) and the end-of-game
  // reveal payload (§3.6). Ordinary players never receive a role; these stay empty until/unless the server sends them.
  const [myRole, setMyRole] = useState<PlayerRolePayload | undefined>(undefined);
  const [revealState, setRevealState] = useState<EndOfGameReveal | null>(null);

  // Transient inline error shown on the Join/Create screens (§7.4).
  const [errorText, setErrorText] = useState<string | null>(null);

  // §1 — set when the host kicks/bans you; drives a dismissible banner that explains why and returns you home (§1). `banned`
  // also blocks rejoining this room until a fresh lobby is created.
  const [removalReason, setRemovalReason] = useState<ModerationAction | null>(null);

  /** Guards navigation to the lobby: we only enter it when OUR create/join request succeeds (not a peer's join). */
  const pendingRef = useRef<'create' | 'join' | null>(null);

  /** True once we've entered a room, so a non-pending `roomState` (reconnect/refresh) routes us back to the lobby (§6). */
  const joinedRef = useRef(false);

  /** §7 — tracks the live screen so we can detect a true game→lobby transition and clear stale per-match state. */
  const prevScreenRef = useRef<Screen>('home');

  // Apply theme on mount and whenever it changes; persist the choice (§2, §6).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // §7 — keep prevScreenRef in sync with the committed `screen` so game→lobby detection inside handleRoomState is accurate.
  useEffect(() => { prevScreenRef.current = screen; }, [screen]);

  /** Single stable translation function. Reads i18n live at call time, so language switches reflect immediately. */
  const t = useMemo<TranslateFn>(() => (key, params) => i18n.t(key, params), []);

  // Language switch: persist + update React state so every component re-renders with the new strings (§5).
  const handleSetLanguage = (lang: Lang) => {
    i18n.setLanguage(lang);
    setLanguageState(lang);
  };

  // Theme switch: apply immediately to <html> and persist (§2, §6).
  const handleSetTheme = (mode: ThemeMode) => {
    applyTheme(mode);
    setThemeState(mode);
  };

  // Socket.IO connection + event wiring (§3.2–§3.3, §6). Mount-only; handlers use updater functions / live t().
  useEffect(() => {
    const socket = getSocket();

    const handleRoomState = (state: RoomPublicState) => {
      setRoomState(state);
      // Only advance to the lobby when this state answers our own create/join request.
      if (pendingRef.current) {
        pendingRef.current = null;
        setErrorText(null);
        joinedRef.current = true;
        setScreen('lobby');
      } else if (joinedRef.current) {
        // Live phase transitions during play (and reconnect/refresh, §6): route by the authoritative server phase.
        const phase = state.phase;
        if (phase === 'voting' || phase === 'vote_results') setScreen('voting');
        else if (phase === 'reveal') setScreen('reveal');
        else {
          // lobby | round — LobbyScreen renders both, including the live role card.
          // §7 — the `reveal` -> `lobby` transition is the post-reveal rematch reset (§3.6): a match boundary. Clear any
          // stale per-match role/reveal so nothing leaks into the next game. (Note: `voting` -> `round` must NOT clear,
          // because beginNextRound re-emits a fresh private role for the Mimic — see engine/gameLogic.ts.)
          if (prevScreenRef.current === 'reveal') {
            setMyRole(undefined);
            setRevealState(null);
          }
          setScreen('lobby');
        }
      }
    };

    const handleRoomsList = (next: RoomListItem[]) => setRooms(next);

    const handleError = (err: { code: ServerErrorCode }) => {
      if (pendingRef.current) pendingRef.current = null;
      setErrorText(mapErrorCode(err.code, t));
    };

    // §3.4 — the private role event is delivered ONLY to the Mimic's socket; ordinary players never receive it.
    const handleRole = (payload: PlayerRolePayload) => setMyRole(payload);
    // §3.6 — end-of-game reveal is driven strictly by server events (never user click); show the reveal screen.
    const handleReveal = (next: EndOfGameReveal) => {
      setRevealState(next);
      setScreen('reveal');
    };

    socket.on('roomState', handleRoomState);
    socket.on('roomsList', handleRoomsList);
    socket.on('error', handleError);
    socket.on('role', handleRole);
    socket.on('reveal', handleReveal);
    // §6 — this tab was superseded by another tab holding the same sessionToken; return home (membership lives on).
    socket.on('sessionReplaced', () => {
      goHome();
      setErrorText(t('errors.sessionReplaced'));
    });

    // §1 — host kicked/banned you: reset room state, return home, and surface a dismissible banner naming the action (§1).
    const handleModerationAction = (payload: { action: ModerationAction }) => {
      goHome();
      setRemovalReason(payload.action);
    };

    socket.on('moderationAction', handleModerationAction);

    return () => {
      socket.off('roomState', handleRoomState);
      socket.off('roomsList', handleRoomsList);
      socket.off('error', handleError);
      socket.off('role', handleRole);
      socket.off('reveal', handleReveal);
      socket.off('sessionReplaced');
      socket.off('moderationAction', handleModerationAction);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — handlers are stable; t() reads i18n live

  const clearError = () => setErrorText(null);

  // §7 — drop any stale per-match role/reveal state so leaving a room or returning home never leaks the previous
  // match's private role into a fresh game (§3.6 rematch flow).
  const resetGameSession = () => {
    setMyRole(undefined);
    setRevealState(null);
  };

  /* ------------------------------------------------------------------ *
   * Navigation + action handlers                                        *
   * ------------------------------------------------------------------ */

  const goHome = () => {
    resetGameSession(); // §7 — drop stale role/reveal so a fresh match never inherits the previous one's private data.
    setActiveModal(null);
    setScreen('home');
    clearError();
  };

  // Screen entry points. Joining also primes the "Find a lobby" list (§3.2).
  const handleJoin = () => {
    setScreen('join');
    clearError();
    setRemovalReason(null); // §1 — starting a fresh lobby intent clears any prior kick/ban banner (§1)
    listRooms();
  };

  const handleCreate = () => {
    setScreen('create');
    clearError();
    setRemovalReason(null); // §1 — starting a fresh lobby intent clears any prior kick/ban banner (§1)
  };

  // Modals: open by key; the × / backdrop / Escape close is handled inside Modal.tsx.
  const openModal = (key: ModalKey) => setActiveModal(key);
  const closeModal = () => setActiveModal(null);

  // Create + Join emit to the server; navigation happens on success via `roomState` (§3.2–§3.3).
  const handleCreateSubmit = (payload: CreatePayload) => {
    clearError();
    pendingRef.current = 'create';
    createRoom(payload.lobbyName, payload.roundDurationMinutes, payload.changeMimicTarget);
  };

  const handleJoinByCode = (code: string) => {
    clearError();
    pendingRef.current = 'join';
    joinByCode(code);
  };

  const handleRefresh = () => listRooms();

  // Leave the room and return home (§6). Server cleans up membership + host hand-off.
  const handleLeave = () => {
    leaveRoom();
    resetGameSession(); // §7 — clear stale role/reveal when leaving (stops in-flight match state leaking home).
    pendingRef.current = null;
    joinedRef.current = false;
    setRoomState(null);
    setScreen('home');
  };

  /* ------------------------------------------------------------------ *
   * Render                                                              *
   * ------------------------------------------------------------------ */

  return (
    <>
      {screen === 'home' && (
        <HomeScreen
          t={t}
          onJoin={handleJoin}
          onCreate={handleCreate}
          onSettings={() => openModal('settings')}
          onAbout={() => openModal('about')}
          onCredits={() => openModal('credits')}
          onVersions={() => openModal('versions')}
        />
      )}

      {screen === 'join' && (
        <JoinScreen
          t={t}
          rooms={rooms}
          onBack={goHome}
          onJoinByCode={handleJoinByCode}
          onRefresh={handleRefresh}
        />
      )}

      {screen === 'create' && (
        <CreateScreen t={t} onBack={goHome} onCreate={handleCreateSubmit} />
      )}

      {screen === 'lobby' && roomState && (
        <LobbyScreen t={t} roomState={roomState} myRole={myRole} onLeave={handleLeave} />
      )}

      {screen === 'voting' && roomState && (
        <VotingScreen t={t} roomState={roomState} onLeave={handleLeave} />
      )}

      {screen === 'reveal' && revealState && (
        <RevealScreen t={t} reveal={revealState} />
      )}

      <Modals
        activeModal={activeModal}
        theme={theme}
        setTheme={handleSetTheme}
        language={language}
        setLanguage={handleSetLanguage}
        t={t}
        onClose={closeModal}
      />

      {errorText && <div className="error-toast is-visible">{errorText}</div>}

      {/* §1 — dismissible banner shown when the host kicks/bans you; explains why and returns you home (§1). */}
      {removalReason && (
        <div className="removal-banner is-visible" role="status" aria-live="polite">
          <span className="removal-banner-text">{t(`errors.${removalReason}`)}</span>
          <button
            type="button"
            className="circle-icon-btn removal-banner-close"
            aria-label={t('lobby.copyClose')}
            onClick={() => setRemovalReason(null)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
};
