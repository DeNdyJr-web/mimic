# PROJECT: MIMIC — Multiplayer Social Deduction Game

**This document is the single source of truth for building and maintaining Mimic.**

You are a senior full-stack developer, UI/UX engineer, and software architect. Build and maintain **Mimic**, a responsive LAN multiplayer social deduction web application with real-time Socket.IO communication, room management, voting, and strict server-authoritative game logic.

---

# 1. TECHNICAL ARCHITECTURE & REPOSITORY RULES

### Repository Starting State & Asset Preservation
- **Project Root:** Contains `README.md`, `HANDOFF.md`, and `MIMIC Prototype.html`.
- **`backend/` (Currently Empty):** Initialize the Node.js + Express + TypeScript + Socket.IO server here from scratch.
- **`frontend/` (Contains `public/favicon.svg` and `public/avatars/`):** Scaffold the Vite + React + TypeScript app around the existing `public/` directory **without deleting, moving, or overwriting `frontend/public/avatars/`, `frontend/public/favicon.svg`, or the root `README.md`**.
- **Manual Scaffolding Only:** Do **not** run interactive CLI generators (such as `npm create vite`) that may hang on prompts or overwrite `frontend/public/`. Create `package.json`, `tsconfig.json`, `vite.config.ts`, and `index.html` directly.
- Link `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` inside `frontend/index.html`.

### Ports, Networking & LAN Requirements
- **Backend Server (`backend/`):** Runs on port **`3000`**, listening on **`0.0.0.0`**. In production, serves the built `frontend/dist` static files and prints the host machine's local LAN IPv4 URL (`http://<LAN-IP>:3000`) on startup.
- **Frontend Dev Server (`frontend/`):** Vite runs on fixed port **`5175`** with **`strictPort: true`** (if `5175` is occupied, Vite must fail with an error rather than silently switching to `5176`). Configure `vite.config.ts` to proxy `/socket.io` (with `ws: true`) to `http://localhost:3000`.
- **Zero External Dependencies at Runtime:** No database, accounts, registration, or external cloud APIs.
- **Shared Event Contracts:** Define identical typed Socket.IO interfaces (`ClientToServerEvents`, `ServerToClientEvents`, `RoomPublicState`) in both `backend/src/types.ts` and `frontend/src/types.ts` before implementing handlers or UI.

### Server Authority & Privacy (Non-Negotiable)
- The server is 100% authoritative for roles, targets, timers, chat validation, votes, eliminations, and win conditions.
- **Never** broadcast the full internal game state to all clients. Send each client only the data they are authorized to see.
- **Never** reveal who the Mimic is (or whether an eliminated player was the Mimic) during any round, voting result, elimination banner, or spectator state. Reveal the Mimic only on the final End-of-Game screen.

---

# 2. VISUAL SOURCE OF TRUTH (`MIMIC Prototype.html`)

`MIMIC Prototype.html` (located in the project root) is the exact visual reference for layout, dimensions, colors, typography, borders, radii, and transitions.

### CSS & Behavior Preservation Rules
1. **Preserve Prototype CSS:** Reuse the exact CSS rules, class structures, dimensions, border radii, and transitions from `MIMIC Prototype.html`. Do not redesign the UI or introduce an external component library.
2. **Do Not Copy Prototype `<script>`:** Prototype JavaScript only simulates screens, fake timers, and bot replies. Implement all UI state in React and drive all room/game state via real Socket.IO events.
3. **Blacklist of Prototype Demo Shortcuts (Never Implement):**
   - Do **not** copy fake players, simulated chat replies, or hardcoded vote counts (`1, 1, 2, 0`).
   - Do **not** allow clicking the role card (`role-status-card`) to toggle between Mimic and ordinary player.
   - Do **not** trigger round start or voting by clicking top-bar labels (`<N> players`, `<Lobby name>`), submitting an empty chat message, or typing `/start` / `/vote`.
   - Do **not** advance the end-of-game reveal screen on user click; drive all stage transitions strictly from server Socket.IO events.

### Theme System & Exact CSS Design Tokens
Support `System`, `Dark`, and `Light` in Settings by setting `data-theme="dark"` or `data-theme="light"` on `document.documentElement` (resolving `System` via `window.matchMedia("(prefers-color-scheme: dark)")`).

**Dark Theme (Exact `:root` tokens from `MIMIC Prototype.html`):**
```css
:root,
[data-theme="dark"] {
  --bg-canvas: #141414;
  --bg-sidebar: #1f1f1f;
  --border-subtle: #333333;
  --surface-card: #525252;
  --surface-card-border: #6e6e6e;
  --surface-divider: #666666;
  --surface-player: #4d4d4d;
  --surface-player-eliminated: #292929;
  --surface-role-card: #2b2b2b;
  --btn-primary: #525252;
  --btn-secondary: #6e6e6e;
  --btn-hover: #a6a6a6;
  --btn-active: #a6a6a6;
  --dropdown-trigger-bg: #666666;
  --dropdown-trigger-border: #8e8e8e;
  --dropdown-menu-bg: #383838;
  --dropdown-item-bg: #545454;
  --dropdown-item-hover: #757575;
  --input-border: #787878;
  --chat-bar-bg: #242424;
  --chat-bubble-other: #242424;
  --chat-bubble-self: #4d4d4d;
  --text-title: #d6d6d6;
  --text-primary: #ffffff;
  --text-muted: #a3a3a3;
  --text-eliminated: #666666;
  --text-placeholder: #787878;
  --text-footer: #5c5c5c;
  --avatar-black: #000000;
  --avatar-red: #f22b29;
  --avatar-cyan: #0095b6;
  --avatar-green: #00b853;
  --avatar-blue: #1505b5;
  --avatar-purple: #6a21f3;
  --avatar-orange: #f56014;
  --avatar-yellow: #f5d742;
  --avatar-lavender: #c668e6;
  --avatar-skyblue: #38a3f5;
  --avatar-lime: #b6f558;
  --avatar-white: #ffffff;
  --transition-fast: 150ms cubic-bezier(0.22, 1, 0.36, 1);
  --transition-smooth: 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

**Light Theme (Monochrome counterpart matching prototype contrast and hierarchy):**
```css
[data-theme="light"] {
  --bg-canvas: #f5f5f5;
  --bg-sidebar: #eaeaea;
  --border-subtle: #d4d4d4;
  --surface-card: #ffffff;
  --surface-card-border: #cccccc;
  --surface-divider: #d6d6d6;
  --surface-player: #e2e2e2;
  --surface-player-eliminated: #efefef;
  --surface-role-card: #dcdcdc;
  --btn-primary: #dcdcdc;
  --btn-secondary: #cfcfcf;
  --btn-hover: #b5b5b5;
  --btn-active: #a8a8a8;
  --dropdown-trigger-bg: #e0e0e0;
  --dropdown-trigger-border: #bdbdbd;
  --dropdown-menu-bg: #ffffff;
  --dropdown-item-bg: #eeeeee;
  --dropdown-item-hover: #dcdcdc;
  --input-border: #b0b0b0;
  --chat-bar-bg: #e6e6e6;
  --chat-bubble-other: #e4e4e4;
  --chat-bubble-self: #cfcfcf;
  --text-title: #1f1f1f;
  --text-primary: #141414;
  --text-muted: #5c5c5c;
  --text-eliminated: #9e9e9e;
  --text-placeholder: #8a8a8a;
  --text-footer: #757575;
}
```
*(Ensure `.modal-backdrop` and `.footer-link:hover` also use theme-aware variables rather than hardcoded dark hex values).*

### Prototype CSS & HTML Section Map
When porting each screen, read the corresponding section directly from `MIMIC Prototype.html`:
- **Base & Screen Transitions:** `.screen` (`position: fixed; inset: 0`), `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif`.
- **Screen 1 — Home & Modals:** `.home-screen`, `.home-title` (`MIMIC`), `.home-menu`, `.pill-btn`, `.home-footer`, `.modal-backdrop`, `.modal-card` (`width: min(520px, 90vw); height: 465px; border-radius: 36px`), `.dropdown-wrapper`, `.dropdown-menu`.
- **Screen 2 — Join Lobby:** `.sub-screen`, `.back-btn`, `.sub-title`, `.join-code-row`, `.dark-input`, `.or-divider`, `.panel-card` (`width: min(655px, 90vw); border-radius: 36px`), `.lobby-list-scroll`, `.lobby-list-row`.
- **Screen 3 — Create Lobby:** `.create-name-input`, `.default-pill-btn`, `.duration-grid`, `.duration-btn` (`38x36px`), `.toggle-row`, `.toggle-pill-btn`, `.toggle-help-list`, `.card-bottom-note`, `.create-submit-btn`.
- **Screen 4 — Lobby & Active Game Workspace:** `.lobby-screen`, `.lobby-topbar` (`height: 58px`), `.lobby-workspace`, `.lobby-sidebar` (`width: clamp(340px, 28.5vw, 548px)`), `.player-card` (`height: 76px; border-radius: 18px`), `.player-avatar` (`58x58px`), `.mod-btn` (`96x42px`), `.copied-toast`, `.sidebar-footer` (`height: 98px`), `.lobby-code-btn`, `.role-status-card`, `.self-footer-avatar` (`62x62px`), `.lobby-chat-area`, `.chat-messages`, `.chat-bubble-row`, `.chat-bubble`, `.chat-input-bar` (`height: 56px`).
- **Screen 5 — Voting & Elimination:** `.voting-screen`, `.voting-topbar` (`height: 58px`), `.voting-grid` (`grid-template-columns: repeat(2, 1fr)`), `.vote-card` (`height: 76px; border-radius: 18px`), `.vote-action-pill` (`96x42px`), `.skip-vote-btn`, `.elimination-banner`.
- **Screen 6 — End-of-Game Reveal:** `.reveal-screen`, `.reveal-heading`, `.reveal-card` (`border-radius: 26px`), `.reveal-avatar`, `.reveal-name`.
- **Responsive Breakpoint (`@media (max-width: 960px)`):** Sidebar narrows to `320px`, `.mod-btn` shrinks to `68x36px`, `.voting-grid` collapses to `1fr`. Ensure zero horizontal overflow and touch-friendly inputs on mobile screens.

---

# 3. SCREEN-BY-SCREEN UI & FUNCTIONAL SPECIFICATION

## 3.1. Home Screen (`#screen-home`) & Modals
- **Center layout:** Large `MIMIC` title above 3 stacked pill buttons (`.pill-btn`, `418px` max-width, `42px` height):
  1. `Join Lobby` -> navigates to Join Lobby screen.
  2. `Create Lobby` -> navigates to Create Lobby screen.
  3. `Settings` -> opens Settings modal.
- **Footer (`.home-footer`):**
  - Left group: `about` (opens About modal), `github` (external link to `https://github.com/DeNdyJr-web/mimic/tree/main`).
  - Right group: `credits` (opens Credits modal), `versions` (opens Versions modal).
- **Modals (`.modal-card`):** Close via circular `×` button (`.circle-icon-btn`), backdrop click, or `Escape` key.
  - **Settings:** Custom dropdowns for `Theme` (`System`, `Dark`, `Light`) and `Language` (`English (US)`, `English (UK)`, `Русский`, `Українська`, `Español`, `Deutsch`). Persist UI preferences in `localStorage` and apply immediately. Default language: `English (US)`.
  - **About / Credits / Versions:** Display localized project info, contributor credits, and version history.

## 3.2. Join Lobby Screen (`#screen-join`)
- Fixed top-left `Back` pill button (`.back-btn`) -> returns to Home.
- Title: `Join Lobby`.
- **Join by code:** Centered row with text input (`placeholder="Enter a code..."`) and `Join` button (`.join-code-btn`). Case-insensitive 5-character code lookup on server.
- **Divider:** Horizontal line with `or` centered between lines.
- **Find a lobby card (`.panel-card`):**
  - Header: `Find a lobby` on left + circular refresh button (`.refresh-btn`, spins `360deg` on click) on right to fetch active rooms on the current host server.
  - Scrollable list of available rooms showing lobby name (and player count if helpful without breaking `.lobby-name-pill` layout) + `Join` button per row. Handle loading and empty states cleanly.
- No real-name input is required; the server assigns public aliases and avatars automatically upon joining.

## 3.3. Create Lobby Screen (`#screen-create`)
- Fixed top-left `Back` pill button (`.back-btn`) -> returns to Home.
- Title: `Create Lobby`.
- **Lobby Name input:** `.dark-input.create-name-input` with `placeholder="Enter lobby name..."` (trim whitespace, validate length on server, allow Unicode/Cyrillic/Latin).
- **Game settings card (`.panel-card`):**
  - Header: `Game settings` on left + `Default` pill button on right (resets form values to `5` minutes and `OFF` without creating a room).
  - **Round duration (minutes):** Row of 10 discrete buttons `1` through `10` (`.duration-btn`, default selected: `5`).
  - **Change Mimic target:** Two pill buttons `ON` and `OFF` (`.toggle-pill-btn`, default selected: `OFF`), with two helper lines below:
    - `ON` — `New target each round`
    - `OFF` — `Keep the previous target if it's still valid`
  - **Footer note:** `You will not be able to change the settings after creating a lobby.`
- **Bottom action:** Full-width `Create` button (`.create-submit-btn`) -> creates room on server, sets creator as host, generates unique 5-char room code (excluding ambiguous `0/O`, `1/I`), and enters the Lobby screen.

## 3.4. Lobby & Active Round Workspace (`#screen-lobby`)
Shared split-screen workspace with a `58px` top bar, left sidebar (`340px–548px`), and right chat area.

### Top Bar (`.lobby-topbar`)
- **Lobby state:**
  - Left: `List of players` and `<N> players`.
  - Right: `<Lobby name>` and `Leave` pill button (`.leave-btn`).
- **Active Round state:**
  - Left: `List of players` only (player count hidden).
  - Right: Synchronized countdown `<Timer>` (e.g., `4:59`) and `Leave` pill button.

### Left Sidebar (`.lobby-sidebar`)
- **Player List (`.player-list`):** Vertical stack of `.player-card` items (`76px` height, `18px` radius), each with a `58px` circular avatar and bold alias:
  - Current player is labeled `<Alias> (you)` (or `<Alias> (you) (host)` if host).
  - Other players see `<HostAlias> (host)` next to the administrator.
  - **Host moderation in Lobby:** Host sees `Kick` and `Ban` buttons (`.mod-btn`) on every other player's card.
    - `Kick`: removes player from room (they can rejoin if they have the room code).
    - `Ban`: removes player and adds their **`sessionToken`** to the room's `bannedSessionTokens` set so they cannot rejoin that room. **Never ban by IP address** (in LAN games, multiple players share the same router/IP).
  - **Host Start control:** Render a clear `Start` button for the host in the Lobby (using existing `.lobby-code-btn` / `.leave-btn` pill styling, e.g., inside the sidebar footer next to the lobby code or in the top bar). Starting requires **at least 3 connected players**; if `< 3`, prevent start and show a localized warning.
  - **Eliminated players in Active Round:** Remain visible in the list with `.is-eliminated` (`background-color: var(--surface-player-eliminated)`, text color `var(--text-eliminated)`, dimmed avatar).
- **Sidebar Toast Slot (`.sidebar-toast-slot`):**
  - Displays `.copied-toast` (`The code has been copied!` + `×` dismiss button) above the footer when the user clicks the lobby code button.
- **Sidebar Footer (`.sidebar-footer`, `98px` height):**
  - **Lobby state:** Pill button displaying `<Lobby code>` (copies code to clipboard on click) + (for host) `Start` button + current player's `62px` circular avatar on right.
  - **Active Round state:** Role card (`.role-status-card`, `border-radius: 14px`) on left + current player's `62px` circular avatar on right:
    - **If Mimic:** Two lines:
      `You are ` + underlined `mimic`
      `Your target is ` + underlined `<TargetAlias>`
    - **If Ordinary Player:** Single line: `Find mimic` (never receives or renders target info).

### Right Chat Area (`.lobby-chat-area`)
- **Message List (`.chat-messages`):**
  - **Player messages (`.chat-bubble-row`):** `48px` circular avatar on left + rounded pill bubble (`.chat-bubble`, `border-radius: 24px`, or `28px` when multiline). Other players' bubbles use `var(--chat-bubble-other)`; self bubbles use `var(--chat-bubble-self)` (`.is-self`). Render only the avatar and message text inside bubbles (no timestamps or duplicate name headers).
  - **System notices (`.chat-system-notice`):** Centered plain text (`16px`), e.g., `<Alias> joined the game`, `<Alias> left the game`, `<Alias> has been kicked`, `<Alias> has been banned`.
  - **Smart auto-scroll:** Auto-scroll to bottom when near bottom; if scrolled up to read history, do not force-scroll, and show an unobtrusive "scroll to bottom" button until scrolled back down.
- **Input Bar (`.chat-input-bar`, `56px` height):** Rounded pill input (`placeholder="Write a message..."`) + circular right-arrow send button (`38px`). Enter sends on desktop; reject empty/whitespace-only messages; enforce max length (e.g., 500 chars). Disabled/hidden for eliminated spectators during active rounds.

## 3.5. Voting & Elimination Screen (`#screen-voting`)
When the round timer reaches `0:00`, the server stops chat and transitions all clients to `#screen-voting` (chat and sidebar are completely hidden).
- **Top Bar (`.voting-topbar`):** Synchronized `<Voting timer>` (fixed **1 minute / `1:00`**) on left + `Leave` button on right.
- **2-Column Player Grid (`.voting-grid`):**
  - Renders cards (`.vote-card`) for participants.
  - During active voting (`vote` step): each eligible target has a `Vote` pill button (`.vote-action-pill`). Hide or disable the `Vote` button on the current player's own card and on already-eliminated spectators. Selected vote highlights with `.is-voted`. Votes cannot be changed once submitted.
  - Bottom-right `Skip` pill button (`.skip-vote-btn`) lets an eligible active player skip voting.
  - Eliminated spectators can view the voting screen but cannot vote or skip.
- **Voting End (`0:00` or all eligible active players have voted):**
  1. Server locks votes and calculates tally (disconnects do not stall voting).
  2. `Skip` button hides (`.is-hidden`).
  3. All `Vote` buttons transform into numerical vote-count badges (`.vote-action-pill` displaying `0`, `1`, `2`, etc. — never reveal who voted for whom).
  4. **Exact Vote & `Skip` Resolution Rules:**
     - `Skip` is counted as a distinct voting option alongside eligible players.
     - If `Skip` receives the most votes, **no one is eliminated**.
     - If `Skip` ties with one or more players for the highest vote count, **no one is eliminated**.
     - If two or more players tie for the highest vote count, **no one is eliminated**.
     - A player is eliminated **only** if they receive **strictly more votes than every other player AND strictly more votes than `Skip`**.
  5. **Elimination Banner:**
     - If a player is eliminated: their `.vote-card` transitions to `.is-eliminated`, and the bottom-center `.elimination-banner` fades in with `<Alias> was eliminated`.
     - If no one is eliminated: `.elimination-banner` displays a localized no-elimination notice (e.g., `No one was eliminated`).
     - **Never** reveal whether the eliminated player was the Mimic.

## 3.6. End-of-Game Reveal Screen (`#screen-reveal`)
Triggered strictly by the server when the final game-ending condition is met (never advanced by user click):
- **Stage 1 (Server-timed, ~2.5 seconds):** Centered heading `The mimic was...` above `.reveal-card` (`border-radius: 26px`) displaying the true Mimic's avatar and alias.
- **Stage 2 (Server-timed, ~3.5 seconds):** Heading updates to `You won!` (for the winning side) or `You lost!` (for the losing side), keeping the Mimic's card visible, after which the server transitions the room back to the Lobby state.

---

# 4. GAMEPLAY RULES, SPECTATORS & WIN CONDITIONS

### Fair Play Principle
Mimic is about imitating communication style, punctuation, phrasing, and habits — never private personal memories.

### Round Transitions & Spectator Mode
- After the elimination banner displays for a few seconds, if the game has not ended, the server starts the next round:
  - Resets the round timer to the room's configured duration.
  - Keeps already-eliminated players in the room as **spectators** (`.is-eliminated`).
  - If `Change Mimic target` is `ON`, picks a new random eligible active player (excluding the Mimic and eliminated players). If `OFF`, keeps the previous target unless that target was eliminated (in which case, pick a new eligible target).
- **Server-enforced Spectator Restrictions:** Eliminated players can watch chat, voting, and reveals, and remain visible in the player list, but the server must reject any attempt by them to send game chat messages, cast votes, receive votes, or be chosen as Mimic/target.

### Match End Triggers (checked after the fixed 4-second `vote_results` window)
The match advances to the `#screen-reveal` screen **ONLY** when at least one of these two conditions holds — evaluated by
`advanceAfterResults` → `roomManager.checkGameEnd` → `evaluateGameEnd`. Otherwise the server starts the next round
(`phase = 'round'`), resetting the timer and reassigning the Mimic's target per the `Change Mimic target` setting:
1. **Active roster depleted:** `activePlayers.length <= 2` (only 2 or fewer non-eliminated players remain active), OR
2. **Unanimous `Skip`:** every active non-eliminated player voted `Skip` in that voting round (they concluded the Mimic was already caught).

**There is no early termination based on eliminated-player count.** The match does NOT end when `eliminatedOrdinaryCount >= 2`,
and it does NOT end when the Mimic is eliminated — even in a 15-player lobby the game keeps going blindly round after round with
zero hints about whether the Mimic is still active or already eliminated. Ordinary players keep voting until only two remain (or
everyone unanimously Skips). Eliminated players stay in the room as greyed-out spectators (`.is-eliminated`) who can observe chat,
voting, and the final reveal; the server blocks them from sending chat messages or casting votes.

### Win Conditions (Calculated Server-Side)
The winner is decided **only when the match ends**, via `determineWinner` in `backend/src/config/gameRules.ts`, using a
size-scaled casualty cap:
- Store the room's `initialPlayerCount` at match start (`room.initialPlayerCount`).
- `maxAllowedOrdinaryEliminations = Math.max(1, Math.floor(initialPlayerCount / 3))`:
  - 3–5 players → max 1 ordinary casualty; 6–8 → max 2; 9–11 → max 3; 12–14 → max 4; 15 → max 5.
- **Ordinary players win (Mimic loses)** IF AND ONLY IF `mimicEliminated === true` AND `eliminatedOrdinaryCount <= maxAllowedOrdinaryEliminations`.
- **Mimic wins (Ordinary players lose)** in all other cases (`mimicEliminated === false` OR `eliminatedOrdinaryCount > maxAllowedOrdinaryEliminations`).

So a surviving Mimic always wins (Case C), and an eliminated Mimic only lets the village win when it took no more than the
size-scaled number of ordinary players with it; taking too many casualties flips the result to the Mimic.

### Configurable Edge-Case Rules (`backend/src/config/gameRules.ts`)
Keep these rules isolated in one server config file so they can be adjusted cleanly if needed:
1. **`KEEP_IDENTITIES_ACROSS_ROUNDS = true`:** Player aliases and avatars remain fixed for the entire match (do not re-randomize mid-game unless toggled).
2. **`MIN_ACTIVE_PLAYERS_TO_END = 2`:** The active-roster end trigger — the match ends when non-eliminated players drop to `<= 2`.
3. **`computeMaxAllowedOrdinaryEliminations(initialPlayerCount)`:** The size-scaled casualty cap used by the win formula (`Math.max(1, Math.floor(initialPlayerCount / 3))`). It bounds how many ordinary deaths an eliminated Mimic may cause and still lose — it is NOT an end trigger.

---

# 5. AVATARS, ALIASES & LOCALIZATION

### Avatar Assets (`frontend/public/avatars/`)
- Inspect `frontend/public/avatars/` during Step 1. All official avatars are lowercase animal `.jpg` files (e.g., `snake.jpg`, `fox.jpg`, `cat.jpg`).
- Create one centralized `AVATARS` map in `frontend/src/constants/avatars.ts` mapping every actual `.jpg` file in `frontend/public/avatars/` to `/avatars/<name>.jpg`. Do not reference missing files or external URLs.
- Server randomly assigns each player an available avatar ID and a unique animal/fun public alias (e.g., `Fox`, `Penguin`, `Slow Loris`, `Raccoon`, `dOG`, `Tiger`, `Capybara`, `Wholf`, `Turtle`).
- Keep the assigned avatar and alias consistent across every screen (player list, chat bubbles, voting cards, reveal card). If an image fails to load, render a circular fallback using the player's assigned `--avatar-*` CSS color.

### Manual JSON Localization (`frontend/src/locales/`)
- Never use runtime machine translation APIs or hardcode UI strings in components.
- Store translations in:
  - `en.json` (English US — default & fallback)
  - `en-GB.json` (English UK)
  - `ru.json` (Russian)
  - `uk.json` (Ukrainian)
  - `es.json` (Spanish)
  - `de.json` (German)
  - `template.json` (empty-value template for contributors)
  - `README.md` (contributor guide explaining key preservation and validation)
- Implement a single typed `t(key, params?)` helper that falls back to `en.json` and logs a dev warning if a key is missing.
- Add an npm script (`npm run validate:locales`) that recursively checks all locale JSON files against `en.json` for missing keys, extra keys, or type mismatches.

---

# 6. SESSION MANAGEMENT, RECONNECTION & SECURITY

- **Session Token Storage:** Store the player's `sessionToken` strictly in **`sessionStorage`** (so each browser tab acts as a distinct player during LAN testing, while still surviving page refreshes within that tab). Store UI preferences (`theme`, `language`) in `localStorage`.
- Reconnecting with an active `sessionToken` restores the player's room membership, role, alias, avatar, and elimination status within a grace window.
- Prevent duplicate concurrent sockets for the same `sessionToken`.
- If the host disconnects permanently, transfer host privileges to the next connected player.
- Clean up empty/abandoned rooms automatically.
- Validate all incoming Socket.IO payloads (types, string lengths, room membership, phase checks, vote eligibility) on the server.

---

# 7. GATED MILESTONE WORKFLOW (STOP FOR APPROVAL AFTER EACH STEP)

**CRITICAL EXECUTION RULE:** Execute **only one milestone at a time**. After completing a milestone, report what was implemented and verified, and **STOP and wait for the user's explicit approval** before starting the next milestone.

1. **Milestone 1 — Inspect & Scaffold:**
   - List all files in `frontend/public/avatars/`, verify `frontend/public/favicon.svg` and root `README.md` are intact, and initialize `package.json` + TypeScript configs in `backend/` (port `3000`) and `frontend/` (Vite port `5175`, `strictPort: true`, `/socket.io` proxy).
   - **STOP & REPORT.**
2. **Milestone 2 — Shared Types & Avatars:**
   - Create `backend/src/types.ts`, `frontend/src/types.ts`, `backend/src/config/gameRules.ts`, and `frontend/src/constants/avatars.ts` based on the actual files in `frontend/public/avatars/`.
   - **STOP & REPORT.**
3. **Milestone 3 — Localization System:**
   - Create `frontend/src/locales/*.json` (`en`, `en-GB`, `ru`, `uk`, `es`, `de`, `template`), `README.md`, typed `t()` helper, and `npm run validate:locales`.
   - **STOP & REPORT.**
4. **Milestone 4 — Visual Shell & Screens 1–3 (Home, Modals, Join, Create):**
   - Port CSS (both Dark and Light themes) and markup from `MIMIC Prototype.html` verbatim, wire Settings (`Theme` + `Language`), and connect room creation/listing/joining to the Socket.IO server.
   - **STOP & REPORT.**
5. **Milestone 5 — Screen 4 (Lobby & Active Round):**
   - Port sidebar, host moderation (`Kick`, `Ban` by `sessionToken`, `Start` with `>= 3` check), role card (`You are mimic` / `Find mimic`), and real-time Socket.IO chat with smart auto-scroll.
   - **STOP & REPORT.**
6. **Milestone 6 — Screens 5–6 (Voting, Elimination, Reveal) & Server Game Loop:**
   - Implement server-authoritative round/voting timers, secret vote tallying with exact `Skip`/tie rules, spectator restrictions, multi-round transitions, and server-timed End-of-Game reveal (`The mimic was...` -> `You won!` / `You lost!`).
   - **STOP & REPORT.**
7. **Milestone 7 — Build & Final Verification:**
   - Run TypeScript checks (`tsc --noEmit`), production builds (`frontend` and `backend`), and `npm run validate:locales`, and provide an honest verification report.

### Honest Reporting Standard
Always distinguish clearly between:
- **Implemented** (code written),
- **Build-tested** (`tsc` / `vite build` / server build passed),
- **Runtime/Multiplayer-tested** (verified in a running browser session with multiple clients),
- **Not tested** (not yet run).
